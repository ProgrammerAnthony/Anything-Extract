#!/bin/bash

# AnythingExtract 一键运行脚本（自动检查并安装依赖，然后启动服务）

echo "=========================================="
echo "AnythingExtract 一键启动"
echo "=========================================="
echo ""

# 检查 Python
echo "检查 Python..."
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
        # 检查 requirements.txt 中的所有依赖是否已安装
        if [ -f "requirements.txt" ]; then
            echo "检查 requirements.txt 中的依赖包..."
            
            # 激活虚拟环境以使用 pip
            if [ -f ".venv/bin/activate" ]; then
                source .venv/bin/activate
            elif [ -f ".venv/Scripts/activate" ]; then
                source .venv/Scripts/activate
            fi
            
            # 检查关键包是否已安装（快速检查）
            KEY_PACKAGES="fastapi uvicorn pandas lancedb"
            MISSING_KEY_PACKAGES=""
            
            for pkg in $KEY_PACKAGES; do
                if ! $VENV_PYTHON_CHECK -c "import ${pkg}" 2>/dev/null; then
                    MISSING_KEY_PACKAGES="${MISSING_KEY_PACKAGES} ${pkg}"
                fi
            done
            
            if [ -n "$MISSING_KEY_PACKAGES" ]; then
                echo "检测到缺失的关键依赖包:${MISSING_KEY_PACKAGES}"
                BACKEND_NEED_INSTALL=1
            else
                # 关键包都存在，但可能还有其他包缺失，运行 pip install 会自动处理
                # 为了不每次都运行，我们假设如果关键包都在，其他包也应该都在
                # 如果用户添加了新包，下次运行时会自动安装
                echo "✅ 后端依赖已全部安装"
            fi
            
            deactivate 2>/dev/null
        else
            # 如果没有 requirements.txt，检查关键依赖
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

