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

### Stage 2 Update (2026-02-13)

- Scope: decouple upload request from heavy parsing/vectorization via QAnything-style queue worker.
- Backend queue model: added SQLite table `document_ingest_jobs` with state machine (`queued`, `processing`, `completed`, `failed`), retries, worker lock metadata.
- Upload API: `POST /api/documents/upload` now supports `processing_mode` (`queue` / `immediate`) and returns `ingest_job` snapshot.
- Worker service: added `backend/workers/ingest_worker.py` and orchestration service `backend/services/ingest_queue_service.py`.
- Retry API: added `POST /api/documents/{document_id}/retry` for failed/completed queue tasks.
- Frontend: KB document list now supports processing mode toggle, optimistic insertion, active polling for queued/processing tasks, and failed-task retry without page refresh.
- Run orchestration: `run.sh` now starts backend + frontend + ingest worker by default, with flags for queue/worker fallback.

### Stage 3 Update (2026-02-14)

- Scope: introduce optional OCR/PDF parser service layer with QAnything-style bridge and fallback strategy.
- Backend parser strategy: `DocumentParser` now supports `parser_mode=local|server|hybrid`, where `hybrid` tries server first then falls back to local parser.
- New dependent service bridge: added `backend/services/qanything_parser_bridge.py` for `/ocr` and `/pdfparser` HTTP calls.
- Runtime parser config: added `backend/services/runtime_config_service.py` and parser settings in `/api/system/config` (`enable_ocr_server`, `enable_pdf_parser_server`, URLs, parser mode, model source).
- Upload scope expanded: image formats `jpg/jpeg/png` are now accepted by upload API and can be parsed through OCR server or local fallback placeholder.
- Frontend Stage 3: added system settings page `/settings` for parser switches and strategy selection; document detail page now shows parser strategy metadata.
- Run orchestration: `run.sh` now supports `--with-ocr-server`, `--with-pdf-server`, `--with-qanything-models-docker`, with fallback to local parsing when dependent services are unavailable.

### 核心功能

系统包含三大核心模块：

**1. 知识提取模块**
- **标签配置管理**：支持单选、多选、填空三种标签类型
- **Document parsing**: supports PDF/DOCX/TXT/Markdown/CSV/JSON/XLSX/PPTX/EML/JPG/JPEG/PNG parsing, with Stage 3 parser mode switch (`local/server/hybrid`).
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

知识库模块按统一数据集规范扩展，并在本地部署场景做了简化（无租户字段）。

**KnowledgeBase 核心字段**：
- `indexing_technique`: `high_quality | economy`
- `doc_form`: `text_model | qa_model | hierarchical_model`
- `embedding_model` / `embedding_model_provider`
- `keyword_number`
- `retrieval_model`（JSON，包含 `search_method/top_k/score_threshold/reranking` 等）

**知识库流程**：
1. 创建知识库（`POST /api/knowledge-bases`）时初始化默认检索配置和默认 process rule。
2. 初始化创建（`POST /api/knowledge-bases/init`）支持一次性创建知识库 + 批量文档入队。
3. 更新知识库（`PATCH /api/knowledge-bases/{id}`）支持切换 `indexing_technique`、检索配置和 embedding 配置。
4. 切换经济/高质量模式时不删除历史索引数据，支持向量与关键词并存。

**默认知识库策略**：
- 系统启动时自动补齐默认知识库与默认 process rule。
- 仅剩最后一个知识库时禁止删除。

**前端知识库界面**（与 Dify 对齐）：
- 文档详情：当文档处于索引进度中（parsing/cleaning/splitting/indexing 等）时展示索引进度视图（EmbeddingProgress），轮询 `indexing-status`；完成后展示分段列表与右侧元数据面板。
- 文档处理流程：列表页上传成功后跳转至独立处理页 `/knowledge-bases/{id}/documents/{docId}/process`，顶部步骤条为 1 选择数据源 · STEP2 文本分段与清洗 · 3 处理并完成；STEP2 为分段设置与预览，主按钮「保存并处理」会保存配置、调用 reindex 入队并进入 STEP3；STEP3 展示嵌入完成、配置摘要与「前往文档」。
- 分段设置：与 Dify 文档处理 STEP2 一致，左栏为分段设置（通用：分段标识符/最大长度/重叠、预处理规则、Q&A 分段）、父子分段说明、索引方式（高质量/经济 OptionCard）、检索设置；右栏为预览（文件名、预估块数、点击「预览块」加载分段预览）。后端提供 `POST /knowledge-bases/{id}/documents/{docId}/preview-chunks` 用于按当前或传入规则预览分段结果。
- 召回测试：左侧为查询输入区（源文本、当前检索方式块点击打开检索设置抽屉、测试按钮）、查询记录表；右侧为召回结果。检索设置在抽屉内配置（向量/全文/混合或经济模式关键词，仅选中项展开 Top K/Score 阈值），与 Dify 一致。
- 知识库设置：表单与 Dify 像素级对齐，容器 max-w-[960px]、px-20 py-8、行布局 label w-[180px]；名称与图标、分段结构（只读 OptionCard + 了解更多链接）、索引方式（高质量/经济模式 OptionCard，经济模式展开关键词数量滑块与数字输入）、Embedding 只读、检索设置（向量/全文/混合或关键词 OptionCard 仅选中项展开 Top K/Score 阈值）、保存按钮。

