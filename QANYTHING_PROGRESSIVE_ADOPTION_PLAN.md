# Anything-Extract 渐进式引入 QAnything 上传与解析流程实施方案

> 文档目的：作为后续多轮 AI/人工协作的统一上下文，指导 Anything-Extract 在不破坏现有架构的前提下，分阶段复用 QAnything 的上传、解析、OCR、PDF、rerank 方案，并保持前后端体验一致与可控。

## 0. 文档元信息

- 项目：`anything-extract`
- 参考源：`QAnything`
- 当前日期：2026-02-13
- 当前状态：规划阶段（未执行代码改造）
- 适用范围：本地部署优先，CPU 运行优先

## 1. 背景与目标

### 1.1 当前 Anything-Extract 的现状

- 文档上传与处理是单体流程：上传后在 API 进程中触发异步任务完成解析和向量化。
- 当前文件类型主要是 `pdf/docx`。
- 向量库为 LanceDB，元数据库为 SQLite。
- 启动方式是本地一键脚本：`anything-extract/run.sh`。

核心参考文件：

- `anything-extract/backend/app/api/documents.py`
- `anything-extract/backend/services/document_service.py`
- `anything-extract/backend/utils/document_parser.py`
- `anything-extract/backend/utils/text_splitter.py`
- `anything-extract/frontend/components/ui/FileUploadDialog.tsx`
- `anything-extract/ARCHITECTURE.md`
- `anything-extract/run.sh`

### 1.2 QAnything 的关键能力（本方案复用对象）

QAnything 的核心优势不是单个 loader，而是“分层+服务化”的整体机制：

- 上传 API 仅做接收与登记（快速返回），后续由独立服务处理。
- `insert_files_serve` 轮询任务队列并执行解析/切块/入库。
- OCR 与 PDF 解析为独立 HTTP 服务：
  - OCR：`/ocr`（7001）
  - PDF Parser：`/pdfparser`（9009）
- embed/rerank 也是独立服务（9001/8001），主服务通过 HTTP 调用。
- 各依赖组件可独立替换（README 强调）。

核心参考文件：

- `QAnything/qanything_kernel/qanything_server/handler.py`
- `QAnything/qanything_kernel/dependent_server/insert_files_serve/insert_files_server.py`
- `QAnything/qanything_kernel/core/retriever/general_document.py`
- `QAnything/qanything_kernel/dependent_server/ocr_server/ocr_server.py`
- `QAnything/qanything_kernel/dependent_server/pdf_parser_server/pdf_parser_server.py`
- `QAnything/qanything_kernel/dependent_server/pdf_parser_server/pdf_parser_backend.py`
- `QAnything/qanything_kernel/configs/model_config.py`
- `QAnything/scripts/entrypoint.sh`
- `QAnything/docker-compose-win.yaml`
- `QAnything/README_zh.md`

### 1.3 本项目目标

- 目标 1：按阶段引入 QAnything 方案，避免一次性重构风险。
- 目标 2：优先 CPU 可运行，优先复用现有 Anything-Extract 存储体系（SQLite + LanceDB）。
- 目标 3：除第一阶段外，每阶段引入能力都要在前端提供“可选开关”，让用户可渐进试用。
- 目标 4：全过程保持 `ARCHITECTURE.md` 与实现同步更新。

### 1.4 非目标（需单独确认）

- 不在未确认前切换 Milvus（重大选型变更）。
- 不在未确认前切换 MySQL（重大选型变更）。
- 不在未确认前将 FastAPI 主服务整体替换为 Sanic。

## 2. 你给出的约束（归纳后写入执行准则）

以下是必须长期遵守的执行准则（来自用户需求，已结构化）：

