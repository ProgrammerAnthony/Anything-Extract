# Repository Guidelines

## 项目定位与架构总览
AnythingExtract 是一个“文档结构化提取 + 知识库检索 + 标签抽取”的本地化系统，采用前后端分离：
- 后端：`FastAPI + SQLAlchemy + LangChain + LanceDB + Ollama`。
- 前端：`Next.js 14 + TypeScript + Tailwind`。
- 可选依赖服务：`dependent_server/ocr_server` 与 `dependent_server/pdf_parser_server`（通过 `parser_mode=hybrid` 联动）。
- 关键入口：后端 `backend/main.py`，前端 `frontend/app/*`，系统架构文档 `ARCHITECTURE.md`。

## 项目结构与模块职责
- `backend/app/`：API 层与请求模型。路由按领域拆分为 `tags`、`knowledge_bases`、`documents`、`extract`、`system`。
- `backend/core/`：核心能力与基础设施，包含配置（`config.py`）、数据库模型（`database.py`）、索引流程（`indexing_runner.py`）、RAG 清洗/分段与关键词能力。
- `backend/services/`：业务服务层（文档入队、解析、检索、提取、命中测试、知识库设置等），避免在路由里堆积复杂逻辑。
- `backend/workers/ingest_worker.py`：队列消费进程，轮询 `document_ingest_jobs` 执行异步入库与索引。
- `backend/utils/logging.py`：统一日志器，按 `debug/extract/document/embed/retrieval/rag` 分文件滚动输出。
- `frontend/app/`：页面路由，重点在 `knowledge-bases/[id]` 下的 documents/process/hit-testing/settings。
- `frontend/components/`：UI 与领域组件；`frontend/lib/api.ts` 汇总 API 客户端；`frontend/lib/knowledge/*` 组织页面数据访问。
- `docker/` 与 `docker-compose-*.yaml`：多平台容器编排，支持基础模式、`--profile models`、`--profile ollama`、`--profile full`。
- `storage/`：运行期数据目录（SQLite、上传文件、解析结果、LanceDB、缓存），默认不提交版本库。

## 本地开发与运行模式
- 推荐一键脚本：`./run.sh`。它会检查 Python/Node/pip、补装依赖并启动后端 + 前端；可选启动 ingest worker 与 OCR/PDF 服务。
- 文档处理模式：
  - `queue`：上传后写入 `document_ingest_jobs`，由 worker 消费。
  - `immediate`：上传后直接异步处理，不走队列。
- 解析模式：
  - `local`：仅本地解析。
  - `server`：仅外部 OCR/PDF 服务。
  - `hybrid`：优先服务，失败回退本地。
- 前端通过 `next.config.js` 的 rewrite 将 `/api/*` 转发到后端，默认 `http://localhost:8888`。

## 常用命令（开发/构建/检查）
```bash
# 本地一键启动（Linux/macOS/WSL/Git Bash）
./run.sh
./run.sh --without-ingest-server
./run.sh --immediate-mode
./run.sh --with-qanything-models-docker

# Docker 一键启动
./docker_run.sh
./docker_run.sh --with-models
./docker_run.sh --with-ollama
./docker_run.sh --full
./docker_run.sh --down

# 后端开发
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python main.py

# 前端开发
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm run format
```

## 编码规范与命名约定
- Python：4 空格缩进，函数/变量 `snake_case`，类 `PascalCase`，新增逻辑优先放 `services/`，路由层保持薄。
- Python 工具链：`black` + `isort`（行宽 100），类型检查遵循 `mypy`（`disallow_untyped_defs=true`）。
- TypeScript/React：组件文件 `PascalCase.tsx`，hooks 使用 `use-*.ts`，路由目录小写并遵守 Next.js App Router 约定。
- API 命名保持资源化风格，例如：`/api/knowledge-bases/{id}/documents/{docId}/segments/{segId}`。
- 状态字段请沿用既有枚举：`Document.status`（`queued/processing/completed/failed`）与 `indexing_status`（`waiting/parsing/.../completed/error`）。

## 测试与变更验收
- 当前仓库已声明 `pytest`/`pytest-asyncio` 依赖，但尚未形成完整测试目录；新增后端功能建议同步建立 `backend/tests/`。
- 命名建议：`test_<module>_<behavior>.py`，优先覆盖服务层（如 `document_ingest_service`、`retrieval_service`）而非仅测路由。
- 前端目前以静态检查和手工回归为主；提交前至少执行 `npm run lint`，并验证核心页面流程：
  - 知识库创建与设置保存。
  - 文档上传、处理状态轮询、分段查看。
  - hit-testing 与 extract 页面联调。
- 若改动影响脚本/容器，需附最小可复现命令与关键日志片段。

## 提交与 PR 规范
- 历史提交同时存在中文和英文，常见风格为短句动词开头；推荐统一为：`<scope>: <imperative summary>`。
- 示例：`backend: refine ingest queue retry handling`、`frontend: align knowledge-base settings form`。
- 单个提交应聚焦单一意图（功能、重构、修复分开），避免把格式化噪音与业务改动混在一起。
- PR 描述至少包含：
  - 变更背景与目标。
  - 影响目录与接口（例如是否变更 `api.ts` 或数据库字段）。
  - 配置项变更（`.env`、Docker profile、端口、模型地址）。
  - 验证证据（命令、日志、截图）。
  - 回滚或降级方案（若涉及队列、索引、解析服务）。

## 配置与安全注意事项
- 环境变量以 `backend/.env` 为主，重点键包括：`OLLAMA_BASE_URL`、`OLLAMA_MODEL`、`OLLAMA_EMBEDDING_MODEL`、`INGEST_DEFAULT_MODE`、`PARSER_MODE`、`ENABLE_OCR_SERVER`、`ENABLE_PDF_PARSER_SERVER`。
- 不要提交 `.env`、`storage/`、`logs/`、`.venv/`、`node_modules/`、`.next/`（见 `.gitignore`）。
- 任何涉及文件删除、批量状态更新、索引重建的接口变更，都应明确“幂等性、失败重试、错误回写”策略。

## 架构文档与协作约定
- 涉及系统流程、模块边界、状态机或关键数据模型变更时，必须同步更新根目录 `ARCHITECTURE.md`。
- 修改前先阅读现有架构文档，确保实现与文档一致；若实现有意偏离，需在 PR 中说明原因与迁移路径。