### 3.3 文档处理模块

文档处理链路采用 `Extract -> Transform -> Load Segments -> Load` 四阶段流程，并兼容现有异步队列。

**入口**：
- `POST /api/documents/upload`：上传文件并创建 `Document`，支持 `queue | immediate` 两种处理模式。
- `POST /api/knowledge-bases/{id}/documents`：按本地文件路径创建文档并入队。
- `POST /api/knowledge-bases/init`：创建知识库后批量创建文档并入队。

**IndexingRunner 主流程**（`backend/core/indexing_runner.py`）：
1. `Extract`：根据 `data_source_info.file_path` 读取文件，复用 `DocumentParser.parse`。
2. `Transform`：`CleanProcessor` 执行预处理规则，再按 `process_rule.segmentation` 分段。
3. `Load Segments`：写入 `document_segments`（`position/content/keywords/index_node_id/status`）。
4. `Load`：双写索引（向量 + 关键词），支持经济/高质量自由切换时复用已有数据。

**状态模型**：
- `Document.status`：`queued/processing/completed/failed`（兼容历史队列状态）。
- `Document.indexing_status`：`waiting/parsing/cleaning/splitting/indexing/completed/error`。
- `DocumentSegment.status`：`waiting/indexing/completed/re_segment/error`。

**处理规则（Process Rule）**：
- 每个知识库至少有一条默认规则（`knowledge_base_process_rules`）。
- 支持 `automatic/custom/hierarchical` 模式及 `pre_processing_rules + segmentation` 配置。

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

检索模块支持多检索方法分发，并保留本地化实现。

**支持的方法**（`backend/services/retrieval_service.py`）：
- `semantic_search`（向量检索）
- `full_text_search`（向量库全文检索，调用 `search_by_full_text`）
- `hybrid_search`（向量 + 全文合并加权）
- `keyword_search`（Jieba 倒排）
- `basic`（兼容入口，内部映射为 `semantic_search`）

**检索配置来源**：
- 优先使用请求携带的 `retrieval_model`。
- 未传时回退到 `KnowledgeBase.retrieval_model`。
- 生效参数包括：`search_method/top_k/score_threshold/reranking_enable`。

**过滤规则**：
- 只返回 `DocumentSegment.enabled = true` 且 `DocumentSegment.status = completed` 的分段。
- 只返回 `Document.enabled = true` 且 `Document.archived = false` 的文档分段。

**命中统计**：
- 每次检索后自动累加 `DocumentSegment.hit_count`。

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
           ├─→ 为每个标签构建基础查询
           │   └─→ base_query = "标签名: 描述"
           │
           ├─→ （可选）注入标签增强问题
           │   └─→ queries = [base_query] + 3个增强问题
           │
           ├─→ 每个标签独立执行多查询检索
           │   ├─→ 对每个 query 执行 basic 检索
           │   └─→ 按 chunk_id 去重并取最高相似度
           │
           ├─→ RetrievalService.retrieve
           │   └─→ 检索相关文档片段（仅 basic）
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
│ 返回 query_bundle    │
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

核心数据表已按统一知识库模型扩展（SQLite 自动迁移在 `init_db()` 执行）。

**知识库表** `knowledge_bases`：
- 基础字段：`id/name/is_default/created_at/updated_at`
- 新增字段：`indexing_technique/doc_form/embedding_model/embedding_model_provider/keyword_number/retrieval_model`

**处理规则表** `knowledge_base_process_rules`：
- `id/knowledge_base_id/mode/rules/created_at`
- `rules` 为 JSON，包含预处理和分段策略

**关键词倒排表** `knowledge_base_keyword_tables`：
- `knowledge_base_id`（PK）
- `keyword_table`（JSON: `关键词 -> index_node_id[]`）