1. 分四阶段渐进式改造，不允许一次性全量重构。
2. 第一阶段不引入 dependent_server，仅引入更多 loader 与文件类型。
3. 第二阶段复用 `insert_files_serve` 思路，但必须适配 Anything-Extract 现有存储（非 MySQL）。
4. 第三阶段引入 `ocr_server` + `pdf_parser_server`，并搞清底层模型机制与启动方式。
5. 第四阶段引入 rerank，作用于 Anything-Extract 的“知识提取”链路。
6. 第二到第四阶段都要提供前端可选开关。
7. 每个阶段开始前和完成前，都要审阅并更新 `anything-extract/ARCHITECTURE.md`。
8. 文档必须可用于“会话中断后快速接续”。
9. 优先考虑与现有 `anything-extract/run.sh` 的整合，降低本地化门槛。
10. 前端实现要兼顾整体美观与一致性，不做“仅可用”的粗糙界面。

## 3. QAnything 关键底层机制（复刻前必须理解）

### 3.1 启动与编排机制

- Docker 启动 `qanything_local` 容器后，执行 `scripts/entrypoint.sh`。
- `entrypoint.sh` 会创建模型软链接，然后启动多个独立服务进程。
- Windows compose 映射主服务端口 `8777`，并将 `GATEWAY_IP` 指向 `host.docker.internal`。

参考：

- `QAnything/docker-compose-win.yaml`
- `QAnything/scripts/entrypoint.sh`

### 3.2 模型路径与软链接机制

- QAnything 代码中读取的是固定路径（如 OCR/PDF/EMBED/RERANK 模型目录）。
- 实际模型一般存在镜像内 `/root/models/...`，再通过 `ln -s` 挂到代码目录。
- 因此仓库看不到完整模型权重是正常现象。

参考：

- `QAnything/qanything_kernel/configs/model_config.py`
- `QAnything/scripts/entrypoint.sh`
- `QAnything/docker-compose-win.yaml`（镜像：`xixihahaliu01/qanything-win:v1.5.1`）

### 3.3 上传处理机制

- `upload_files`：只做校验、落盘、登记（状态置灰）。
- `insert_files_server`：后台轮询待处理任务，执行“解析 -> 分块 -> 向量入库 -> 状态更新”。
- 这种模式的价值是上传快、接口稳定、失败可重试、问答不被大文件阻塞。

参考：

- `QAnything/qanything_kernel/qanything_server/handler.py`
- `QAnything/qanything_kernel/dependent_server/insert_files_serve/insert_files_server.py`

### 3.4 OCR 与 PDF Parser 的职责边界

- OCR Server：针对图片（jpg/png/jpeg）做文本识别。
- PDF Parser Server：针对 PDF 做版面分析、表格结构提取、markdown 生成。
- `general_document.py` 会优先调用 PDF parser；失败时再走 fallback loader。

参考：

- `QAnything/qanything_kernel/dependent_server/ocr_server/ocr_server.py`
- `QAnything/qanything_kernel/dependent_server/pdf_parser_server/pdf_parser_server.py`
- `QAnything/qanything_kernel/core/retriever/general_document.py`

## 4. 渐进式改造总览

## 阶段 1：仅引入多类型 loader（不引入 dependent_server）

### 4.1 阶段目标

- 在 Anything-Extract 内直接增强文档加载能力。
- 扩展前后端支持文件类型。
- 复用 QAnything 的 loader 代码和解析策略。
- 不引入 OCR/PDF 独立服务，不引入任务队列服务。

### 4.2 建议支持类型（阶段 1）

- `md`, `txt`, `pdf`, `docx`, `xlsx`, `pptx`, `eml`, `json`, `csv`
- 图片类型 `jpg/png/jpeg`：阶段 1 可先“占位支持”，默认走轻量 fallback（例如仅提示 OCR 未启用或使用本地简版 OCR）。

### 4.3 可复制/复用代码（优先）

- 直接复制（高复用）：
  - `QAnything/qanything_kernel/utils/loader/csv_loader.py`
  - `QAnything/qanything_kernel/utils/loader/json_loader.py`
  - `QAnything/qanything_kernel/utils/loader/markdown_parser.py`
- 可改造复用：
  - `QAnything/qanything_kernel/core/retriever/general_document.py` 中的文件类型路由逻辑（`split_file_to_docs`）
  - 其中与 MySQL、URL 抓取、OCR/PDF server 调用强耦合片段需剥离。

### 4.4 Anything-Extract 后端改造点

