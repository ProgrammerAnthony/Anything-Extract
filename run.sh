#!/bin/bash

# AnythingExtract 一键运行脚本（自动检查并安装依赖，然后启动服务）

echo "=========================================="
echo "AnythingExtract 一键启动"
echo "=========================================="
echo ""

# 检查 Python
echo "检查 Python..."
WITH_INGEST_SERVER=1
INGEST_MODE="queue"
WITH_OCR_SERVER=0
WITH_PDF_SERVER=0
WITH_QANYTHING_MODELS_DOCKER=0
OCR_SERVER_URL_DEFAULT="http://127.0.0.1:7001"
PDF_SERVER_URL_DEFAULT="http://127.0.0.1:9009"

for arg in "$@"; do
    case "$arg" in
        --with-ingest-server|--with-queue)
            WITH_INGEST_SERVER=1
            ;;
        --without-ingest-server|--without-queue)
            WITH_INGEST_SERVER=0
            ;;
        --queue-mode)
            INGEST_MODE="queue"
            ;;
        --immediate-mode)
            INGEST_MODE="immediate"
            ;;
        --with-ocr-server)
            WITH_OCR_SERVER=1
            ;;
        --with-pdf-server)
            WITH_PDF_SERVER=1
            ;;
        --with-qanything-models-docker)
            WITH_QANYTHING_MODELS_DOCKER=1
            WITH_OCR_SERVER=1
            WITH_PDF_SERVER=1
            ;;
        -h|--help)
            echo "Usage: ./run.sh [--with-ingest-server|--without-ingest-server] [--queue-mode|--immediate-mode] [--with-ocr-server] [--with-pdf-server] [--with-qanything-models-docker]"
            echo ""
            echo "  --with-ingest-server / --with-queue       Start Stage 2 ingest worker (default)"
            echo "  --without-ingest-server / --without-queue Skip Stage 2 ingest worker"
            echo "  --queue-mode                               Upload defaults to queue mode (default)"
            echo "  --immediate-mode                           Upload defaults to immediate mode"
            echo "  --with-ocr-server                          Enable OCR server integration (Stage 3)"
            echo "  --with-pdf-server                          Enable PDF parser server integration (Stage 3)"
            echo "  --with-qanything-models-docker             Start QAnything model container (recommended for Stage 3)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help to view supported options"
            exit 1
            ;;
    esac
done

if [ "$WITH_INGEST_SERVER" -eq 0 ] && [ "$INGEST_MODE" = "queue" ]; then
    echo "[warn] ingest server is disabled, fallback to immediate mode to avoid queued backlog"
    INGEST_MODE="immediate"
fi

export INGEST_DEFAULT_MODE="$INGEST_MODE"
export ENABLE_OCR_SERVER="$WITH_OCR_SERVER"
export ENABLE_PDF_PARSER_SERVER="$WITH_PDF_SERVER"
export OCR_SERVER_URL="$OCR_SERVER_URL_DEFAULT"
export PDF_PARSER_SERVER_URL="$PDF_SERVER_URL_DEFAULT"
export PARSER_MODE="local"
export QANYTHING_MODEL_SOURCE="local-model"
if [ "$WITH_OCR_SERVER" -eq 1 ] || [ "$WITH_PDF_SERVER" -eq 1 ]; then
    export PARSER_MODE="hybrid"
fi
if [ "$WITH_QANYTHING_MODELS_DOCKER" -eq 1 ]; then
    export QANYTHING_MODEL_SOURCE="docker-model"
fi

echo "Upload default mode: $INGEST_DEFAULT_MODE"
if [ "$WITH_INGEST_SERVER" -eq 1 ]; then
    echo "Ingest server: enabled"
else
    echo "Ingest server: disabled"
fi
if [ "$WITH_OCR_SERVER" -eq 1 ]; then
    echo "OCR server integration: enabled ($OCR_SERVER_URL)"
else
    echo "OCR server integration: disabled"
