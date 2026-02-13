# AnythingExtract 系统架构文档

## 1. 系统概述

AnythingExtract 是一个专注于文档结构化信息提取和知识管理的本地化工具。系统采用前后端分离架构，后端使用 Python + FastAPI + LangChain，前端使用 Next.js，默认集成 Ollama 和 LanceDB 实现完全本地化部署。

### Stage 1 Update (2026-02-13)

- Scope: adopt QAnything-style loader expansion without introducing dependent_server services.
- Backend: `DocumentParser` now supports `pdf, docx, txt, md, csv, json, xlsx, pptx, eml`.
- Loader reuse: added `backend/utils/loaders/{csv_loader.py,json_loader.py,markdown_parser.py}` copied/adapted from QAnything loader logic.
- Upload validation: `backend/app/api/documents.py` validates by file extension first (with MIME mismatch warning), matching Stage 1 constraints.
- Frontend: upload dialog and KB/document pages now accept the same Stage 1 extensions.
- Storage architecture unchanged: still SQLite + LanceDB, no MySQL/Milvus migration.

### 核心功能

系统包含三大核心模块：

**1. 知识提取模块**
- **标签配置管理**：支持单选、多选、填空三种标签类型
- **Document parsing**: supports PDF/DOCX/TXT/Markdown/CSV/JSON/XLSX/PPTX/EML parsing and vectorization (Stage 1).
- **智能检索**：基于向量数据库和高级 RAG 方案检索相关内容
- **信息提取**：使用 LLM 根据标签配置提取结构化信息
- **结果展示**：可视化展示提取的结构化数据

**2. 知识库管理模块**
- **知识库管理**：创建、删除、重命名知识库，支持默认知识库
- **文档管理**：文档上传到知识库，按知识库组织文档
- **文档状态跟踪**：在知识库中查看文档处理状态
- **知识库检索**：支持按知识库名称搜索

**3. 知识问答模块**（规划中）
- **基于知识库的问答**：基于知识库内容进行智能问答
- **对话管理**：管理问答历史记录

### 技术栈

**后端**：Python 3.10+ / FastAPI / LangChain / SQLite / LanceDB / Ollama  
**前端**：Next.js 14+ / TypeScript / Tailwind CSS  
**包管理**：pip / npm

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 知识提取模块  │  │ 知识库管理模块│  │ 知识问答模块  │  │
│  │ - 标签管理    │  │ - 知识库列表  │  │ (规划中)     │  │
│  │ - 信息提取    │  │ - 文档管理    │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   后端层 (FastAPI)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 标签管理 API │  │ 知识库管理API│  │ 提取服务 API │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 文档处理 API │  │ 问答服务 API │  │ 系统配置 API │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              核心服务层                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │文档解析  │  │向量化服务│  │检索服务   │          │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Ollama      │  │  LanceDB     │  │  本地存储    │
│  (LLM/Embed) │  │  (向量库)    │  │  (文档/配置) │
└──────────────┘  └──────────────┘  └──────────────┘
```

## 3. 核心模块

### 3.1 标签配置模块

支持三种标签类型：
- **单选** (`single_choice`)：从预定义选项中选择一个
- **多选** (`multiple_choice`)：从预定义选项中选择多个
- **填空** (`text_input`)：自由文本输入

标签配置存储在 SQLite 数据库中，包含名称、类型、描述、可选项、是否必填等字段。

**标签管理流程**：

```
┌─────────────┐
│  前端请求   │
└──────┬──────┘
       │
       ├─→ 创建标签 (POST /api/tags)
       │   ├─→ 验证请求数据
       │   ├─→ 创建 TagConfig 对象
       │   ├─→ 保存到 SQLite
       │   └─→ 返回标签信息
       │
       ├─→ 查询标签 (GET /api/tags)
       │   ├─→ 查询所有标签
       │   ├─→ 解析 JSON options
       │   └─→ 返回标签列表
       │
       ├─→ 更新标签 (PUT /api/tags/{id})
       │   ├─→ 查询标签是否存在
       │   │   ├─→ 不存在 → 返回 404
       │   │   └─→ 存在 → 更新标签字段 → 保存到数据库 → 返回更新后的标签
       │
       └─→ 删除标签 (DELETE /api/tags/{id})
           ├─→ 查询标签是否存在
           │   ├─→ 不存在 → 返回 404
           │   └─→ 存在 → 删除标签记录 → 返回成功消息
```

### 3.2 知识库管理模块

知识库是文档的组织单位，每个文档必须属于一个知识库。系统支持创建多个知识库，并自动创建默认知识库。

**知识库管理流程**：

```
┌─────────────┐
│  前端请求   │
└──────┬──────┘
       │
       ├─→ 创建知识库 (POST /api/knowledge-bases)
       │   ├─→ 验证知识库名称
       │   ├─→ 创建 KnowledgeBase 对象
       │   ├─→ 如果是第一个知识库，设置为默认
       │   ├─→ 保存到 SQLite
       │   └─→ 返回知识库信息
       │
       ├─→ 查询知识库列表 (GET /api/knowledge-bases)
       │   ├─→ 查询所有知识库
       │   ├─→ 支持按名称搜索
       │   └─→ 返回知识库列表
       │
       ├─→ 更新知识库 (PUT /api/knowledge-bases/{id})
       │   ├─→ 查询知识库是否存在
       │   │   ├─→ 不存在 → 返回 404
       │   │   └─→ 存在 → 更新名称 → 保存到数据库 → 返回更新后的知识库
       │
       └─→ 删除知识库 (DELETE /api/knowledge-bases/{id})
           ├─→ 查询知识库是否存在
           │   ├─→ 不存在 → 返回 404
           │   └─→ 存在 → 检查是否有文档
           │       ├─→ 有文档 → 返回错误（需先删除文档）
           │       └─→ 无文档 → 删除知识库记录 → 返回成功消息