- `backend/utils/document_parser.py`
  - 从 “if pdf/docx” 改为“按扩展名路由多 loader”。
  - 引入 markdown/json/csv/xlsx/pptx/eml 的处理分支。
- `backend/app/api/documents.py`
  - 上传校验改为 “扩展名 + MIME” 双校验。
  - 文档类型枚举扩展。
- `backend/services/document_service.py`
  - 仍保持当前输出 JSON 结构（`pages/chunks`）不变。
  - 新类型文档统一映射到兼容结构。
- `backend/requirements.txt`
  - 增加最小依赖：`unstructured`、`openpyxl`、`python-pptx`、`docx2txt`、`mistune`、`chardet`（按实际最小集收敛）。

### 4.5 Anything-Extract 前端改造点

- `frontend/components/ui/FileUploadDialog.tsx`
  - `accept` 扩展到新增类型。
  - 上传提示文案同步。
- `frontend/app/knowledge-bases/[id]/page.tsx`
- `frontend/app/documents/page.tsx`
  - 调整 `accept` 参数和类型展示。
  - UI 保持现有风格，不做违和控件。

### 4.6 架构文档同步要求（阶段 1）

- 开始前：在 `ARCHITECTURE.md` 增加“阶段 1 计划变更”小节。
- 完成前：更新“支持文件类型矩阵、解析流程图、失败降级策略”。

### 4.7 验收标准（阶段 1）

- 新类型可上传、可解析、可入向量库。
- 历史 `pdf/docx` 行为不回退。
- 前端文件选择、列表类型展示、状态轮询正常。

---

## 阶段 2：引入上传任务服务（复用 insert_files_serve 思路）

### 5.1 阶段目标

- 将“上传请求处理”与“解析向量化处理”解耦。
- API 快速返回，重处理在后台队列执行。
- 保持现有 SQLite + LanceDB，不引入 MySQL/Milvus（除非确认）。

### 5.2 核心复用思路（不是硬拷贝）

- 复用 `insert_files_server.py` 的任务状态机思想：
  - 待处理（gray/queued）
  - 处理中（yellow/processing）
  - 完成（green/completed）
  - 失败（red/failed）
- 复用其“轮询 + 锁定 + 超时 + 失败回写 + 日志记录”机制。

### 5.3 适配改造（关键）

> 必须适配 Anything-Extract 架构，不可直接照抄 MySQL SQL。

- 新增 SQLite 任务表（示例）：`document_ingest_jobs`
  - `id`, `document_id`, `status`, `attempts`, `error_msg`, `created_at`, `updated_at`, `started_at`, `finished_at`
- 新增后台 worker（建议）：
  - `backend/workers/ingest_worker.py`
  - 功能：轮询任务 -> 执行解析/向量化 -> 更新状态。
- `documents/upload` API 改为：
  - 写文件 + 写 Document + 写 Job + 立即返回。
- 任务并发控制：
  - 先单 worker，后续支持多 worker（悲观锁/状态原子更新）。

### 5.4 前端可选开关（阶段 2 强制）

- 在上传弹窗新增“处理模式”开关：
  - `即时处理（旧）`
  - `后台队列（QAnything式，推荐）`
- 在文档列表新增“队列状态/重试”按钮。
- 保持整体视觉风格一致（按钮层级、状态色与现有风格一致）。

### 5.5 架构文档同步要求（阶段 2）

- 开始前：更新 `ARCHITECTURE.md` 的“处理链路”图，从单体异步改为“上传 API + Ingest Worker”。
- 完成前：新增“任务状态机 + 重试机制 + 失败恢复流程”。

### 5.6 验收标准（阶段 2）

- 上传接口平均响应时间显著下降。
- 大文件解析不阻塞 API。
- 失败任务可见、可重试、可审计。

---

## 阶段 3：引入 OCR Server + PDF Parser Server

### 6.1 阶段目标

- 引入 QAnything 的独立 OCR/PDF 解析服务能力。
- 解析主流程从“本地内联”升级为“可选服务调用 + fallback”。

### 6.2 复用与复制策略

