# Anything-Extract

一个专注于文档结构化提取的本地化工具，基于 LangChain 高级 RAG 方案，支持 PDF、Word 等10+种文档的智能信息抽取。

## 特性

- 📄 **多格式支持**：支持 PDF、Word、图片等10+种文档格式解析
- 🏷️ **灵活标签配置**：支持单选、多选、填空三种标签类型
- 🔍 **高级检索方案**：集成 Multi-Query Retrieval、HyDE、ParentDocumentRetriever、RERANK、ES BM25 等
- 🤖 **本地化部署**：默认使用 Ollama + LanceDB，完全本地运行
- 🎯 **结构化输出**：基于用户配置的标签，LLM 返回结构化数据
- 🚀 **一键启动**：提供命令行快速启动方案
- 🔌 **开放接口**：易于扩展其他 AI API 和向量数据库

## 技术栈

- **后端**：Python + FastAPI + LangChain
- **前端**：Next.js + TypeScript + Tailwind CSS
- **向量数据库**：LanceDB（默认）
- **LLM**：Ollama（默认，可扩展）
- **Embedding**：Ollama（默认，可扩展）
- **包管理**：pip（Python）

## 快速开始

### 方式一：Docker 部署（推荐）

前置要求：[Docker Desktop](https://www.docker.com/products/docker-desktop) >= 4.26 (Windows/Mac) 或 Docker + Docker Compose v2 (Linux)

```bash
# 仅启动后端 + 前端（Ollama 运行在宿主机）
./docker_run.sh

# 启动后端 + 前端 + QAnything OCR/PDF 模型服务
./docker_run.sh --with-models

# 完全容器化（含 Ollama 容器）
./docker_run.sh --with-ollama

# 启用全部服务
./docker_run.sh --full

# 后台运行
./docker_run.sh -d

# 停止服务
./docker_run.sh --down
```

首次启动时会自动构建镜像。国内用户建议提前配置 Docker 镜像源加快拉取速度。

访问地址：
- 前端：http://localhost:3001
- 后端 API：http://localhost:8888

> **Windows 用户**：需在 WSL2 或 Git Bash 中运行 `docker_run.sh`，或直接使用：
> ```bash
> docker compose -f docker-compose-win.yaml up
> ```

详细 Docker 配置说明见本文档底部 [Docker 部署](#docker-部署) 章节。

---

### 方式二：本地直接运行

#### 前置要求

- Python 3.10+
- Node.js 18+ 和 npm
- Ollama（本地运行，可选但推荐）

#### 安装

##### 方式一：使用安装脚本（推荐）

```bash
# Linux/Mac
./install.sh

# Windows
install.bat
```

安装脚本会自动：
- 检查并安装必要的依赖（Python、Node.js、pip）
- 创建 Python 虚拟环境
- 安装后端和前端依赖
- 创建环境变量配置文件
- 创建必要的存储目录

#### 方式二：手动安装

```bash
# 1. 创建虚拟环境并安装后端依赖
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# 2. 安装前端依赖
cd frontend
npm install
cd ..

# 3. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 配置 Ollama 等
```

### 启动

```bash
# Linux/Mac
./start.sh

# Windows
start.bat
```

启动脚本会自动：
- 检查依赖是否已安装
- 检查环境变量配置
- 启动后端和前端服务

**注意**：首次运行前请确保已运行 `install.sh` 或 `install.bat` 安装依赖。

详细文档请参考 [系统架构文档](./docs/ARCHITECTURE.md)。

### 配置

1. 复制环境变量模板：
```bash
cp backend/.env.example backend/.env
```

2. 编辑 `backend/.env`，配置 Ollama 和 LanceDB：
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3:mini
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

LANCE_DB_PATH=./storage/lancedb
```

#### 轻量级模型推荐（适合 CPU 部署）

**LLM 模型（用于信息提取）：**
- `phi3:mini` (3.8B, ~2.2GB) - **推荐**，平衡性能和速度
- `llama3.2:1b` (1B, ~600MB) - 超轻量，极速但效果稍差
- `qwen2:0.5b` (0.5B, ~300MB) - 极轻量，最快但效果一般
- `tinyllama` (1.1B, ~650MB) - 超轻量

**Embedding 模型（用于向量化）：**
- `nomic-embed-text` (274MB) - **推荐**，平衡性能和速度
- `all-minilm` (22MB) - 超轻量，极速但效果稍差
- `bge-small` (33MB) - 轻量且效果不错

**高性能模型（需要更多资源）：**
- LLM: `llama2` (7B, ~4GB), `mistral` (7B, ~4GB)
- 需要更多内存和计算资源

**模型选择建议：**
- **CPU 部署**：使用 `phi3:mini` + `nomic-embed-text`（默认配置）
- **极轻量需求**：使用 `llama3.2:1b` + `all-minilm`
- **性能优先**：使用 `llama2` 或 `mistral` + `nomic-embed-text`

## 使用流程

1. **配置标签**：在标签配置页面创建标签（单选/多选/填空）
2. **上传文档**：上传 PDF 或 Word 文档
3. **文档处理**：系统自动解析、向量化并索引文档
4. **信息提取**：基于配置的标签，从文档中提取结构化信息
5. **结果查看**：在结果页面查看提取的结构化数据

## 项目结构

```
anything-extract/
├── backend/              # Python 后端
│   ├── app/             # FastAPI 应用
│   ├── core/            # 核心业务逻辑
│   ├── services/        # 服务层
│   ├── models/          # 数据模型
│   └── utils/           # 工具函数
├── frontend/            # Next.js 前端
│   ├── app/             # Next.js App Router
│   ├── components/      # React 组件
│   └── lib/             # 工具库
├── docker/              # Docker 构建文件
│   ├── Dockerfile.backend              # Python 后端镜像
│   ├── Dockerfile.frontend             # Next.js 前端镜像
│   ├── docker-entrypoint.sh            # 后端容器入口
│   └── qanything-models-entrypoint.sh  # QAnything 模型服务入口
├── docker-compose-linux.yaml  # Linux Docker Compose
├── docker-compose-mac.yaml    # macOS Docker Compose
├── docker-compose-win.yaml    # Windows Docker Compose
├── docker_run.sh              # Docker 一键启动脚本
├── .env.docker.example        # Docker 环境变量模板
├── dependent_server/    # 第三方依赖服务（OCR/PDF 解析）
├── docs/                # 文档
│   └── ARCHITECTURE.md  # 系统架构文档
└── storage/             # 数据存储
    ├── documents/       # 解析后的文档
    ├── lancedb/         # 向量数据库
    ├── uploads/         # 上传文件
    └── database.db      # SQLite 数据库
```

## Docker 部署

### 服务架构

| 服务 | 描述 | 端口 | 启用方式 |
|------|------|------|---------|
| `backend` | Python FastAPI 后端 | 8888 | 默认 |
| `frontend` | Next.js 生产前端 | 3001 | 默认 |
| `qanything_models` | QAnything OCR + PDF 解析服务 | 7001, 9009 | `--with-models` |
| `ollama` | Ollama LLM/Embedding 容器 | 11434 | `--with-ollama` |

### 平台说明

| 平台 | compose 文件 | Ollama 地址 | QAnything 镜像 |
|------|------------|------------|----------------|
| Linux | `docker-compose-linux.yaml` | `localhost:11434` | `qanything-linux:v1.5.1` |
| macOS | `docker-compose-mac.yaml` | `host.docker.internal:11434` | `qanything-mac:v1.5.1` |
| Windows | `docker-compose-win.yaml` | `host.docker.internal:11434` | `qanything-win:v1.5.1` |

### 启动命令

```bash
# 一键启动（自动检测平台）
./docker_run.sh

# 含 QAnything OCR/PDF 模型服务
./docker_run.sh --with-models

# 完全容器化（含 Ollama 容器）
./docker_run.sh --with-ollama

# 全部服务
./docker_run.sh --full

# 后台运行
./docker_run.sh -d

# 重新构建镜像
./docker_run.sh --build

# 停止服务
./docker_run.sh --down
```

或直接使用 Docker Compose：
```bash
# 基础启动
docker compose -f docker-compose-win.yaml up

# 启用模型服务
docker compose -f docker-compose-win.yaml --profile models up

# 全部服务
docker compose -f docker-compose-win.yaml --profile full up
```

### 关于 OCR/PDF 模型服务

`--with-models` 会启动 `xixihahaliu01/qanything-{platform}:v1.5.1` 容器，该镜像内置了所有 ML 模型（OCR、PDF 解析），存储于镜像内的 `/root/models`。

**完全独立，无需 QAnything 项目**：OCR/PDF 服务代码已内置于本项目 `dependent_server/` 目录，Docker 容器会挂载该目录并建立软链：
- `dependent_server/ocr_server/ocr_models` → `/root/models/ocr_models`
- `dependent_server/pdf_parser_server/pdf_to_markdown/checkpoints` → `/root/models/pdf_models`

然后仅启动 OCR(:7001) 和 PDF Parser(:9009) 两个服务供后端调用。

### 数据持久化

`storage/` 目录挂载到后端容器，重建容器不会丢失数据：
- `storage/lancedb/` - 向量数据库
- `storage/documents/` - 解析后的文档
- `storage/uploads/` - 上传文件
- `storage/database.db` - SQLite 数据库

## 文档

- [系统架构文档](./docs/ARCHITECTURE.md) - 完整的系统架构、API 接口、安装和使用指南

## 常见问题（FAQ）

### 1. 启动后访问 http://localhost:3001 打不开怎么办？
- 检查端口3001是否被占用：`lsof -i:3001`
- 查看容器/服务运行状态：`docker ps` 或检查后端/前端日志
- 确认防火墙没有拦截3001和8888端口

### 2. Ollama 连接失败怎么办？
- 确认Ollama服务已启动：`ollama serve`
- 检查Ollama地址配置是否正确：`OLLAMA_BASE_URL=http://localhost:11434`
- 如果是Docker部署，宿主机Ollama需要监听0.0.0.0：`OLLAMA_HOST=0.0.0.0 ollama serve`

### 3. 模型下载慢怎么办？
- 国内用户建议配置Ollama 镜像源：
  ```bash
  export OLLAMA_REGISTRY=https://ollama.aigem.ai
  ollama pull phi3:mini
  ```
- 或手动下载模型文件放到Ollama模型目录

### 4. 支持哪些文档格式？
- 目前支持：PDF、DOCX、TXT、Markdown、CSV、JSON、XLSX、PPTX、EML、图片（JPG/PNG）
- 更多格式正在持续扩展中

### 5. 文档上传后一直处于"处理中"状态？
- 大文件解析需要时间，请耐心等待
- 查看后端日志确认是否有报错
- 检查Ollama服务是否正常运行
- 单文档建议不要超过100MB

### 6. 提取结果不准确怎么办？
- 优化标签描述，尽可能详细说明提取要求
- 调整模型参数，使用更大的模型（如llama3 8B）
- 开启RAG增强和Rerank功能，提升检索准确性
- 增加Prompt示例，指导LLM输出格式

### 7. 数据安全吗？
- 所有数据都存储在本地，不会上传到任何第三方服务器
- 支持完全离线运行，无需联网即可使用
- 敏感文档建议部署在内部网络环境

### 8. 可以同时处理多少文档？
- 取决于服务器配置，默认配置支持同时处理10个文档
- 高并发场景建议增加服务器资源，配置分布式队列
- 批量处理建议使用队列模式，避免同时上传大量文件

### 9. 如何备份数据？
- 备份 `storage/` 目录下所有文件，包含向量数据库和原始文档
- 定期备份SQLite数据库文件：`storage/database.db`
- 导出重要的标签配置和提取结果

### 10. 如何贡献代码？
- Fork项目到自己的仓库
- 创建功能分支：`git checkout -b feature/your-feature`
- 提交代码：`git commit -am 'add some feature'`
- 推送到分支：`git push origin feature/your-feature`
- 提交Pull Request

---

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