```

**默认知识库**：
- 系统初始化时自动创建名为"默认知识库"的知识库
- 如果用户删除所有知识库，系统会自动重新创建默认知识库
- 默认知识库不能删除（如果它是最后一个知识库）

### 3.3 文档处理模块

**文档上传和处理流程**：

```
步骤 1: 文件上传
┌──────────────┐
│ 前端上传文件 │
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│ POST /api/documents/upload│
└──────┬──────────────────┘
       │
       ├─→ 验证文件类型
       │   ├─→ 不支持 → 返回 400 错误
       │   └─→ 支持 → 继续
       │
       ▼
┌─────────────────────────┐
│ 保存文件到 storage/uploads/│
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 创建 Document 记录      │
│ 状态: processing        │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 启动异步处理任务        │
│ (后台执行)              │
└──────┬──────────────────┘
       │
       ▼
步骤 2: 文档解析（按页面）
┌─────────────────────────┐
│ DocumentParser.parse    │
└──────┬──────────────────┘
       │
       ├─→ PDF 文件
       │   ├─→ 尝试 PyPDF2
       │   │   ├─→ 成功 → 按页面提取文本
       │   │   │   └─→ 返回 pages 数组，每页包含 page_number 和 content
       │   │   └─→ 失败 → 尝试 pdfplumber → 按页面提取文本
       │
       └─→ DOCX 文件
           └─→ 使用 python-docx → 将整个文档作为一页
       
       ▼
步骤 3: 按页面文本分块
┌─────────────────────────┐
│ 遍历每个页面            │
│ 对每页内容进行分块      │
│ TextSplitter.split_text │
└──────┬──────────────────┘
       │
       ├─→ 为每个 chunk 生成 chunk_id
       │   └─→ 格式: {document_id}_p{page_number}_c{chunk_index}
       │
       └─→ 每页包含: page_number, content, chunks[]
       
       ▼
步骤 4: 构建文档 JSON
┌─────────────────────────┐
│ 构建文档 JSON           │
│ 结构: {                 │
│   id, title,            │
│   pages: [{             │
│     page_number,        │
│     content,            │
│     chunks: [{          │
│       chunk_id,         │
│       page_number,       │
│       chunk_index,      │
│       content           │
│     }]                  │
│   }],                   │
│   metadata,             │
│   word_count,           │
│   chunk_count,          │
│   page_count            │
│ }                       │
│ 保存到 storage/documents/│
└──────┬──────────────────┘
       │
       ▼
步骤 5: 向量化（包含页面信息）
┌─────────────────────────┐
│ EmbeddingService.embed  │
│ _document                │
└──────┬──────────────────┘
       │
       ├─→ 提取所有页面的 chunks
       │   └─→ 每个 chunk 包含: chunk_id, content, page_number, chunk_index
       │
       ├─→ 生成内容 hash (SHA256)
       │
       ├─→ 检查向量缓存
       │   ├─→ 有缓存 → 加载缓存向量
       │   └─→ 无缓存 → Ollama Embedding 生成向量 → 保存向量缓存
       │
       ▼
步骤 6: 存储向量（包含页面元数据）
┌─────────────────────────┐
│ LanceDB.add_documents    │
│ 存储到向量数据库         │
│ 元数据包含:              │
│   - document_id          │
│   - chunk_id             │
│   - page_number          │
│   - chunk_index          │
└──────┬──────────────────┘
       │
       ▼
步骤 7: 更新状态
┌─────────────────────────┐
│ 更新 Document 状态      │
│ status: completed       │
│ 更新 json_path 和 metadata│
└─────────────────────────┘
```

**文档上传和处理流程（关联知识库）**：

```
步骤 1: 文件上传（指定知识库）
┌──────────────┐
│ 前端上传文件 │
│ 指定知识库ID │
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│ POST /api/documents/upload│
│ knowledge_base_id: xxx   │
└──────┬──────────────────┘
       │
       ├─→ 验证文件类型
       │   ├─→ 不支持 → 返回 400 错误
       │   └─→ 支持 → 继续
       │
       ├─→ 验证知识库存在
       │   ├─→ 不存在 → 返回 404
       │   └─→ 存在 → 继续
       │
       ▼
┌─────────────────────────┐
│ 保存文件到 storage/uploads/│
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 创建 Document 记录      │
│ knowledge_base_id: xxx  │
│ 状态: processing        │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 启动异步处理任务        │
│ (后台执行)              │
└──────┬──────────────────┘
       │
       ▼
步骤 2-7: 文档解析、分块、向量化（同原流程）
       │
       ▼
步骤 8: 更新状态
┌─────────────────────────┐
│ 更新 Document 状态      │
│ status: completed       │
│ 更新 json_path 和 metadata│
└─────────────────────────┘
```

### 3.4 向量化模块

**向量化流程**：

```
┌──────────────────────────────┐
│ EmbeddingService.embed_document│
└──────────┬───────────────────┘
           │
           ├─→ 接收文档 chunks_data
           │   └─→ 每个元素包含: chunk_id, content, page_number, chunk_index
           │
           ├─→ 提取所有 chunk 内容
           │
           ├─→ 生成缓存键: SHA256 hash
           │
           ├─→ 检查向量缓存
           │   │
           │   ├─→ 缓存存在
           │   │   └─→ 从 storage/vector-cache/ 加载
           │   │
           │   └─→ 缓存不存在
           │       ├─→ OllamaEmbeddingProvider.embed
           │       ├─→ 调用 Ollama API
           │       ├─→ 生成向量列表
           │       └─→ 保存到向量缓存
           │
           ├─→ 准备向量元数据
           │   └─→ 包含: document_id, chunk_id, page_number, chunk_index
           │
           ├─→ 构建向量数据
           │   └─→ 向量 + 文本 + 元数据（包含页面信息）
           │
           └─→ LanceDBProvider.add_documents
               ├─→ 打开 LanceDB 表
               ├─→ 添加向量、文本、元数据（包含 page_number, chunk_id）
               └─→ 存储到 LanceDB
