#!/bin/bash

# AnythingExtract Docker 管理脚本
# 参考 QAnything/run.sh，支持 Linux / macOS / Windows(WSL) 三平台

echo "=========================================="
echo "AnythingExtract Docker 启动"
echo "=========================================="
echo ""

# -------- 工具函数 --------

# 更新或追加键值对到 .env.docker 文件
update_or_append_to_env() {
    local key=$1
    local value=$2
    local env_file=".env.docker"

    if [ ! -f "$env_file" ]; then
        touch "$env_file"
    fi

    sed -i'' -e '$a\' "$env_file" 2>/dev/null || true

    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "/^${key}=/c\\
${key}=${value}" "$env_file"
        else
            sed -i "/^${key}=/c\\${key}=${value}" "$env_file"
        fi
    else
        echo "${key}=${value}" >> "$env_file"
    fi
}

# 检测支持的 Docker Compose 命令
detect_docker_compose() {
    if docker compose version &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif docker-compose version &>/dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        echo "错误：未找到 'docker compose' 或 'docker-compose' 命令。"
        echo "请安装 Docker Desktop 或 Docker Compose v2："
        echo "  - Windows/Mac: https://www.docker.com/products/docker-desktop"
        echo "  - Linux: https://docs.docker.com/compose/install/"
        exit 1
    fi
    echo "Docker Compose 命令: $DOCKER_COMPOSE_CMD"
}

# 检测平台
detect_platform() {
    if [ -e /proc/version ]; then
        if grep -qi microsoft /proc/version; then
            PLATFORM="windows"
            COMPOSE_FILE="docker-compose-win.yaml"
            echo "检测到平台: Windows (WSL)"
        else
            PLATFORM="linux"
            COMPOSE_FILE="docker-compose-linux.yaml"
            echo "检测到平台: Linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="mac"
        COMPOSE_FILE="docker-compose-mac.yaml"
        echo "检测到平台: macOS"
    else
        PLATFORM="linux"
        COMPOSE_FILE="docker-compose-linux.yaml"
        echo "无法自动检测平台，默认使用 Linux 配置"
    fi
}

# -------- 参数解析 --------

WITH_MODELS=0
WITH_OLLAMA=0
BUILD=0
DOWN=0
DETACH=0

usage() {
    echo "Usage: $0 [选项]"
    echo ""
    echo "选项："
    echo "  --with-models        启用 QAnything OCR/PDF 模型服务（需要 xixihahaliu01/qanything-* 镜像）"
    echo "  --with-ollama        将 Ollama 作为 Docker 服务启动（完全容器化）"
    echo "  --build              强制重新构建镜像"
    echo "  --detach, -d         后台运行"
    echo "  --down               停止并移除容器"
    echo "  --full               启用全部可选服务（等同于 --with-models --with-ollama）"
    echo "  -h, --help           显示帮助"
    echo ""
    echo "示例："
    echo "  ./docker_run.sh                  # 仅启动后端 + 前端"
    echo "  ./docker_run.sh --with-models    # 启动后端 + 前端 + QAnything OCR/PDF 服务"
    echo "  ./docker_run.sh --with-ollama    # 启动后端 + 前端 + Ollama 容器"
    echo "  ./docker_run.sh --full           # 启动全部服务"
    echo "  ./docker_run.sh --down           # 停止所有容器"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        --with-models)   WITH_MODELS=1 ;;
        --with-ollama)   WITH_OLLAMA=1 ;;
        --build)         BUILD=1 ;;
        --detach|-d)     DETACH=1 ;;
        --down)          DOWN=1 ;;
        --full)          WITH_MODELS=1; WITH_OLLAMA=1 ;;
        -h|--help)       usage ;;
        *)
            echo "未知选项: $arg"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# -------- 前置检查 --------

detect_docker_compose
detect_platform

# 确认 Docker 运行中
if ! docker info &>/dev/null; then
    echo "错误：Docker 未运行，请先启动 Docker Desktop 或 Docker 守护进程。"
    exit 1
fi

# -------- 组装 profiles --------

PROFILES=""
if [ $WITH_MODELS -eq 1 ] && [ $WITH_OLLAMA -eq 1 ]; then
    PROFILES="--profile full"