fi
if [ "$WITH_PDF_SERVER" -eq 1 ]; then
    echo "PDF parser integration: enabled ($PDF_PARSER_SERVER_URL)"
else
    echo "PDF parser integration: disabled"
fi
if [ "$WITH_QANYTHING_MODELS_DOCKER" -eq 1 ]; then
    echo "QAnything model source: docker-model"
else
    echo "QAnything model source: local-model"
fi

PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python 3 未安装"
    echo "请访问 https://www.python.org/downloads/ 安装 Python 3.10+"
    exit 1
fi

# 检查 Python 版本
PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    echo "❌ Python 版本过低: $PYTHON_VERSION"
    echo "需要 Python 3.10 或更高版本"
    exit 1
else
    echo "✅ Python 已安装: $PYTHON_VERSION (使用命令: $PYTHON_CMD)"
fi

# 检查 Node.js
echo ""
echo "检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请访问 https://nodejs.org/ 安装 Node.js 18+"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo "✅ Node.js 已安装: $NODE_VERSION"
fi

# 检查 npm
echo ""
echo "检查 npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo "✅ npm 已安装: $NPM_VERSION"
fi

# 检查 pip
echo ""
echo "检查 pip..."
if ! command -v pip &> /dev/null && ! command -v pip3 &> /dev/null; then
    echo "❌ pip 未安装"
    echo "pip 通常随 Python 一起安装，如果未找到，请重新安装 Python"
    exit 1
else
    PIP_CMD="pip"
    if ! command -v pip &> /dev/null; then
        PIP_CMD="pip3"
    fi
    PIP_VERSION=$($PIP_CMD --version)
    echo "✅ pip 已安装: $PIP_VERSION"
fi

# 检查 Ollama（可选）
echo ""
echo "检查 Ollama..."
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama 未安装（可选，但推荐）"
    echo "   请访问 https://ollama.ai/ 安装 Ollama"
else
    echo "✅ Ollama 已安装"
fi

# 检查并安装后端依赖
echo ""
echo "=========================================="
echo "检查后端依赖..."
echo "=========================================="
cd backend

BACKEND_NEED_INSTALL=0

# 检查虚拟环境是否存在
if [ ! -d ".venv" ]; then
    echo "虚拟环境不存在，需要创建并安装依赖..."
    BACKEND_NEED_INSTALL=1
