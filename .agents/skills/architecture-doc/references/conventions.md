# 架构文档写作约定与反例

本文档补充架构文档 skill 的写作细节：推荐写法与应避免的反例，便于保持「关注结果与流程、不陷入细节」的风格。

## 1. 写「结果」与「边界」，不写「步骤」与「实现」

| 推荐 | 反例 |
|------|------|
| 「文档上传后进入队列或立即处理，处理完成后状态为 completed，可被检索。」 | 「先调用 upload_service.upload()，再根据 mode 决定是否 push 到 queue，worker 里会调用 parse() 再 segment()……」 |
| 「检索支持 semantic_search、hybrid_search、keyword_search，由 knowledge_base.retrieval_model 或请求参数决定。」 | 「在 retrieval_service 里有一个 if search_method == 'hybrid' 的分支，里面会先调 vector_store.search 再调 keyword_index.search……」 |
| 「每个知识库至少有一条默认的 process rule，支持 automatic/custom/hierarchical。」 | 「KnowledgeBaseProcessRuleRepository.get_default_rule 会查 knowledge_base_id，没有就 create 一条……」 |

## 2. 写「谁和谁连、数据从哪来到哪去」

| 推荐 | 反例 |
|------|------|
| 「提取流程：验证标签与文档 → 构建查询（可选 RAG 增强）→ 检索片段 → 按标签构建 Schema 与 Prompt → 调用 LLM → 解析并校验结果后返回。」 | 「ExtractService 里先 validate，然后 build_query 里可能调 RAG enhancement，然后 vector_store.search……」 |
| 「前端知识库文档列表通过轮询 indexing-status 展示索引进度；保存并处理触发 reindex 入队。」 | 「前端用 useEffect 每 2 秒请求一次 GET indexing-status，按钮 onClick 调 reindexApi……」 |
| 「解析支持 local/server/hybrid，hybrid 先调外部服务，失败则回退本地解析。」 | 「DocumentParser 的 _parse_pdf 里会看 config.parser_mode，如果是 hybrid 就 try request_ocr_service 然后 except 里用 pypdf……」 |

## 3. 模块与职责：到「层/领域/路由」即可

| 推荐 | 反例 |
|------|------|
| 「API 层：标签、知识库、文档、提取、系统配置等 REST 接口；核心服务层：解析、向量化与检索、入队与索引、信息提取与 RAG 增强。」 | 「routers/tags.py、routers/knowledge_bases.py、services/document_parser.py、services/embedding_service.py……」 |
| 「前端按路由：知识提取（标签、提取、设置）、知识库（列表、文档、分段、召回测试、设置）。」 | 「app/tags/page.tsx、app/extract/page.tsx、components/knowledge-base/DocumentList.tsx……」 |

说明：若确有需要，可写「具体文件与目录以代码仓库为准」，不在架构文档中维护完整文件树。

## 4. 接口描述：用途与契约，不写内部逻辑

| 推荐 | 反例 |
|------|------|
| 「POST /api/documents/upload：支持 processing_mode=queue|immediate、batch；返回 ingest_job 信息。」 | 「UploadRouter 里会读 request.body.processing_mode，然后调 document_service.create_with_upload，内部会写 document_ingest_jobs 表……」 |
| 「GET /api/knowledge-bases/{id}/documents/{docId}/indexing-status：返回当前索引进度（parsing/cleaning/splitting/indexing/completed/error）。」 | 「在 get_indexing_status 里会查 document.indexing_status 和 document_segments 的 status 聚合……」 |

## 5. 数据流与存储：概念与用途

| 推荐 | 反例 |
|------|------|
| 「文档处理数据流：原始文件 → 文档记录与解析结果 JSON → 分段 → 向量/关键词索引（含缓存）→ 向量库与数据库。」 | 「Document 表存 raw_file_path，parser 写入 parsed_content_path，SegmentService 写 document_segments，然后 VectorService 读 segment 表再写 LanceDB……」 |
| 「核心表：documents（文档与索引状态）、document_segments（分段内容与状态）、knowledge_base_process_rules（每知识库的预处理与分段规则）。」 | 「documents 表有 indexing_status 字段是 varchar，document_segments 有 content 和 status 和 hit_count……」 |

字段级细节属于数据字典或代码；架构文档只列「表/概念 + 主要用途」。

## 6. 不写「版本/阶段迭代历史」在概述中

架构文档描述**当前系统的最终结果**，不记录「某版本做了哪些迭代」。因此：

| 推荐 | 反例 |
|------|------|
| 概述与核心模块只写当前能力（如「上传支持 queue/immediate」「解析支持 local/server/hybrid」）；若需保留历史，在文档末尾设附录「版本迭代记录」单独放置。 | 在系统概述下写「Stage 1 Update (日期)」「Stage 2 Update (日期)」等段落，罗列某次迭代的 scope、backend 改动、worker、运行方式等。 |
| 主线条始终是「系统现在是什么、能做什么、和谁连」。 | 把文档当成「实现日记」或发布说明，按时间/阶段堆叠中间过程。 |

**原则**：读者打开文档应能立刻理解**当前**架构；迭代过程属于项目管理或附录，不放在概述或核心模块前。

## 7. 术语一致

- 全文统一用同一套术语（如「知识库」「文档」「分段」「检索」「提取」）。
- 与代码或 API 命名不一致时，可在首次出现时注明，例如：「知识库（对应 API 与库表 knowledge_base）。」

## 8. 小结

- **结果 > 过程**：写「是什么、能做什么、和谁连」，不写「某行代码怎么跑」。
- **流程与串联 > 细节**：写模块间衔接、数据流、关键 API，不写函数名与内部逻辑。
- **契约与边界 > 实现**：写接口用途与数据概念，不写实现细节。
- 遵循上述约定，架构文档才能长期作为「系统单一真相来源」，便于 AI 与人在开发前阅读、修改后同步更新。