elif [ $WITH_MODELS -eq 1 ]; then
    PROFILES="--profile models"
elif [ $WITH_OLLAMA -eq 1 ]; then
    PROFILES="--profile ollama"
fi

# -------- 停止操作 --------

if [ $DOWN -eq 1 ]; then
    echo "停止并移除容器..."
    $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" $PROFILES down
    echo "容器已停止。"
    exit 0
fi

# -------- Ollama 模式配置 --------

if [ $WITH_OLLAMA -eq 1 ]; then
    echo ""
    echo "Ollama 将作为 Docker 容器运行。"
    if [ "$PLATFORM" = "linux" ]; then
        update_or_append_to_env "OLLAMA_BASE_URL" "http://localhost:11434"
    else
        update_or_append_to_env "OLLAMA_BASE_URL" "http://ollama:11434"
    fi
    echo "Ollama 服务地址已配置。"
else
    # Ollama 运行在宿主机
    if [ "$PLATFORM" = "linux" ]; then
        update_or_append_to_env "OLLAMA_BASE_URL" "http://localhost:11434"
    else
        update_or_append_to_env "OLLAMA_BASE_URL" "http://host.docker.internal:11434"
        echo "Ollama 预期运行在宿主机端口 11434。"
        echo "如 Ollama 未运行，AI 功能将不可用（可使用 --with-ollama 改为容器化运行）。"
    fi
fi

# -------- QAnything 模型服务配置 --------

if [ $WITH_MODELS -eq 1 ]; then
    echo ""
    echo "启用 OCR/PDF 模型服务..."
    # 检查本地 dependent_server 目录（代码已内置，无需外部 QAnything 目录）
    if [ ! -d "dependent_server/ocr_server" ] || [ ! -d "dependent_server/pdf_parser_server" ]; then
        echo "警告：未找到 dependent_server/ 目录，模型服务无法启动。"
        echo "      请确保在 anything-extract 项目根目录下执行此脚本。"
        echo "      继续启动主服务..."
        WITH_MODELS=0
        PROFILES="${PROFILES//--profile models/}"
        PROFILES="${PROFILES//--profile full/}"
    else
        update_or_append_to_env "ENABLE_OCR_SERVER" "true"
        update_or_append_to_env "ENABLE_PDF_PARSER_SERVER" "true"
        update_or_append_to_env "PARSER_MODE" "hybrid"
        echo "OCR/PDF 模型服务将在 7001(OCR) 和 9009(PDF) 端口上启动。"
        echo "  代码: ./dependent_server/  模型: xixihahaliu01/qanything-{platform} 镜像内 /root/models"
    fi
fi

echo ""

# -------- 构建镜像 --------

BUILD_FLAGS=""
if [ $BUILD -eq 1 ]; then
    echo "重新构建镜像..."
    BUILD_FLAGS="--build"
fi

# -------- 启动服务 --------

echo "=========================================="
echo "启动服务（$COMPOSE_FILE）..."
if [ -n "$PROFILES" ]; then
    echo "已启用 Profiles: $PROFILES"
fi
echo "=========================================="

# 加载 .env.docker（如果存在）
ENV_FILE_ARGS=""
if [ -f ".env.docker" ]; then
    ENV_FILE_ARGS="--env-file .env.docker"
fi

if [ $DETACH -eq 1 ]; then
    $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" $ENV_FILE_ARGS $PROFILES up -d $BUILD_FLAGS
    echo ""
    echo "=========================================="
    echo "服务已在后台启动"
    echo "=========================================="
    echo ""
    echo "访问地址："
    echo "  前端:     http://localhost:3001"
    echo "  后端 API: http://localhost:8888"
    if [ $WITH_MODELS -eq 1 ]; then
        echo "  OCR:      http://localhost:7001/ocr"
        echo "  PDF:      http://localhost:9009/pdfparser"
    fi
    echo ""
    echo "查看日志: $DOCKER_COMPOSE_CMD -f $COMPOSE_FILE logs -f"
    echo "停止服务: ./docker_run.sh --down"
else
    $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" $ENV_FILE_ARGS $PROFILES up $BUILD_FLAGS
fi