```

### 3.5 检索模块

支持多种检索方案：
- **基础向量检索**：默认方案，基于余弦相似度
- **Multi-Query Retrieval**：将查询转换为多个相关查询（待实现）
- **HyDE**：生成假设性答案再检索（待实现）
- **Parent Document Retriever**：小 chunk 检索，大 chunk 返回（待实现）
- **RERANK**：使用交叉编码器重排序（待实现）
- **BM25**：基于关键词的检索（待实现）

**向量检索流程**：

```
┌──────────────────────────────┐
│ RetrievalService.retrieve    │
└──────────┬───────────────────┘
           │
           ├─→ 接收查询和参数
           │   ├─→ query: 查询字符串
           │   ├─→ document_id: 文档ID (可选)
           │   ├─→ method: 检索方法
           │   └─→ top_k: 返回数量
           │
           ├─→ 选择检索方法
           │   ├─→ basic (基础向量检索) ✓
           │   ├─→ multi_query (待实现)
           │   ├─→ hyde (待实现)
           │   ├─→ parent_document (待实现)
           │   ├─→ rerank (待实现)
           │   └─→ bm25 (待实现)
           │
           ▼
┌──────────────────────────────┐
│ _basic_retrieval             │
└──────────┬───────────────────┘
           │
           ├─→ OllamaEmbeddingProvider.embed
           │   └─→ 生成查询向量
           │
           ├─→ LanceDBProvider.search
           │   ├─→ 打开 LanceDB 表
           │   │
           │   ├─→ 应用过滤 (如有 document_id)
           │   │
           │   └─→ 执行向量搜索
           │       ├─→ 余弦相似度计算
           │       └─→ 限制返回 top_k 结果
           │
           ├─→ 转换为 pandas DataFrame
           │
           ├─→ 格式化结果
           │   ├─→ chunk_id
           │   ├─→ content
           │   ├─→ similarity
           │   └─→ metadata
           │
           └─→ 返回相似度、内容、元数据
```

### 3.6 信息提取模块

**单标签提取流程**：

```
步骤 1: 请求验证
┌─────────────────────┐
│ POST /api/extract   │
└──────────┬──────────┘
           │
           ├─→ 验证标签配置存在
           │   └─→ 不存在 → 返回 404
           │
           ├─→ 验证文档存在
           │   └─→ 不存在 → 返回 404
           │
           └─→ 检查文档状态
               └─→ 未完成 → 返回 400 错误
               └─→ 已完成 → 继续

步骤 2: 信息提取
┌──────────────────────────────┐
│ ExtractionService.extract     │
└──────────┬───────────────────┘
           │
           ├─→ 加载标签配置
           │   └─→ 解析 options JSON
           │
           ├─→ 构建查询字符串
           │   └─→ "标签名: 描述"
           │
           ├─→ RetrievalService.retrieve
           │   └─→ 检索相关文档片段 (top_k)
           │
           ├─→ _build_extraction_prompt
           │   ├─→ 构建 JSON Schema
           │   │   ├─→ single_choice → enum 约束
           │   │   ├─→ multiple_choice → array of enum
           │   │   └─→ text_input → string 类型
           │   │
           │   ├─→ 构建系统 Prompt
           │   │   └─→ 包含标签配置、提取要求、Schema
           │   │
           │   └─→ 添加文档片段到用户 Prompt
           │
           ├─→ OllamaProvider.generate
           │   └─→ 调用 Ollama LLM
           │
           └─→ _parse_extraction_result
               ├─→ 尝试直接解析 JSON
               │   └─→ 成功 → 返回结构化结果
               │
               ├─→ 尝试正则提取 JSON
               │   └─→ 成功 → 返回结构化结果
               │
               └─→ 失败 → 返回原始文本

步骤 3: 构建响应
┌─────────────────────┐
│ 构建来源信息         │
│ 返回提取结果和来源   │
└─────────────────────┘
```

**多标签提取流程**：

```
步骤 1: 请求验证
┌──────────────────────────────┐
│ POST /api/extract/multi-tags │
└──────────┬───────────────────┘
           │
           ├─→ 验证标签配置列表
           │   └─→ 验证失败 → 返回 400/404
           │
           └─→ 验证文档
               └─→ 验证失败 → 返回 400/404
               └─→ 验证成功 → 继续

步骤 2: 多标签提取
┌──────────────────────────────────┐
│ ExtractionService.extract_multiple│
│ _tags                            │
└──────────┬───────────────────────┘
           │
           ├─→ 收集所有标签查询
           │   └─→ 为每个标签构建 "标签名: 描述"
           │
           ├─→ 合并查询字符串
           │
           ├─→ 计算检索数量
           │   └─→ top_k * 标签数量
           │
           ├─→ RetrievalService.retrieve
           │   └─→ 检索相关文档片段
           │
           ├─→ _build_multi_tag_extraction_prompt
           │   ├─→ 为每个标签构建 Schema
           │   ├─→ 构建多标签 JSON Schema
           │   ├─→ 构建系统 Prompt
           │   └─→ 添加文档片段
           │
           ├─→ OllamaProvider.generate
           │   └─→ 调用 Ollama LLM
           │
           └─→ _parse_multi_tag_extraction_result
               ├─→ 尝试直接解析 JSON
               │   └─→ 成功 → 验证包含所有标签
               │       ├─→ 缺少标签 → 补充 null 值
               │       └─→ 完整 → 返回结果
               │
               ├─→ 尝试正则提取 JSON
               │   └─→ 成功 → 验证包含所有标签
               │
               └─→ 失败 → 返回空结果对象

步骤 3: 构建响应
┌─────────────────────┐
│ 构建来源信息         │
│ 返回多标签提取结果   │
└─────────────────────┘
```

**批量提取流程**：

```
┌──────────────────────────────┐
│ POST /api/extract/batch      │
└──────────┬───────────────────┘
           │
           ├─→ 验证标签配置
           │   └─→ 不存在 → 返回 404
           │
           └─→ 验证文档列表
               └─→ 部分不存在 → 返回 404
               └─→ 全部存在 → 继续