优先复用（建议直接复制到 vendor 目录）：

- OCR 服务：
  - `QAnything/qanything_kernel/dependent_server/ocr_server/*`
- PDF Parser 服务：
  - `QAnything/qanything_kernel/dependent_server/pdf_parser_server/*`

要点：

- OCR API：`POST /ocr`（7001）
- PDF API：`POST /pdfparser`（9009）
- `general_document.py` 的调用方式可直接借鉴（超时、失败降级）。

### 6.3 模型来源与部署说明（必须写清）

- 模型通常来自 QAnything 镜像：
  - `xixihahaliu01/qanything-linux:v1.5.1`
  - `xixihahaliu01/qanything-win:v1.5.1`
- 通过软链接挂载到代码目录（QAnything 默认做法）。

建议在 Anything-Extract 中提供两种部署模式：

1. `docker-model` 模式（推荐）：
   - 使用 QAnything 镜像内模型，降低模型管理成本。
2. `local-model` 模式：
   - 用户自备模型目录并配置路径。

### 6.4 Anything-Extract 后端改造点

- 新增服务调用桥接：`backend/services/qanything_parser_bridge.py`
  - `call_ocr_server(img64)`
  - `call_pdf_parser(filename, save_dir)`
- 在 `DocumentParser` 中新增策略：
  - `parser_mode=local|server|hybrid`
  - `hybrid`：先 server，失败 fallback local loader。
- 配置项新增（`core/config.py` + `.env`）：
  - `enable_ocr_server`
  - `enable_pdf_parser_server`
  - `ocr_server_url`
  - `pdf_parser_server_url`

### 6.5 前端可选开关（阶段 3 强制）

- 系统设置页新增：
  - `启用 OCR 服务`
  - `启用 PDF 解析服务`
  - `解析策略（local/server/hybrid）`
- 文档详情页展示：
  - 当前文档使用的解析策略
  - 解析耗时分解（可选）

### 6.6 run.sh 与本地化启动方案

目标：尽量复用 `anything-extract/run.sh` 的“一键心智”。

建议：

- `run.sh` 增加可选参数：
  - `--with-ocr-server`
  - `--with-pdf-server`
  - `--with-qanything-models-docker`
- 默认仍启动现有前后端；可选拉起新增服务。
- 若用户不启用服务，系统自动 fallback 到本地解析。

### 6.7 架构文档同步要求（阶段 3）

- 开始前：在 `ARCHITECTURE.md` 增加“解析服务层（OCR/PDF）”。
- 完成前：补充“服务依赖拓扑、模型路径策略、失败降级链路”。

### 6.8 验收标准（阶段 3）

- 图片 OCR 上传与解析可用。
- PDF 复杂布局解析质量提升可见（表格、图文混排）。
- 服务关闭时不影响基础可用性（fallback 成功）。

---

## 阶段 4：引入 rerank（用于知识提取链路）

### 7.1 阶段目标

- 在 Anything-Extract 的“知识提取检索阶段”引入 rerank。
- 保持向量库不变（默认仍 LanceDB），仅增加重排层。

### 7.2 复用来源

- rerank 服务端：
  - `QAnything/qanything_kernel/dependent_server/rerank_server/*`
- rerank 客户端调用方式：
  - `QAnything/qanything_kernel/connector/rerank/rerank_for_online_client.py`

### 7.3 Anything-Extract 后端改造点

- `services/retrieval_service.py`
  - 新增 rerank pipeline：
    1) 先向量召回 top_k
    2) 调用 rerank 服务重排
    3) 输出重排后片段给提取逻辑
- 配置项新增：
  - `enable_rerank_server`
  - `rerank_server_url`
  - `rerank_top_k`

### 7.4 前端可选开关（阶段 4 强制）

- 在提取页面新增：
  - `启用 rerank` 开关
  - `召回 top_k` 与 `重排 top_n` 参数
  - `重排来源提示`（server/local）

### 7.5 架构文档同步要求（阶段 4）

- 开始前：更新 `ARCHITECTURE.md` 的检索链路图（召回+重排）。
- 完成前：增加“质量/性能对比与默认参数建议”。

