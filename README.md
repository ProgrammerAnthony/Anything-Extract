# AnythingExtract

一个专注于文档结构化提取的本地化工具，基于 LangChain 高级 RAG 方案，支持 PDF 和 Word 文档的智能信息抽取。

## 特性

- 📄 **多格式支持**：支持 PDF 和 Word 文档解析
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

### 前置要求

- Python 3.10+
- Node.js 18+ 和 npm
- Ollama（本地运行，可选但推荐）

### 安装

#### 方式一：使用安装脚本（推荐）

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

# 3. 安装前端依赖
cd frontend
npm install
cd ..

# 4. 配置环境变量
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
├── docs/                # 文档
│   └── ARCHITECTURE.md  # 系统架构文档
└── storage/             # 数据存储
    ├── documents/       # 解析后的文档
    ├── lancedb/         # 向量数据库
    └── uploads/         # 上传文件
```

## 文档

- [系统架构文档](./docs/ARCHITECTURE.md) - 完整的系统架构、API 接口、安装和使用指南

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