┌──────────────────────────────┐
│ 遍历文档列表                 │
└──────────┬───────────────────┘
           │
           ├─→ 检查文档状态
           │   │
           │   ├─→ 未完成 → 跳过该文档
           │   │
           │   └─→ 已完成
           │       ├─→ ExtractionService.extract
           │       ├─→ 执行单标签提取
           │       │
           │       └─→ 提取结果
           │           ├─→ 成功 → 添加到结果列表
           │           └─→ 失败 → 添加错误信息
           │
           └─→ 循环处理所有文档
               │
               └─→ 返回批量结果
                   └─→ 包含每个文档的提取结果或错误信息
```

## 4. 数据模型

### 4.1 数据库设计

**知识库表** (`knowledge_bases`)
```python
- id: String (UUID, 主键)
- name: String (知识库名称)
- is_default: Boolean (是否为默认知识库)
- created_at: DateTime (创建时间)
- updated_at: DateTime (更新时间)
```

**标签配置表** (`tag_configs`)
```python
- id: String (UUID, 主键)
- name: String (标签名称)
- type: String (标签类型: single_choice/multiple_choice/text_input)
- description: Text (标签描述)
- options: Text (JSON 字符串, 可选项列表)
- required: Boolean (是否必填)
- created_at: DateTime (创建时间)
- updated_at: DateTime (更新时间)
```

**文档表** (`documents`)
```python
- id: String (UUID, 主键)
- knowledge_base_id: String (外键, 关联 knowledge_bases.id)
- filename: String (文件名)
- file_type: String (文件类型: pdf/docx)
- file_path: String (原始文件路径)
- json_path: String (解析后的 JSON 文件路径)
- status: String (状态: processing/completed/failed)
- document_metadata: Text (JSON 字符串, 文档元数据)
- created_at: DateTime (创建时间)
- updated_at: DateTime (更新时间)
```

**文档向量表** (`document_vectors`)
```python
- id: String (UUID, 主键)
- document_id: String (外键, 关联 documents.id)
- chunk_index: Integer (chunk 索引)
- vector_id: String (LanceDB 中的向量 ID)
- created_at: DateTime (创建时间)
```

**提取结果表** (`extraction_results`)
```python
- id: String (UUID, 主键)
- tag_config_id: String (外键, 关联 tag_configs.id)
- document_id: String (外键, 关联 documents.id)
- result: Text (JSON 字符串, 提取结果)
- created_at: DateTime (创建时间)
```

### 4.2 数据流

**文档处理数据流**：

```
原始文件
   │
   ▼
Document 记录 ──────────→ SQLite (database.db)
   │
   ▼
文档 JSON ──────────────→ storage/documents/{id}.json
   │
   ▼
文本 Chunks
   │
   ▼
向量数据 ───────────────→ storage/vector-cache/{hash}.json
   │
   ▼
LanceDB ────────────────→ storage/lancedb/documents.lance/
```

**信息提取数据流**：

```
标签配置 (tag_configs) ──┐
                         │
                         ├─→ 构建查询
                         │
文档向量 (LanceDB) ───────┘
                         │
                         ▼
                     向量检索
                         │
                         ▼
                  相关文档片段
                         │
                         ├─→ 构建 Prompt
标签配置 ─────────────────┘
                         │
                         ▼
                    LLM 生成
                         │
                         ▼
                 结构化 JSON
                         │
                         ▼
                  提取结果 ───→ extraction_results (SQLite)
```

### 4.3 存储结构

```
storage/
├── database.db              # SQLite 数据库文件
│                            #   - tag_configs: 标签配置
│                            #   - documents: 文档记录
│                            #   - document_vectors: 向量索引
│                            #   - extraction_results: 提取结果
│
├── documents/                # 解析后的文档 JSON
│   └── {document_id}.json  # 包含: id, title, pages[], metadata, word_count, chunk_count, page_count
│                            # pages 数组: 每页包含 page_number, content, chunks[]
│                            # chunks 数组: 每个 chunk 包含 chunk_id, page_number, chunk_index, content
│
├── uploads/                 # 上传的原始文件
│   └── {filename}          # Multi-format files (pdf/docx/txt/md/csv/json/xlsx/pptx/eml)
│
├── vector-cache/            # 向量缓存 (基于内容 SHA256 hash)
│   └── {hash}.json         # 缓存向量列表，避免重复计算
│
└── lancedb/                 # LanceDB 向量数据库
    └── documents.lance/     # LanceDB 表文件
        ├── data/            # 向量数据文件
        ├── _versions/       # 版本管理
        └── _transactions/   # 事务日志
```

### 4.4 数据关系

```
┌─────────────────┐         ┌──────────────────┐
│ KnowledgeBase   │─────────│   Document       │
│                 │ 包含    │                  │
│ - id (PK)       │ 1:N     │ - id (PK)        │
│ - name          │         │ - knowledge_base_id│
│ - is_default    │         │ - filename        │
└─────────────────┘         │ - file_type       │
                            │ - file_path       │
                            │ - json_path       │
                            │ - status          │
                            └────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
        ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
        │ ExtractionResult │  │DocumentVector│  │   TagConfig      │
        │                  │  │              │  │                  │
        │ - id (PK)        │  │ - id (PK)    │  │ - id (PK)        │
        │ - tag_config_id  │  │ - document_id│  │ - name           │
        │ - document_id    │  │ - chunk_index│  │ - type           │
        │ - result         │  │ - vector_id  │  │ - description    │
        └──────────────────┘  └──────────────┘  │ - options        │
                                                │ - required       │
                                                └──────────────────┘