else
    # 检查虚拟环境中的 Python
    VENV_PYTHON_CHECK=""
    if [ -f ".venv/bin/python" ]; then
        VENV_PYTHON_CHECK=".venv/bin/python"
    elif [ -f ".venv/Scripts/python.exe" ]; then
        VENV_PYTHON_CHECK=".venv/Scripts/python.exe"
    fi
    
    if [ -n "$VENV_PYTHON_CHECK" ] && [ -f "$VENV_PYTHON_CHECK" ]; then
        # 检查依赖配置文件是否已更新
        REQUIREMENTS_UPDATED=0
        INSTALL_MARKER=".venv/.requirements_installed"
        DEPENDENCY_FILE=""
        
        # 优先使用 requirements.txt，如果没有则使用 pyproject.toml
        if [ -f "requirements.txt" ]; then
            DEPENDENCY_FILE="requirements.txt"
            echo "检查 requirements.txt 中的依赖包..."
        elif [ -f "pyproject.toml" ]; then
            DEPENDENCY_FILE="pyproject.toml"
            echo "检查 pyproject.toml 中的依赖包..."
        fi
        
        if [ -n "$DEPENDENCY_FILE" ]; then
            # 检查依赖文件是否被更新
            if [ -f "$INSTALL_MARKER" ]; then
                # 比较依赖文件和标记文件的修改时间
                if [ "$DEPENDENCY_FILE" -nt "$INSTALL_MARKER" ]; then
                    echo "检测到 ${DEPENDENCY_FILE} 已更新（比上次安装时间新），需要重新安装依赖..."
                    REQUIREMENTS_UPDATED=1
                fi
            fi
        fi
        
        # 检查依赖是否已安装
        if [ -n "$DEPENDENCY_FILE" ]; then
            # 激活虚拟环境以使用 pip
            if [ -f ".venv/bin/activate" ]; then
                source .venv/bin/activate
            elif [ -f ".venv/Scripts/activate" ]; then
                source .venv/Scripts/activate
            fi
            
            # 检查关键包是否已安装（快速检查）
            KEY_PACKAGES="fastapi uvicorn pandas lancedb langchain langchain_community langchain_core"
            MISSING_KEY_PACKAGES=""
            
            for pkg in $KEY_PACKAGES; do
                # 处理包名中的连字符（如 langchain-community -> langchain_community）
                import_name=$(echo "$pkg" | tr '-' '_')
                if ! $VENV_PYTHON_CHECK -c "import ${import_name}" 2>/dev/null; then
                    MISSING_KEY_PACKAGES="${MISSING_KEY_PACKAGES} ${pkg}"
                fi
            done
            
            if [ -n "$MISSING_KEY_PACKAGES" ]; then
                echo "检测到缺失的关键依赖包:${MISSING_KEY_PACKAGES}"
                BACKEND_NEED_INSTALL=1
            elif [ $REQUIREMENTS_UPDATED -eq 1 ]; then
                echo "${DEPENDENCY_FILE} 已更新，需要重新安装依赖以确保版本匹配..."
                BACKEND_NEED_INSTALL=1
            else
                # 如果标记文件不存在但关键包都在，创建标记文件
                if [ ! -f "$INSTALL_MARKER" ]; then
                    touch "$INSTALL_MARKER"
                fi
                echo "✅ 后端依赖已全部安装"
            fi
            
            deactivate 2>/dev/null
        else
            # 如果没有依赖配置文件，检查关键依赖
            if ! $VENV_PYTHON_CHECK -c "import uvicorn" 2>/dev/null; then
                echo "虚拟环境存在但关键依赖未安装，需要安装依赖..."
                BACKEND_NEED_INSTALL=1
            else
                echo "✅ 后端依赖已安装"
            fi
        fi
    else
        echo "虚拟环境异常，需要重新创建..."
        BACKEND_NEED_INSTALL=1
    fi
fi