**文档表** `documents`（重点新增）：
- 数据源与流程：`data_source_type/data_source_info/process_rule_id/batch/position/created_from`
- 索引状态：`indexing_status/is_paused/error/stopped_at`
- 时间与统计：`processing_started_at/parsing_completed_at/cleaning_completed_at/splitting_completed_at/completed_at/word_count/tokens/indexing_latency`
- 可用性：`enabled/disabled_at/disabled_by/archived/archived_reason/archived_by/archived_at`

**分段表** `document_segments`（新增）：
- 结构字段：`document_id/knowledge_base_id/position/content/answer`
- 索引字段：`keywords/index_node_id/index_node_hash`
- 运行字段：`status/enabled/hit_count/indexing_at/completed_at/error`

**保留历史表**：
- `document_vectors`（兼容旧向量映射）
- `tag_configs`、`extraction_results`、`document_ingest_jobs`

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

**知识库接口**：
- `GET /api/knowledge-bases`
  - 支持 `keyword` 和兼容参数 `search`，并支持分页 `page/limit`
- `GET /api/knowledge-bases/{id}`
  - 返回知识库详情（含 `indexing_technique/doc_form/retrieval_model/embedding_model`）
- `POST /api/knowledge-bases`
  - 创建知识库并初始化默认 process rule
- `POST /api/knowledge-bases/init`
  - 一次性创建知识库 + 批量创建文档 + 返回 `batch` 批次号
- `PATCH /api/knowledge-bases/{id}` / `PUT /api/knowledge-bases/{id}`
  - 更新知识库配置，支持检索方式和索引模式切换
- `DELETE /api/knowledge-bases/{id}`
  - 删除知识库（最后一个知识库禁止删除）

**知识库文档与检索相关接口**：
- `GET /api/knowledge-bases/{id}/documents`
- `POST /api/knowledge-bases/{id}/documents`
- `PATCH /api/knowledge-bases/{id}/documents/status/{action}/batch`
- `GET /api/knowledge-bases/{id}/batch/{batchId}/indexing-status`
- `POST /api/knowledge-bases/{id}/hit-testing`

### 5.3 文档管理 API

**通用文档接口**：
- `POST /api/documents/upload`
  - 支持 `processing_mode=queue|immediate` 与 `batch` 参数
- `GET /api/documents`
- `GET /api/documents/{document_id}`
- `GET /api/documents/{document_id}/status`
- `POST /api/documents/{document_id}/retry`
- `DELETE /api/documents/{document_id}`

**知识库文档详情接口（新增）**：
- `GET /api/knowledge-bases/{id}/documents/{docId}`
- `POST /api/knowledge-bases/{id}/documents/{docId}/reindex`
  - 将文档重新加入索引队列（用于 process 页「保存并处理」后触发处理）
- `GET /api/knowledge-bases/{id}/documents/{docId}/indexing-status`
  - 返回 `indexing_status/completed_segments/total_segments/parsing_completed_at/...`
- `GET /api/knowledge-bases/{id}/documents/{docId}/segments`
- `PATCH /api/knowledge-bases/{id}/documents/{docId}/segments/{segId}`
  - 支持更新 `content/answer/keywords/enabled`
- `PATCH /api/knowledge-bases/{id}/documents/{docId}/segment/{action}?segment_id=...`
  - 支持分段批量启用/禁用

**状态操作说明**：
- 文档支持 `enable/disable/archive/un_archive` 批量状态变更。
- 归档文档不可编辑分段、不可重试索引（需先取消归档）。

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
    "rerank": false,
    "rag_enhancement_enabled": true,
    "rag_tag_enhancements": {
      "tag_123": {
        "tag_id": "tag_123",
        "tag_name": "标签名",
        "base_query": "标签名: 标签描述",
        "questions": ["问题1", "问题2", "问题3"],
        "strategy": "llm_question_v1"
      }
    }
  }
  ```
- 参数说明:
  - `tag_config_id`: 标签配置 ID (必填)
  - `document_id`: 文档 ID (必填)
  - `retrieval_method`: 检索方法 (当前仅支持: basic，默认: basic)
  - `top_k`: 检索返回的文档片段数量 (默认: 5)
  - `rerank`: 是否重排序 (默认: false)
  - `rag_enhancement_enabled`: 是否启用标签问题增强 (默认: false)
  - `rag_tag_enhancements`: 前端回传的标签增强问题数据 (可选)
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
    "rerank": false,
    "rag_enhancement_enabled": true,
    "rag_tag_enhancements": {
      "tag_123": {
        "tag_id": "tag_123",
        "tag_name": "标签1",
        "base_query": "标签1: 标签描述",
        "questions": ["问题1", "问题2", "问题3"],
        "strategy": "llm_question_v1"
      }
    }
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
      "tag_results": {
        "tag_123": {
          "tag_id": "tag_123",
          "tag_name": "标签1",
          "query_bundle": {
            "base_query": "标签1: 标签描述",
            "enhanced_questions": ["问题1", "问题2", "问题3"],
            "queries": ["标签1: 标签描述", "问题1", "问题2", "问题3"]
          },
          "retrieval_results": []
        }
      },
      "sources": [...],
      "extraction_time": 3.2
    }
  }
  ```