关系说明:
- KnowledgeBase 1:N Document (一个知识库包含多个文档)
- Document 1:N DocumentVector (一个文档包含多个向量块)
- Document 1:N ExtractionResult (一个文档可以有多个提取结果)
- TagConfig 1:N ExtractionResult (一个标签配置可以有多个提取结果)
```

## 5. API 接口

### 5.1 标签管理 API

**获取所有标签**
- `GET /api/tags`
- 响应: `{ success: true, data: { tags: [...] } }`

**获取单个标签**
- `GET /api/tags/{id}`
- 响应: `{ success: true, data: { tag: {...} } }`

**创建标签**
- `POST /api/tags`
- 请求体:
  ```json
  {
    "name": "项目名称",
    "type": "text_input",
    "description": "提取项目名称",
    "options": [],
    "required": true
  }
  ```
- 响应: `{ success: true, data: { tag: {...} }, message: "标签创建成功" }`

**更新标签**
- `PUT /api/tags/{id}`
- 请求体: (所有字段可选)
  ```json
  {
    "name": "新名称",
    "type": "single_choice",
    "description": "新描述",
    "options": ["选项1", "选项2"],
    "required": false
  }
  ```
- 响应: `{ success: true, data: { tag: {...} }, message: "标签更新成功" }`

**删除标签**
- `DELETE /api/tags/{id}`
- 响应: `{ success: true, message: "标签已删除" }`

### 5.2 知识库管理 API

**获取所有知识库**
- `GET /api/knowledge-bases?search=关键词`
- 查询参数:
  - `search`: 知识库名称搜索（可选）
- 响应: `{ success: true, data: { knowledge_bases: [...] } }`

**获取单个知识库**
- `GET /api/knowledge-bases/{id}`
- 响应: `{ success: true, data: { knowledge_base: {...} } }`

**创建知识库**
- `POST /api/knowledge-bases`
- 请求体:
  ```json
  {
    "name": "我的知识库"
  }
  ```
- 响应: `{ success: true, data: { knowledge_base: {...} }, message: "知识库创建成功" }`

**更新知识库**
- `PUT /api/knowledge-bases/{id}`
- 请求体:
  ```json
  {
    "name": "新名称"
  }
  ```
- 响应: `{ success: true, data: { knowledge_base: {...} }, message: "知识库更新成功" }`

**删除知识库**
- `DELETE /api/knowledge-bases/{id}`
- 说明: 如果知识库中有文档，需要先删除文档
- 响应: `{ success: true, message: "知识库已删除" }`

**获取知识库的文档列表**
- `GET /api/knowledge-bases/{id}/documents?page=1&page_size=20&status=completed`
- 响应: `{ success: true, data: { documents: [...], pagination: {...} } }`

### 5.3 文档管理 API

**上传文档**
- `POST /api/documents/upload`
- 请求: `multipart/form-data` (file: 文件, knowledge_base_id: 知识库ID)
- 响应: `{ success: true, data: { document: {...} }, message: "文档上传成功" }`
- 说明: 上传后立即返回，文档处理在后台异步进行

**获取文档列表**
- `GET /api/documents?page=1&page_size=20&status=completed&knowledge_base_id=xxx`
- 查询参数:
  - `page`: 页码 (默认: 1)
  - `page_size`: 每页数量 (默认: 20)
  - `status`: 状态过滤 (可选: processing/completed/failed)
  - `knowledge_base_id`: 知识库ID过滤 (可选)
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "documents": [...],
      "pagination": {
        "page": 1,
        "page_size": 20,
        "total": 100,
        "total_pages": 5
      }
    }
  }
  ```

**获取文档详情**
- `GET /api/documents/{id}`
- 响应: `{ success: true, data: { document: {...} } }`

**获取文档处理状态**
- `GET /api/documents/{id}/status`
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "status": "processing",
      "progress": 50,
      "message": "文档状态: processing"
    }
  }
  ```

**删除文档**
- `DELETE /api/documents/{id}`
- 说明: 删除文档记录、原始文件、JSON 文件和向量数据
- 响应: `{ success: true, message: "文档已删除" }`

### 5.4 信息提取 API

**单标签提取**
- `POST /api/extract`
- 请求体:
  ```json
  {
    "tag_config_id": "tag_123",
    "document_id": "doc_456",
    "retrieval_method": "basic",
    "top_k": 5,
    "rerank": false
  }
  ```
- 参数说明:
  - `tag_config_id`: 标签配置 ID (必填)
  - `document_id`: 文档 ID (必填)
  - `retrieval_method`: 检索方法 (可选: basic/multi_query/hyde/parent_document/rerank/bm25, 默认: basic)
  - `top_k`: 检索返回的文档片段数量 (默认: 5)
  - `rerank`: 是否重排序 (默认: false)
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "result": {
        "标签名": "提取的值"
      },
      "sources": [
        {
          "chunk_id": "doc_456_0",
          "document_id": "doc_456",
          "similarity": 0.85,
          "content": "文档片段内容..."
        }
      ],
      "extraction_time": 2.5
    }
  }
  ```

**多标签提取**
- `POST /api/extract/multi-tags`
- 请求体:
  ```json
  {
    "tag_config_ids": ["tag_123", "tag_456"],
    "document_id": "doc_789",
    "retrieval_method": "basic",
    "top_k": 5,
    "rerank": false
  }
  ```
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "result": {
        "标签1": "值1",
        "标签2": "值2"
      },
      "sources": [...],
      "extraction_time": 3.2
    }
  }
  ```

**批量提取**
- `POST /api/extract/batch`
- 请求体:
  ```json
  {
    "tag_config_id": "tag_123",
    "document_ids": ["doc_1", "doc_2", "doc_3"],
    "retrieval_method": "basic",
    "top_k": 5
  }
  ```
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "results": [
        {
          "document_id": "doc_1",
          "result": {...},
          "sources": [...]
        },
        {
          "document_id": "doc_2",
          "result": {},
          "sources": [],
          "error": "错误信息"
        }
      ]
    }
  }
  ```

### 5.5 系统配置 API

**获取系统配置**
- `GET /api/system/config`
- 响应: `{ success: true, data: { config: {...} } }`