# 安装后端依赖
if [ $BACKEND_NEED_INSTALL -eq 1 ]; then
    echo ""
    echo "安装后端依赖..."
    
    # 创建虚拟环境（如果不存在）
    if [ ! -d ".venv" ]; then
        echo "创建 Python 虚拟环境..."
        $PYTHON_CMD -m venv .venv
        if [ $? -ne 0 ]; then
            echo "❌ 虚拟环境创建失败"
            cd ..
            exit 1
        fi
        echo "✅ 虚拟环境创建成功"
    fi
    
    # 激活虚拟环境
    if [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    elif [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    else
        echo "❌ 无法找到虚拟环境激活脚本"
        cd ..
        exit 1
    fi
    
    # 升级 pip
    echo "升级 pip..."
    $PIP_CMD install --upgrade pip > /dev/null 2>&1
    
    # 安装依赖（pip 会自动跳过已安装的包，只安装缺失的）
    if [ -f "requirements.txt" ]; then
        echo "从 requirements.txt 安装依赖（自动跳过已安装的包）..."
        $PIP_CMD install -r requirements.txt
    elif [ -f "pyproject.toml" ]; then
        echo "从 pyproject.toml 安装依赖..."
        $PIP_CMD install -e .
    else
        echo "❌ 未找到依赖配置文件（requirements.txt 或 pyproject.toml）"
        deactivate
        cd ..
        exit 1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ 后端依赖安装完成"
        
        # 创建标记文件，记录依赖安装时间
        INSTALL_MARKER=".venv/.requirements_installed"
        touch "$INSTALL_MARKER"
        DEPENDENCY_FILE="requirements.txt"
        if [ ! -f "$DEPENDENCY_FILE" ] && [ -f "pyproject.toml" ]; then
            DEPENDENCY_FILE="pyproject.toml"
        fi
        echo "已记录依赖安装时间，下次运行时会自动检测 ${DEPENDENCY_FILE} 的更新"
    else
        echo "❌ 后端依赖安装失败"
        echo ""
        echo "如果遇到问题，请尝试:"
        echo "1. 检查网络连接"
        echo "2. 手动运行: cd backend && pip install -r requirements.txt"
        deactivate
        cd ..
        exit 1
    fi
    
    deactivate
fi

cd ..

# 检查并安装前端依赖
echo ""
echo "=========================================="
echo "检查前端依赖..."
echo "=========================================="
cd frontend

if [ ! -d "node_modules" ]; then
    echo "前端依赖未安装，正在安装..."
    if npm install; then
        echo "✅ 前端依赖安装成功"
    else
        echo "❌ 前端依赖安装失败"
        cd ..
        exit 1
    fi
else
    # node_modules 存在，但可能缺少某些包，运行 npm install 会自动安装缺失的包
    echo "检查并安装缺失的前端依赖..."
    if npm install; then
        echo "✅ 前端依赖检查完成（已自动安装缺失的包）"
    else
        echo "⚠️  前端依赖安装可能有问题，但继续启动..."
    fi
fi

cd ..

# 模型配置函数（固定使用 llama3.2:3b + nomic-embed-text）
select_models() {
    local selected_llm="llama3.2:3b"
    local selected_embedding="nomic-embed-text"
    
    echo ""
    echo "=========================================="
    echo "Ollama 模型配置"
    echo "=========================================="
    echo "使用默认配置: LLM=${selected_llm}, Embedding=${selected_embedding} (维度: 768)"
    echo ""
    
    # 更新或创建 .env 文件
    if [ ! -f "backend/.env" ]; then
        touch backend/.env
    fi
    
    # 更新或添加 OLLAMA_MODEL（跨平台兼容的 sed 用法）
    if grep -q "^OLLAMA_MODEL=" backend/.env 2>/dev/null; then
        # macOS 和 Linux 兼容的 sed 用法
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=${selected_llm}|" backend/.env
        else
            sed -i "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=${selected_llm}|" backend/.env
        fi
    else
        echo "OLLAMA_MODEL=${selected_llm}" >> backend/.env
    fi
    
    # 更新或添加 OLLAMA_EMBEDDING_MODEL（跨平台兼容的 sed 用法）
    if grep -q "^OLLAMA_EMBEDDING_MODEL=" backend/.env 2>/dev/null; then
        # macOS 和 Linux 兼容的 sed 用法
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^OLLAMA_EMBEDDING_MODEL=.*|OLLAMA_EMBEDDING_MODEL=${selected_embedding}|" backend/.env
        else
            sed -i "s|^OLLAMA_EMBEDDING_MODEL=.*|OLLAMA_EMBEDDING_MODEL=${selected_embedding}|" backend/.env
        fi
    else
        echo "OLLAMA_EMBEDDING_MODEL=${selected_embedding}" >> backend/.env
    fi
    
    # 确保有 OLLAMA_BASE_URL
    if ! grep -q "^OLLAMA_BASE_URL=" backend/.env 2>/dev/null; then
        echo "OLLAMA_BASE_URL=http://localhost:11434" >> backend/.env
    fi
    
    echo "✅ 配置已保存到 backend/.env"
}

# 创建环境变量文件
echo ""
echo "=========================================="
echo "检查环境变量配置..."
echo "=========================================="
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env 文件不存在，将创建新配置"
    touch backend/.env
else
    echo "✅ backend/.env 文件已存在"
fi

# 选择模型配置
select_models

# 创建存储目录
echo ""
echo "=========================================="
echo "检查存储目录..."
echo "=========================================="
mkdir -p storage/documents
mkdir -p storage/vector-cache
mkdir -p storage/lancedb
mkdir -p storage/uploads
echo "✅ 存储目录检查完成"

# 检查 Ollama 是否运行并检查模型
check_ollama_models() {
    local ollama_url="http://localhost:11434"
    local llm_model="llama3.2:3b"
    local embedding_model="nomic-embed-text"
    
    # 从 .env 文件读取配置（如果存在）
    if [ -f "backend/.env" ]; then
        if grep -q "^OLLAMA_MODEL=" backend/.env 2>/dev/null; then
            llm_model=$(grep "^OLLAMA_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
        fi
        if grep -q "^OLLAMA_EMBEDDING_MODEL=" backend/.env 2>/dev/null; then
            embedding_model=$(grep "^OLLAMA_EMBEDDING_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
        fi
    fi
    
    # 检查 Ollama 服务是否运行
    echo "检查 Ollama 服务状态..."
    if ! curl -s "${ollama_url}/api/tags" > /dev/null 2>&1; then
        echo "⚠️  Ollama 服务未运行（可选服务）"
        echo "   如需使用 AI 功能，请先启动 Ollama: ollama serve"
        echo "   服务将继续启动，但 AI 功能可能不可用"
        echo ""
        return 0  # 不阻止启动，因为 Ollama 是可选的
    fi
    
    echo "✅ Ollama 服务正在运行"
    
    # 获取已安装的模型列表
    local installed_models_json=$(curl -s "${ollama_url}/api/tags" 2>/dev/null)
    if [ -z "$installed_models_json" ]; then
        echo "⚠️  警告: 无法获取 Ollama 模型列表"
        echo ""
        return 0
    fi
    
    # 提取模型名称（处理 JSON 格式）
    local installed_models=$(echo "$installed_models_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "")
    
    # 检查 LLM 模型
    local llm_installed=0
    if echo "$installed_models" | grep -q "^${llm_model}$"; then
        llm_installed=1
    fi
    
    # 检查 Embedding 模型
    local embedding_installed=0
    if echo "$installed_models" | grep -q "^${embedding_model}$"; then
        embedding_installed=1
    fi
    
    # 提示缺失的模型
    local missing_models=""
    if [ $llm_installed -eq 0 ]; then
        missing_models="${missing_models} ${llm_model}"
    fi
    if [ $embedding_installed -eq 0 ]; then
        missing_models="${missing_models} ${embedding_model}"
    fi
    
    if [ -n "$missing_models" ]; then
        echo "检查模型安装情况..."
        echo "⚠️  以下模型未安装:${missing_models}"
        echo ""
        echo "💡 提示: 当前配置使用轻量级模型（适合 CPU 部署）"
        echo "   - LLM 模型: ${llm_model}"
        echo "   - Embedding 模型: ${embedding_model}"
        echo ""
        echo "正在自动拉取缺失的模型..."
        echo ""
        
        # 优先使用 ollama 命令（如果可用），它有更好的进度显示
        if command -v ollama &> /dev/null; then
            # 使用 ollama pull 命令（有更好的进度显示）
            for model in $missing_models; do
                echo "正在拉取模型: ${model}..."
                echo "（这可能需要几分钟，取决于模型大小和网络速度）"
                if ollama pull "${model}"; then
                    echo "✅ 模型 ${model} 拉取完成"
                else
                    echo "⚠️  模型 ${model} 拉取失败，请稍后手动运行: ollama pull ${model}"
                fi
                echo ""
            done
        else
            # 使用 Ollama HTTP API 拉取模型
            echo "⚠️  未检测到 ollama 命令行工具"
            echo "   将使用 HTTP API 拉取模型（进度显示有限）"
            echo "   建议安装 ollama 命令行工具以获得更好的下载体验"
            echo ""
            
            for model in $missing_models; do
                echo "正在拉取模型: ${model}..."
                echo "（这可能需要几分钟，取决于模型大小和网络速度）"
                
                # 使用 curl 拉取模型，解析流式 JSON 响应
                local download_started=0
                curl -N -X POST "${ollama_url}/api/pull" \
                    -H "Content-Type: application/json" \
                    -d "{\"name\": \"${model}\"}" 2>/dev/null | \
                while IFS= read -r line; do
                    if [ -z "$line" ]; then
                        continue
                    fi
                    
                    # 检查下载状态
                    if echo "$line" | grep -q '"status"'; then
                        download_started=1
                        local status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
                        
                        if [ "$status" = "success" ]; then
                            echo ""
                            echo "✅ 模型 ${model} 拉取完成"
                            break
                        elif [ "$status" = "downloading" ]; then
                            # 提取下载进度
                            local total=$(echo "$line" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
                            local completed=$(echo "$line" | grep -o '"completed":[0-9]*' | head -1 | cut -d':' -f2)
                            
                            if [ -n "$total" ] && [ -n "$completed" ] && [ "$total" != "0" ]; then
                                local percent=$((completed * 100 / total))
                                local completed_mb=$((completed / 1024 / 1024))
                                local total_mb=$((total / 1024 / 1024))
                                printf "\r   下载进度: %3d%% (%dMB/%dMB)" "$percent" "$completed_mb" "$total_mb"
                            else
                                printf "\r   正在下载..."
                            fi
                        fi
                    fi
                done
                
                # 检查模型是否真的下载完成
                sleep 1
                local installed_models_check=$(curl -s "${ollama_url}/api/tags" 2>/dev/null)
                if echo "$installed_models_check" | grep -q "\"name\":\"${model}\""; then
                    echo ""
                    echo "✅ 模型 ${model} 已成功安装"
                else
                    echo ""
                    echo "⚠️  模型 ${model} 可能仍在下载中"
                    echo "   您可以在另一个终端运行以下命令查看进度:"
                    echo "   curl http://localhost:11434/api/tags"
                fi
                echo ""
            done
            
            echo "ℹ️  模型下载完成后，服务将自动使用新模型"
            echo ""
        fi
    else
        echo "检查模型安装情况..."
        echo "✅ 所需模型已安装（LLM: ${llm_model}, Embedding: ${embedding_model}）"
        echo ""
    fi
}

# 检查 Ollama 和模型
echo ""
echo "=========================================="
echo "检查 Ollama 服务..."
echo "=========================================="
check_ollama_models

start_qanything_models_docker() {
    local container_name="qanything_stage3_models"
    # 根据宿主机系统选择对应镜像
    if [[ "$OSTYPE" == "darwin"* ]]; then
        local image_name="xixihahaliu01/qanything-mac:v1.5.1"
    else
        local image_name="xixihahaliu01/qanything-linux:v1.5.1"
    fi
    # 获取项目根目录的绝对路径（run.sh 位于项目根目录）
    local project_root
    project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local dep_server_dir="${project_root}/dependent_server"
    local entrypoint="${project_root}/docker/qanything-models-entrypoint.sh"

    if ! command -v docker &> /dev/null; then
        echo "⚠️  未检测到 docker，无法自动启动 OCR/PDF 模型容器"
        return 1
    fi

    if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo "✅ OCR/PDF 模型容器已运行: ${container_name}"
        return 0
    fi

    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo "启动已存在的 OCR/PDF 模型容器: ${container_name}"
        docker start "${container_name}" >/dev/null || return 1
        return 0
    fi

    echo "首次拉起 OCR/PDF 模型容器（可能需要下载镜像，时间较长）..."
    docker run -d \
        --name "${container_name}" \
        -p 7001:7001 \
        -p 9009:9009 \
        -v "${dep_server_dir}:/workspace/dependent_server" \
        -v "${entrypoint}:/qanything-models-entrypoint.sh:ro" \
        "${image_name}" \
        /bin/bash /qanything-models-entrypoint.sh >/dev/null
}

echo ""
echo "=========================================="
echo "Starting services..."
echo "=========================================="

if [ "$WITH_QANYTHING_MODELS_DOCKER" -eq 1 ]; then
    if start_qanything_models_docker; then
        echo "✅ QAnything 模型容器可用，OCR/PDF 服务预计运行在 7001/9009"
    else
        echo "⚠️  QAnything 模型容器启动失败，将继续以本地 fallback 模式运行"
    fi
fi

PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_CMD="python"
    fi
fi

echo "Starting backend service..."
cd backend

VENV_PYTHON=""
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    VENV_PYTHON=".venv/bin/python"
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
    VENV_PYTHON=".venv/Scripts/python.exe"
fi

BACKEND_PYTHON_CMD="$PYTHON_CMD"
if [ -n "$VENV_PYTHON" ] && [ -f "$VENV_PYTHON" ]; then
    BACKEND_PYTHON_CMD="$VENV_PYTHON"
fi

$BACKEND_PYTHON_CMD main.py &
BACKEND_PID=$!

OCR_PID=""
PDF_PID=""
if [ "$WITH_QANYTHING_MODELS_DOCKER" -eq 0 ]; then
    # dependent_server 已内置于项目，不再依赖外部 QAnything 目录
    OCR_SERVER_SCRIPT="../dependent_server/ocr_server/ocr_server.py"
    PDF_SERVER_SCRIPT="../dependent_server/pdf_parser_server/pdf_parser_server.py"

    if [ "$WITH_OCR_SERVER" -eq 1 ]; then
        if [ -f "$OCR_SERVER_SCRIPT" ]; then
            echo "Starting OCR dependent server..."
            $BACKEND_PYTHON_CMD "$OCR_SERVER_SCRIPT" --workers 1 > logs/ocr_server.log 2>&1 &
            OCR_PID=$!
        else
            echo "⚠️  未找到 OCR 服务脚本: $OCR_SERVER_SCRIPT"
        fi
    fi

    if [ "$WITH_PDF_SERVER" -eq 1 ]; then
        if [ -f "$PDF_SERVER_SCRIPT" ]; then
            echo "Starting PDF parser dependent server..."
            $BACKEND_PYTHON_CMD "$PDF_SERVER_SCRIPT" --workers 1 > logs/pdf_parser_server.log 2>&1 &
            PDF_PID=$!
        else
            echo "⚠️  未找到 PDF 解析服务脚本: $PDF_SERVER_SCRIPT"
        fi
    fi
fi

INGEST_PID=""
if [ "$WITH_INGEST_SERVER" -eq 1 ]; then
    echo "Starting ingest worker..."
    INGEST_DEFAULT_MODE=queue $BACKEND_PYTHON_CMD workers/ingest_worker.py &
    INGEST_PID=$!
fi

cd ..

sleep 3

echo "Starting frontend service..."
cd frontend
PORT=3001 npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "Services started successfully"
echo "=========================================="
echo ""
echo "Backend PID: $BACKEND_PID"
if [ -n "$OCR_PID" ]; then
    echo "OCR Server PID: $OCR_PID"
fi
if [ -n "$PDF_PID" ]; then
    echo "PDF Server PID: $PDF_PID"
fi
if [ -n "$INGEST_PID" ]; then
    echo "Ingest PID: $INGEST_PID"
fi
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Upload default mode: $INGEST_DEFAULT_MODE"
echo "Parser mode: $PARSER_MODE"
echo "Backend:  http://localhost:8888"
echo "Frontend: http://localhost:3001"
if [ "$WITH_OCR_SERVER" -eq 1 ]; then
    echo "OCR API:  $OCR_SERVER_URL/ocr"
fi
if [ "$WITH_PDF_SERVER" -eq 1 ]; then
    echo "PDF API:  $PDF_PARSER_SERVER_URL/pdfparser"
fi
echo ""
echo "Press Ctrl+C to stop services"
echo ""

cleanup() {
    kill $BACKEND_PID $FRONTEND_PID ${INGEST_PID:-} ${OCR_PID:-} ${PDF_PID:-} 2>/dev/null
    exit
}

trap cleanup INT TERM
wait