**标签 RAG 增强（问题生成）**
- `POST /api/extract/rag/enhance-tags`
- 请求体:
  ```json
  {
    "tag_config_ids": ["tag_123", "tag_456"],
    "question_count": 3,
    "strategy": "llm_question_v1"
  }
  ```
- 响应:
  ```json
  {
    "success": true,
    "data": {
      "strategy": "llm_question_v1",
      "tag_enhancements": {
        "tag_123": {
          "tag_id": "tag_123",
          "tag_name": "标签1",
          "base_query": "标签1: 标签描述",
          "questions": ["问题1", "问题2", "问题3"],
          "strategy": "llm_question_v1"
        }
      }
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
- 前端：http://localhost:3001
- 后端 API：http://localhost:8888
- API 文档：http://localhost:8888/docs

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
API_PORT=8888
FRONTEND_URL=http://localhost:3001

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
前端（可选）→ 后端: POST /api/extract/rag/enhance-tags
后端 → 前端: 返回每个标签3个增强问题（可刷新）
后端 → 向量服务: 检索相关文档片段
  │
  ├─→ 基础查询 + 增强问题逐条检索
  │
  ├─→ 向量服务 → Ollama: 生成查询向量
  │   Ollama → 向量服务: 返回向量
  │
  └─→ 向量服务: 向量相似度搜索（basic）
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
   │   └─→ base_query: "标签名: 描述"
   │
   ├─→ （可选）加载标签增强问题
   │   └─→ queries = [base_query] + enhanced_questions
   │
   ├─→ 选择检索方法
   │   └─→ 当前仅 basic（其他值自动回退）
   │
   ├─→ 按 query 列表执行 RetrievalService.retrieve
   │   ├─→ 逐条生成查询向量 (Ollama Embedding)
   │   ├─→ 向量数据库搜索 (LanceDB)
   │   ├─→ 融合去重（按 chunk_id 保留最高相似度）
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

### 10.1 扩展 RAG 增强策略（推荐）

当前检索层固定为 `basic`，高级 RAG 能力建议通过“标签增强层”渐进扩展。

在 `backend/services/rag_enhancement_service.py` 中：

1. 新增增强策略类并实现统一接口:
```python
class NewEnhancementStrategy(TagQueryEnhancementStrategy):
    async def generate_questions(self, tag_config, question_count):
        ...
```

2. 在 `RAGEnhancementService` 中注册策略:
```python
self._strategies["new_strategy"] = NewEnhancementStrategy(...)
```

3. 前端通过 `strategy` 参数切换:
```json
POST /api/extract/rag/enhance-tags
{ "strategy": "new_strategy" }
```

这样可在不改动 `ExtractionService` 主流程的前提下引入更多高级 RAG 方法。

### 10.1.1 Query Bundle 数据契约

每个标签在提取结果中都返回 `query_bundle`，用于前端可视化与后续扩展：

```json
{
  "base_query": "标签名: 标签描述",
  "enhanced_questions": ["问题1", "问题2", "问题3"],
  "queries": ["标签名: 标签描述", "问题1", "问题2", "问题3"]
}
```

- `base_query`: 标签原始查询语句
- `enhanced_questions`: 通过 RAG 增强层生成的问题
- `queries`: 实际参与检索的查询列表（去重后）

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
│   │   │                        #   - 非basic方法自动回退
│   │   ├── rag_enhancement_service.py # RAG标签增强服务
│   │   │                        #   - 标签增强问题生成
│   │   │                        #   - 策略路由与扩展点
│   │   └── extraction_service.py # 信息提取服务
│   │                            #   - 单标签提取
│   │                            #   - 多标签提取
│   │                            #   - Query Bundle 组装
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
- `backend/services/retrieval_service.py`: 向量检索服务（当前仅 `basic`）
- `backend/services/rag_enhancement_service.py`: RAG 标签增强服务，负责每标签问题生成与策略扩展
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