**更新系统配置**
- `PUT /api/system/config`
- 请求体: 配置对象
- 响应: `{ success: true, data: { config: {...} }, message: "配置更新成功" }`

### 5.5 API 响应格式

所有 API 响应遵循统一格式：

```typescript
interface ApiResponse<T> {
  success: boolean;      // 请求是否成功
  data?: T;             // 响应数据 (成功时)
  message?: string;     // 消息 (可选)
  error?: string;       // 错误信息 (失败时)
}
```

错误响应示例：
```json
{
  "success": false,
  "error": "文档不存在"
}
```

## 6. 快速安装

### 前置要求

- Python 3.10+
- Node.js 18+ 和 npm
- Ollama（可选但推荐）

### 安装步骤

```bash
# 1. 使用安装脚本（推荐）
./install.sh  # Linux/Mac
install.bat   # Windows

# 2. 或手动安装
cd backend
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# 或 .venv\Scripts\activate  # Windows
pip install -r requirements.txt

cd ../frontend
npm install

# 3. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env
```

### 启动服务

```bash
./start.sh    # Linux/Mac
start.bat     # Windows
```

访问：
- 前端：http://localhost:3000
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

## 7. 环境配置

编辑 `backend/.env`：

```env
# LLM 配置
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# 向量数据库
LANCE_DB_PATH=./storage/lancedb

# 应用配置
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000

# 数据库
DATABASE_URL=sqlite:///./storage/database.db
```

## 8. 完整业务流程

### 8.1 系统初始化流程

```
启动 FastAPI 应用
   │
   ▼
lifespan 启动事件
   │
   ▼
init_db 初始化数据库
   │
   ├─→ 创建存储目录
   │   ├─→ storage/documents/
   │   ├─→ storage/uploads/
   │   ├─→ storage/vector-cache/
   │   └─→ storage/lancedb/
   │
   └─→ 创建数据库表
       ├─→ tag_configs 表
       ├─→ documents 表
       ├─→ document_vectors 表
       └─→ extraction_results 表
   │
   ▼
注册 API 路由
   ├─→ /api/tags
   ├─→ /api/documents
   ├─→ /api/extract
   └─→ /api/system
   │
   ▼
启动 CORS 中间件
   │
   ▼
应用就绪
```

### 8.2 典型使用流程

**1. 配置标签**

```
用户 → 前端: 创建标签配置
前端 → 后端: POST /api/tags
后端 → SQLite: 保存标签配置
SQLite → 后端: 返回标签 ID
后端 → 前端: 返回标签信息
前端 → 用户: 显示创建成功
```

**2. 上传文档**

```
用户 → 前端: 上传 PDF/Word/TXT/Markdown/CSV/JSON/XLSX/PPTX/EML 文件
前端 → 后端: POST /api/documents/upload
后端 → SQLite: 创建文档记录 (status: processing)
后端 → 前端: 返回文档信息
前端 → 用户: 显示上传成功
```

**3. 后台处理文档** (异步执行)

```
后端: 启动异步处理任务
  │
  ├─→ 解析文档内容 (DocumentParser)
  │
  ├─→ 按页面文本分块 (TextSplitter)
  │   └─→ 为每个 chunk 添加页面信息
  │
  ├─→ 保存文档 JSON (storage/documents/)
  │   └─→ 按页面结构存储
  │
  ├─→ 向量化文档 chunks（包含页面信息）
  │   │
  │   ├─→ 向量服务 → Ollama: 生成 embedding
  │   │   Ollama → 向量服务: 返回向量
  │   │
  │   └─→ 向量服务: 保存到 LanceDB
  │
  └─→ 后端 → SQLite: 更新文档状态 (status: completed)
```

**4. 执行信息提取**

```
用户 → 前端: 选择标签和文档
前端 → 后端: POST /api/extract
后端 → SQLite: 查询标签配置
后端 → SQLite: 查询文档信息
后端 → 向量服务: 检索相关文档片段
  │
  ├─→ 向量服务 → Ollama: 生成查询向量
  │   Ollama → 向量服务: 返回向量
  │
  └─→ 向量服务: 向量相似度搜索
      向量服务 → 后端: 返回相关片段
后端: 构建提取 Prompt
后端 → Ollama: 调用 LLM 提取信息
Ollama → 后端: 返回结构化 JSON
后端: 解析和验证结果
后端 → 前端: 返回提取结果
前端 → 用户: 显示提取结果
```

### 8.3 文档处理详细流程

```
文件上传
   │
   ▼
保存到 storage/uploads/
   │
   ▼
创建 Document 记录 (status: processing)
   │
   ▼
启动异步处理任务
   │
   ├─→ DocumentParser.parse
   │   │
   │   ├─→ PDF 文件
   │   │   ├─→ 尝试 PyPDF2
   │   │   │   └─→ 按页面提取，返回 pages 数组
   │   │   └─→ 失败则尝试 pdfplumber
   │   │       └─→ 按页面提取，返回 pages 数组
   │   │
   │   └─→ DOCX 文件
   │       └─→ 使用 python-docx
   │           └─→ 将整个文档作为一页，返回 pages 数组
   │
   ├─→ 遍历每个页面进行分块
   │   │
   │   ├─→ 对每页内容调用 TextSplitter.split_text
   │   │   └─→ RecursiveCharacterTextSplitter
   │   │       └─→ 生成页面 chunks
   │   │
   │   └─→ 为每个 chunk 生成 chunk_id
   │       └─→ 格式: {document_id}_p{page_number}_c{chunk_index}
   │
   ├─→ 构建文档 JSON（按页面结构）
   │   └─→ 保存到 storage/documents/
   │       └─→ 结构: { id, title, pages[], metadata, word_count, chunk_count, page_count }
   │
   ├─→ EmbeddingService.embed_document
   │   │
   │   ├─→ 提取所有页面的 chunks（包含页面信息）
   │   │
   │   ├─→ 检查向量缓存
   │   │   ├─→ 有缓存 → 加载缓存
   │   │   └─→ 无缓存 → Ollama Embedding → 保存缓存
   │   │
   │   └─→ LanceDB 存储（元数据包含 page_number, chunk_id）
   │
   └─→ 更新文档状态 (status: completed)
```