### 7.6 验收标准（阶段 4）

- 对提取结果准确率有稳定提升（至少在样例集上）。
- 关闭 rerank 时可回退到原逻辑。
- 前端参数可见、可控、可解释。

---

## 8. 重大技术选型确认点（必须提前确认）

以下项属于重大改造，执行前必须和用户确认：

1. 是否从 LanceDB 切换到 Milvus（默认不切）。
2. 是否从 SQLite 切换到 MySQL（默认不切）。
3. 是否将主服务从 FastAPI 切换 Sanic（默认不切）。
4. 是否把 QAnything 依赖服务完全容器化为独立 docker-compose（默认可选，不强制）。

## 9. 统一执行清单模板（每阶段都用）

### 9.1 阶段开始前（DoR）

- [ ] 阅读并更新 `anything-extract/ARCHITECTURE.md` 的“计划改造”小节。
- [ ] 明确本阶段开关项（前端可选能力）和默认值。
- [ ] 明确“直接复制文件”与“适配改造文件”清单。
- [ ] 确认不触发重大选型变更，或已获得确认。

### 9.2 阶段完成前（DoD）

- [ ] `ARCHITECTURE.md` 更新为“已实现架构”。
- [ ] 前后端开关联调通过。
- [ ] 回退路径测试通过（关闭新能力仍可用）。
- [ ] 在本文件新增“阶段复盘记录”。

## 10. 与现有 run.sh 的整合原则

- 默认继续“一键启动前后端”。
- 新能力通过参数可选启动，避免新用户认知负担。
- 推荐新增命令风格：

```bash
./run.sh \
  --with-queue \
  --with-ocr-server \
  --with-pdf-server \
  --with-rerank-server
```

- 若未启用新增服务，系统自动退化到当前基础能力。

## 11. 前端体验与美观约束（每阶段都要执行）

- 不新增与现有风格冲突的临时 UI。
- 新增开关放在“系统配置/上传配置/提取配置”统一区域。
- 状态展示要有明确语义：`排队中/处理中/完成/失败`。
- 错误信息可读，不显示原始异常堆栈给终端用户。

## 12. 建议的文件落地结构（Anything-Extract）

```text
anything-extract/
  backend/
    services/
      qanything_parser_bridge.py
      ingest_queue_service.py
    workers/
      ingest_worker.py
    vendor/
      qanything/
        loader/
        ocr_server/
        pdf_parser_server/
        rerank_server/
  frontend/
    components/
      settings/
        ParserModeSettings.tsx
        RetrievalModeSettings.tsx
```

> 注：`vendor/qanything` 仅用于“可追溯复用”，避免散拷贝导致后续升级困难。

## 13. 会话中断后复用指令（给新 AI/新同事）

如果开启新会话，先执行：

1. 阅读本文件：`anything-extract/QANYTHING_PROGRESSIVE_ADOPTION_PLAN.md`
2. 阅读架构文档：`anything-extract/ARCHITECTURE.md`
3. 按当前阶段执行“阶段开始前清单（DoR）”。
4. 仅在本阶段范围内修改，禁止跨阶段偷跑。

建议对新会话直接输入：

```text
请先阅读 anything-extract/QANYTHING_PROGRESSIVE_ADOPTION_PLAN.md 与 anything-extract/ARCHITECTURE.md。
当前执行阶段：<阶段编号>。
请严格按该阶段清单执行，并在开始前和完成前同步更新 ARCHITECTURE.md。
```

## 14. 阶段复盘记录模板（执行后填写）

### 阶段 N 复盘

- 时间：
- 目标完成度：
- 实际改动文件：
- 架构文档更新点：
- 风险与遗留问题：
- 是否触发下一阶段前置条件：

---

## 15. 最终说明

本方案强调“尽可能复用 QAnything + 尽可能保持 Anything-Extract 现有架构稳定”。

在未获得明确确认前：

- 不切 Milvus；
- 不切 MySQL；
- 不替换 FastAPI 主体；

仅做渐进增强与可回退集成。