# 模型选择函数
select_models() {
    echo ""
    echo "=========================================="
    echo "选择 Ollama 模型配置"
    echo "=========================================="
    echo ""
    
    # LLM 模型列表（按参数量从小到大）
    echo "📋 LLM 模型列表（用于信息提取）："
    echo ""
    echo "  1) qwen2:0.5b      - 参数量: 0.5B  | 显存: ~300MB  | 内存: ~500MB  | 极轻量，最快"
    echo "  2) llama3.2:1b     - 参数量: 1B    | 显存: ~600MB  | 内存: ~1GB    | 超轻量，快速"
    echo "  3) tinyllama        - 参数量: 1.1B  | 显存: ~650MB  | 内存: ~1.1GB  | 超轻量"
    echo "  4) phi3:mini        - 参数量: 3.8B  | 显存: ~2.2GB  | 内存: ~3GB    | 推荐，平衡性能"
    echo "  5) llama3.2:3b     - 参数量: 3B    | 显存: ~1.8GB  | 内存: ~2.5GB  | 轻量，性能好"
    echo "  6) mistral:7b       - 参数量: 7B    | 显存: ~4GB    | 内存: ~5GB    | 高性能（需更多资源）"
    echo "  7) llama2:7b        - 参数量: 7B    | 显存: ~4GB    | 内存: ~5GB    | 高性能（需更多资源）"
    echo ""
    
    # 读取当前配置
    local current_llm="qwen2:0.5b"
    local current_embedding="all-minilm"
    if [ -f "backend/.env" ]; then
        if grep -q "^OLLAMA_MODEL=" backend/.env 2>/dev/null; then
            current_llm=$(grep "^OLLAMA_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
        fi
        if grep -q "^OLLAMA_EMBEDDING_MODEL=" backend/.env 2>/dev/null; then
            current_embedding=$(grep "^OLLAMA_EMBEDDING_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
        fi
    fi
    
    # 检查是否为交互式终端
    local need_selection=0
    if [ ! -t 0 ]; then
        echo "非交互式模式，使用当前配置或默认配置"
        if [ -f "backend/.env" ] && grep -q "^OLLAMA_MODEL=" backend/.env 2>/dev/null; then
            echo "使用已存在的配置"
            return 0
        else
            # 非交互式模式下使用默认配置
            need_selection=1
            selected_llm="phi3:mini"
            selected_embedding="nomic-embed-text"
            echo "使用默认配置: LLM=${selected_llm}, Embedding=${selected_embedding}"
        fi
    else
        # 显示当前配置
        echo "当前配置: LLM=${current_llm}, Embedding=${current_embedding}"
        echo ""
        read -p "是否要重新选择模型？(y/N): " change_models
        
        if [ "$change_models" != "y" ] && [ "$change_models" != "Y" ]; then
            echo "使用当前配置"
            return 0
        else
            need_selection=1
        fi
    fi
    
    # 选择 LLM 模型（仅在需要选择时）
    if [ $need_selection -eq 1 ] && [ -t 0 ]; then
        echo ""
        read -p "请选择 LLM 模型 (1-7，默认 4): " llm_choice
        llm_choice=${llm_choice:-4}
        
        case $llm_choice in
            1) selected_llm="qwen2:0.5b" ;;
            2) selected_llm="llama3.2:1b" ;;
            3) selected_llm="tinyllama" ;;
            4) selected_llm="phi3:mini" ;;
            5) selected_llm="llama3.2:3b" ;;
            6) selected_llm="mistral:7b" ;;
            7) selected_llm="llama2:7b" ;;
            *) selected_llm="phi3:mini" ;;
        esac
        
        # Embedding 模型列表（按参数量从小到大）
        echo ""
        echo "📋 Embedding 模型列表（用于向量化）："
        echo ""
        echo "  1) all-minilm       - 参数量: 22MB  | 维度: 384   | 显存: ~50MB   | 内存: ~100MB  | 超轻量，极速"
        echo "  2) bge-small        - 参数量: 33MB  | 维度: 384   | 显存: ~80MB   | 内存: ~150MB  | 轻量，效果不错"
        echo "  3) nomic-embed-text - 参数量: 274MB | 维度: 768   | 显存: ~500MB  | 内存: ~600MB  | 推荐，平衡性能"
        echo ""
        echo "⚠️  重要提示："
        echo "   - 不同 embedding 模型生成的向量维度不同（384 或 768）"
        echo "   - 切换 embedding 模型后，需要重新上传文档进行向量化"
        echo "   - 否则会出现维度不匹配错误"
        echo ""
        
        # 选择 Embedding 模型
        read -p "请选择 Embedding 模型 (1-3，默认 3): " embedding_choice
        embedding_choice=${embedding_choice:-3}
        
        case $embedding_choice in
            1) selected_embedding="all-minilm" ;;
            2) selected_embedding="bge-small" ;;
            3) selected_embedding="nomic-embed-text" ;;
            *) selected_embedding="nomic-embed-text" ;;
        esac
        
        # 检查是否切换了 embedding 模型
        if [ -f "backend/.env" ] && grep -q "^OLLAMA_EMBEDDING_MODEL=" backend/.env 2>/dev/null; then
            old_embedding=$(grep "^OLLAMA_EMBEDDING_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
            if [ "$old_embedding" != "$selected_embedding" ]; then
                echo ""
                echo "⚠️  警告：检测到 embedding 模型切换！"
                echo "   旧模型: ${old_embedding}"
                echo "   新模型: ${selected_embedding}"
                echo ""
                echo "   切换 embedding 模型会导致："
                echo "   1. 向量维度不匹配（如果新旧模型维度不同）"
                echo "   2. 需要重新上传所有文档进行向量化"
                echo "   3. 旧的向量数据将无法使用"
                echo ""
                read -p "   是否继续？(y/N): " confirm_switch
                if [ "$confirm_switch" != "y" ] && [ "$confirm_switch" != "Y" ]; then
                    echo "已取消模型切换"
                    return 0
                fi
            fi
        fi
    fi
    
    # 确保变量已设置（非交互式模式下的默认值已在上面设置）
    if [ -z "$selected_llm" ]; then
        selected_llm="phi3:mini"
    fi
    if [ -z "$selected_embedding" ]; then
        selected_embedding="nomic-embed-text"
    fi
    
    # 获取 embedding 模型维度信息
    embedding_dim="未知"
    case $selected_embedding in
        all-minilm|bge-small) embedding_dim="384" ;;
        nomic-embed-text) embedding_dim="768" ;;
    esac
    
    echo ""
    echo "✅ 已选择配置:"
    echo "   LLM 模型: ${selected_llm}"
    echo "   Embedding 模型: ${selected_embedding} (维度: ${embedding_dim})"
    echo ""
    
    # 如果切换了 embedding 模型，给出额外提示
    if [ -f "backend/.env" ] && grep -q "^OLLAMA_EMBEDDING_MODEL=" backend/.env 2>/dev/null; then
        old_embedding=$(grep "^OLLAMA_EMBEDDING_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)
        if [ "$old_embedding" != "$selected_embedding" ]; then
            echo "⚠️  重要提示：已切换 embedding 模型"
            echo "   如果数据库中已有向量数据，请："
            echo "   1. 删除 storage/lancedb 目录（清除旧向量数据）"
            echo "   2. 重新上传所有文档进行向量化"
            echo "   或者保持使用原模型以避免维度不匹配"
            echo ""
        fi
    fi
    
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
    # 默认使用轻量级模型（适合 CPU 部署）
    local llm_model="qwen2:0.5b"
    local embedding_model="all-minilm"
    
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

# 启动服务
echo ""
echo "=========================================="
echo "启动服务..."
echo "=========================================="

# 检测 Python 命令
PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_CMD="python"
    fi
fi

# 启动后端
echo "启动后端服务..."
cd backend

# 激活虚拟环境
VENV_PYTHON=""
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    VENV_PYTHON=".venv/bin/python"
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
    VENV_PYTHON=".venv/Scripts/python.exe"
fi

# 使用虚拟环境中的 Python，如果激活失败则使用系统 Python
if [ -n "$VENV_PYTHON" ] && [ -f "$VENV_PYTHON" ]; then
    $VENV_PYTHON main.py &
else
    $PYTHON_CMD main.py &
fi
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
echo "启动前端服务..."
cd frontend
PORT=3001 npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "✅ 服务启动成功！"
echo "=========================================="
echo ""
echo "后端 PID: $BACKEND_PID"
echo "前端 PID: $FRONTEND_PID"
echo ""
echo "后端服务: http://localhost:8888"
echo "前端服务: http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 等待中断信号
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