### 8.4 信息提取详细流程

```
提取请求
   │
   ├─→ 验证标签和文档
   │   ├─→ 标签不存在 → 返回 404
   │   ├─→ 文档不存在 → 返回 404
   │   └─→ 文档未完成 → 返回 400
   │
   ├─→ 加载标签配置
   │   └─→ 解析 options JSON
   │
   ├─→ 构建查询字符串
   │   └─→ "标签名: 描述"
   │
   ├─→ 选择检索方法
   │   └─→ basic / multi_query / hyde / ...
   │
   ├─→ RetrievalService.retrieve
   │   ├─→ 生成查询向量 (Ollama Embedding)
   │   ├─→ 向量数据库搜索 (LanceDB)
   │   └─→ 获取 top_k 相关片段
   │
   ├─→ 构建提取 Prompt
   │   ├─→ 根据标签类型构建 JSON Schema
   │   │   ├─→ 单选 → enum 约束
   │   │   ├─→ 多选 → array of enum
   │   │   └─→ 填空 → string 类型
   │   │
   │   ├─→ 构建系统 Prompt
   │   │   └─→ 包含标签配置、提取要求、Schema
   │   │
   │   └─→ 添加文档片段到用户 Prompt
   │
   ├─→ 调用 Ollama LLM
   │   └─→ 生成结构化 JSON
   │
   ├─→ 解析 JSON 结果
   │   ├─→ 直接解析
   │   ├─→ 正则提取
   │   └─→ 失败则返回原始文本
   │
   ├─→ 验证结果格式
   │
   ├─→ 构建来源信息
   │   └─→ chunk_id, similarity, content
   │
   └─→ 返回提取结果
```

## 9. Provider 抽象层设计

系统采用 Provider 抽象层设计，便于替换底层实现。

### 9.1 LLM Provider

**基类接口** (`providers/llm/base.py`):
```python
class LLMProvider:
    async def generate(prompt: str) -> str
    async def generate_stream(prompt: str) -> AsyncIterator[str]
```

**Ollama 实现** (`providers/llm/ollama.py`):
- 使用 `requests` 调用 Ollama API
- 支持流式和非流式生成
- 配置: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`

**扩展新 Provider**:
1. 在 `backend/providers/llm/` 创建新文件
2. 继承 `LLMProvider` 基类
3. 实现 `generate` 和 `generate_stream` 方法
4. 在 `extraction_service.py` 中替换 Provider 实例

### 9.2 Embedding Provider

**基类接口** (`providers/embedding/base.py`):
```python
class EmbeddingProvider:
    async def embed(texts: List[str]) -> List[List[float]]
```

**Ollama 实现** (`providers/embedding/ollama.py`):
- 调用 Ollama Embedding API
- 配置: `OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL`

**扩展新 Provider**:
1. 在 `backend/providers/embedding/` 创建新文件
2. 继承 `EmbeddingProvider` 基类
3. 实现 `embed` 方法
4. 在 `retrieval_service.py` 和 `embedding_service.py` 中替换

### 9.3 VectorDB Provider

**基类接口** (`providers/vector_db/base.py`):
```python
class VectorDBProvider:
    async def add_documents(vectors, texts, metadata)
    async def search(query_vector, top_k, filter) -> List[Dict]
```

**LanceDB 实现** (`providers/vector_db/lancedb.py`):
- 使用 LanceDB 存储向量
- 支持向量相似度搜索
- 支持元数据过滤

**扩展新 Provider**:
1. 在 `backend/providers/vector_db/` 创建新文件
2. 继承 `VectorDBProvider` 基类
3. 实现 `add_documents` 和 `search` 方法
4. 在 `retrieval_service.py` 和 `embedding_service.py` 中替换

### 9.4 Provider 使用流程

```
服务层
   │
   ▼
Provider 基类 (抽象接口)
   │
   ├─→ LLM Provider
   │   └─→ OllamaProvider → Ollama API
   │
   ├─→ Embedding Provider
   │   └─→ OllamaEmbeddingProvider → Ollama API
   │
   └─→ VectorDB Provider
       └─→ LanceDBProvider → LanceDB

说明:
- 服务层通过基类接口调用 Provider
- 具体实现可以替换，不影响服务层代码
- 便于扩展新的 Provider (如 OpenAI, ChromaDB 等)
```

## 10. 扩展性设计

### 10.1 添加新的检索方案

在 `backend/services/retrieval_service.py` 中：

1. 添加新的检索方法:
```python
async def _new_retrieval_method(
    self, query: str, document_id: str, top_k: int
) -> List[Dict[str, Any]]:
    # 实现检索逻辑
    pass
```

2. 在 `retrieve` 方法中注册:
```python
elif method == "new_method":
    return await self._new_retrieval_method(query, document_id, top_k)
```

### 10.2 添加新的文档格式

在 `backend/utils/document_parser.py` 中：

1. 添加解析方法:
```python
async def _parse_new_format(self, file_path: str) -> Dict[str, Any]:
    # 实现解析逻辑
    pass
```

2. 在 `parse` 方法中添加类型判断:
```python
elif file_type == "new_format":
    return await self._parse_new_format(file_path)
```

3. 在 `documents.py` API 中添加文件类型支持:
```python
allowed_types = [..., "application/new-format"]
```

### 10.3 添加新的标签类型

1. 在 `backend/app/models/schemas.py` 中扩展 `TagType` 枚举
2. 在 `extraction_service.py` 的 `_build_extraction_prompt` 中添加新类型的 Schema 构建逻辑
3. 在前端添加新类型的 UI 组件

## 11. 项目结构

```
anything-extract/
├── backend/                      # Python 后端
│   ├── app/                      # FastAPI 应用
│   │   ├── main.py              # FastAPI 应用入口，路由注册
│   │   ├── api/                 # API 路由模块
│   │   │   ├── tags.py         # 标签管理 API (CRUD)
│   │   │   ├── documents.py    # 文档管理 API (上传/查询/删除)
│   │   │   ├── extract.py      # 信息提取 API (单标签/多标签/批量)
│   │   │   └── system.py        # 系统配置 API
│   │   └── models/              # Pydantic 数据模型
│   │       └── schemas.py       # API 请求/响应模型定义
│   ├── core/                     # 核心模块
│   │   ├── config.py            # 配置管理 (环境变量/设置)
│   │   └── database.py          # 数据库连接和 ORM 模型
│   │                            #   - TagConfig: 标签配置表
│   │                            #   - Document: 文档表
│   │                            #   - DocumentVector: 文档向量表
│   │                            #   - ExtractionResult: 提取结果表
│   ├── services/                 # 服务层 (业务逻辑)
│   │   ├── document_service.py  # 文档处理服务
│   │   │                        #   - 解析文档
│   │   │                        #   - 文本分块
│   │   │                        #   - 生成文档 JSON
│   │   ├── embedding_service.py # 向量化服务
│   │   │                        #   - 向量缓存管理
│   │   │                        #   - 调用 Embedding Provider
│   │   │                        #   - 存储到向量数据库
│   │   ├── retrieval_service.py # 检索服务
│   │   │                        #   - 基础向量检索
│   │   │                        #   - 多种检索方法支持
│   │   └── extraction_service.py # 信息提取服务
│   │                            #   - 单标签提取
│   │                            #   - 多标签提取
│   │                            #   - Prompt 构建
│   │                            #   - 结果解析和验证
│   ├── providers/                # Provider 抽象层
│   │   ├── llm/                 # LLM Provider
│   │   │   ├── base.py         # LLM Provider 基类
│   │   │   └── ollama.py        # Ollama 实现
│   │   ├── embedding/           # Embedding Provider
│   │   │   ├── base.py         # Embedding Provider 基类
│   │   │   └── ollama.py        # Ollama Embedding 实现
│   │   └── vector_db/           # 向量数据库 Provider
│   │       ├── base.py         # VectorDB Provider 基类
│   │       └── lancedb.py       # LanceDB 实现
│   ├── utils/                    # 工具函数
│   │   ├── document_parser.py   # 文档解析器
│   │   │                        #   - PDF parsing (PyPDF2/pdfplumber/unstructured fallback)
│   │   │                        #   - DOCX parsing (unstructured/python-docx fallback)
│   │   └── text_splitter.py     # 文本分块器
│   │                            #   - RecursiveCharacterTextSplitter
│   ├── requirements.txt         # Python 依赖
│   └── pyproject.toml           # Python 项目配置
│
├── frontend/                     # Next.js 前端
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx             # 首页
│   │   ├── tags/                # 标签管理页面
│   │   │   ├── page.tsx        # 标签列表
│   │   │   ├── new/page.tsx     # 创建标签
│   │   │   └── [id]/edit/page.tsx # 编辑标签
│   │   ├── knowledge-bases/      # 知识库管理页面
│   │   │   ├── page.tsx        # 知识库列表
│   │   │   └── [id]/page.tsx   # 知识库详情（文档管理）
│   │   ├── documents/           # 文档管理页面（全局视图）
│   │   │   ├── page.tsx        # 文档列表
│   │   │   └── [id]/page.tsx   # 文档详情
│   │   └── extract/             # 信息提取页面
│   │       └── page.tsx         # 提取界面
│   ├── lib/                      # 工具库
│   │   └── api.ts               # API 客户端封装
│   ├── package.json             # Node.js 依赖
│   └── next.config.js           # Next.js 配置
│
├── docs/                         # 文档
│   └── ARCHITECTURE.md          # 系统架构文档
│
├── storage/                      # 数据存储 (运行时生成)
│   ├── database.db              # SQLite 数据库
│   ├── documents/                # 解析后的文档 JSON
│   ├── uploads/                  # 上传的原始文件
│   ├── vector-cache/             # 向量缓存 (基于内容 hash)
│   └── lancedb/                 # LanceDB 向量数据库文件
│
├── install.sh                   # Linux/Mac 安装脚本
├── install.bat                  # Windows 安装脚本
├── start.sh                     # Linux/Mac 启动脚本
├── start.bat                    # Windows 启动脚本
├── check-deps.sh                # 依赖检查脚本
└── README.md                    # 项目说明文档
```

### 11.1 关键文件说明

**后端核心文件**：

- `backend/app/main.py`: FastAPI 应用入口，注册所有路由，配置 CORS，初始化数据库
- `backend/core/database.py`: 定义所有数据库模型和表结构，提供数据库会话管理
- `backend/core/config.py`: 从环境变量加载配置，提供全局设置访问
- `backend/services/extraction_service.py`: 信息提取核心逻辑，包含 Prompt 构建和结果解析
- `backend/services/retrieval_service.py`: 向量检索服务，支持多种检索方法
- `backend/services/embedding_service.py`: 向量化服务，管理向量缓存和存储

**前端核心文件**：

- `frontend/app/extract/page.tsx`: 信息提取主界面，支持单标签和多标签提取
- `frontend/lib/api.ts`: API 客户端，封装所有后端 API 调用
- `frontend/app/documents/[id]/page.tsx`: 文档详情页，显示文档信息和处理状态

## 12. 常见问题

**Q: Ollama 连接失败**  
A: 确保 Ollama 服务正在运行：`ollama serve`

**Q: 文档处理失败**  
A: 检查文档格式是否支持，查看后端日志获取详细错误信息

**Q: 向量数据库错误**  
A: 检查 LanceDB 路径配置，确保有写入权限

**Q: pip 命令未找到**  
A: pip 通常随 Python 一起安装，如未找到：`python -m ensurepip --upgrade`
