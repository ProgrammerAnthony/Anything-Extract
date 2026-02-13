"""信息提取服务"""
from typing import Dict, Any, List, Optional
import json
import time

from sqlalchemy.orm import Session
from core.database import TagConfig, Document, ExtractionResult
from services.retrieval_service import RetrievalService
from services.rag_enhancement_service import RAGEnhancementService
from services.llm_processing_service import LLMProcessingService
from providers.llm.ollama import OllamaProvider
from core.config import settings
from utils.logging import extract_logger, debug_logger


class ExtractionService:
    """信息提取服务"""
    
    def __init__(self, db: Session):
        self.db = db
        self.retrieval_service = RetrievalService()
        self.llm_provider = OllamaProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model
        )
        self.llm_processing_service = LLMProcessingService(self.llm_provider)
    
    async def extract_multiple_tags(
        self,
        tag_configs: List[TagConfig],
        document: Document,
        retrieval_method: str = "basic",
        top_k: int = 2,  # 默认只取2个片段
        rerank: bool = False,
        rag_enhancement_enabled: bool = False,
        rag_tag_enhancements: Optional[Dict[str, Any]] = None,
        save_to_db: bool = True
    ) -> Dict[str, Any]:
        """执行多标签信息提取 - 每个标签独立检索，但统一构建提示词"""
        start_time = time.time()
        tag_names = [tc.name for tc in tag_configs]
        extract_logger.info(f"{'='*80}")
        extract_logger.info(f"开始多标签提取 - 标签: {tag_names}, 文档: {document.id}, 方法: {retrieval_method}")
        extract_logger.info(f"{'='*80}")
        
        # 为每个标签独立检索
        tag_retrieval_results = {}
        all_chunks = {}  # 用于去重的chunk集合，key为chunk_id
        retrieval_times = {}
        
        extract_logger.info("步骤1: 为每个标签独立检索")
        for tag_config in tag_configs:
            tag_start = time.time()
            base_query = RAGEnhancementService.build_base_query(tag_config)

            enhanced_questions = []
            if rag_enhancement_enabled and rag_tag_enhancements:
                enhancement_item = rag_tag_enhancements.get(tag_config.id)
                if isinstance(enhancement_item, dict):
                    questions = enhancement_item.get("questions", [])
                    if isinstance(questions, list):
                        enhanced_questions = [
                            str(question).strip() for question in questions if str(question).strip()
                        ]

            queries = [base_query] + enhanced_questions
            seen_queries = set()
            deduped_queries = []
            for item in queries:
                if item not in seen_queries:
                    seen_queries.add(item)
                    deduped_queries.append(item)
            queries = deduped_queries

            extract_logger.info(
                f"  [{tag_config.name}] 构建查询: base=1, enhanced={len(enhanced_questions)}, total={len(queries)}"
            )
            
            # 独立检索
            query_results = []
            for query in queries:
                single_query_results = await self.retrieval_service.retrieve(
                    query=query,
                    document_id=document.id,
                    method=retrieval_method,
                    top_k=top_k,
                    rerank=rerank
                )
                query_results.append({
                    "query": query,
                    "results": single_query_results,
                })

            # 按 chunk_id 去重并保留最高相似度
            merged_by_chunk = {}
            for query_item in query_results:
                current_query = query_item["query"]
                for result_item in query_item["results"]:
                    chunk_id = result_item.get("chunk_id")
                    if not chunk_id:
                        chunk_id = f"__no_chunk__::{current_query}::{result_item.get('content', '')[:20]}"

                    enriched_result = dict(result_item)
                    enriched_result["query"] = current_query

                    if chunk_id not in merged_by_chunk:
                        merged_by_chunk[chunk_id] = enriched_result
                        continue

                    old_similarity = merged_by_chunk[chunk_id].get("similarity")
                    new_similarity = enriched_result.get("similarity")
                    if (new_similarity or 0) > (old_similarity or 0):
                        merged_by_chunk[chunk_id] = enriched_result

            search_results = sorted(
                merged_by_chunk.values(),
                key=lambda item: item.get("similarity") or 0,
                reverse=True,
            )[:top_k]

            tag_retrieval_time = time.time() - tag_start
            retrieval_times[tag_config.id] = tag_retrieval_time
            
            tag_retrieval_results[tag_config.id] = {
                "tag_config": tag_config,
                "query": base_query,
                "query_bundle": {
                    "base_query": base_query,
                    "enhanced_questions": enhanced_questions,
                    "queries": queries,
                },
                "results": search_results,
                "retrieval_time": tag_retrieval_time
            }
            
            # 收集所有chunks用于构建统一提示词
            for r in search_results:
                chunk_id = r.get("chunk_id")
                if chunk_id and chunk_id not in all_chunks:
                    all_chunks[chunk_id] = r["content"]
            
            extract_logger.info(f"  [{tag_config.name}] 检索完成，耗时: {tag_retrieval_time:.2f}秒，结果数: {len(search_results)}")
            # 记录每个标签的检索结果详情（前5个）
            for i, r in enumerate(search_results[:5], 1):
                extract_logger.info(f"    [{tag_config.name}] 检索结果[{i}] - 相似度: {r.get('similarity', 0):.4f}, chunk_id: {r.get('chunk_id')}")
            if len(search_results) > 5:
                extract_logger.info(f"    [{tag_config.name}] ... 还有 {len(search_results) - 5} 个结果")
        
        total_retrieval_time = sum(retrieval_times.values())
        extract_logger.info(f"所有标签检索完成，总耗时: {total_retrieval_time:.2f}秒，去重后chunks数: {len(all_chunks)}")
        
        # 构建多标签提取 Prompt（使用所有去重后的chunks）
        chunks_list = list(all_chunks.values())
        if not chunks_list:
            extract_logger.warning("没有可用的文档片段用于提取")
            total_time = time.time() - start_time
            result = {tag_config.name: None for tag_config in tag_configs}
            
            # 保存空结果到数据库
            if save_to_db:
                for tag_config in tag_configs:
                    extraction_result = ExtractionResult(
                        tag_config_id=tag_config.id,
                        document_id=document.id,
                        result=json.dumps({tag_config.name: None}, ensure_ascii=False),
                        retrieval_results=json.dumps([], ensure_ascii=False),
                        prompt="",
                        llm_request="",
                        llm_response="",
                        parsed_result=json.dumps({tag_config.name: None}, ensure_ascii=False),
                        extraction_time=json.dumps({
                            "total": total_time,
                            "retrieval": retrieval_times.get(tag_config.id, 0),
                            "llm": 0,
                            "parse": 0
                        }, ensure_ascii=False),
                        reasoning="",
                        original_content=""
                    )
                    self.db.query(ExtractionResult).filter(
                        ExtractionResult.tag_config_id == tag_config.id,
                        ExtractionResult.document_id == document.id
                    ).delete()
                    self.db.add(extraction_result)
                self.db.commit()
            
            return {
                "result": result,
                "sources": [],
                "tag_results": {
                    tag_config.id: {
                        "tag_id": tag_config.id,
                        "tag_name": tag_config.name,
                        "retrieval_results": [],
                        "result": None,
                        "sources": []
                    } for tag_config in tag_configs
                }
            }
        
        extract_logger.info(f"步骤2: 构建统一提示词")
        prompt = self._build_multi_tag_extraction_prompt(
            tag_configs=tag_configs,
            tag_retrieval_results=tag_retrieval_results
        )
        extract_logger.info(f"完整提示词:\n{'-'*80}\n{prompt}\n{'-'*80}")
        extract_logger.info(f"提示词长度: {len(prompt)}字符")
        
        # 调用 LLM + 解析校验（统一抽象）
        extract_logger.info("步骤3: 调用LLM并解析结果")
        scene = f"extract.multi_tags.{document.id}"
        workflow_result = await self.llm_processing_service.run_with_retry(
            prompt=prompt,
            logger=extract_logger,
            scene=scene,
            parse_fn=lambda text: self._parse_multi_tag_extraction_result(text, tag_configs),
            validate_fn=lambda parsed: self._validate_multi_tag_result_schema(parsed, tag_configs),
            request_payload={
                "tag_names": tag_names,
                "retrieval_method": retrieval_method,
                "top_k": top_k,
                "rerank": rerank,
                "rag_enhancement_enabled": rag_enhancement_enabled,
            },
            max_retries=3,
        )

        llm_time = workflow_result.llm_time
        parse_time = workflow_result.parse_time
        retry_count = workflow_result.retry_count
        result_text = workflow_result.response_text
        result = workflow_result.parsed_result

        if not workflow_result.success or result is None:
            error_msg = f"LLM结果解析/校验失败: {workflow_result.last_error or '未知错误'}"
            extract_logger.error(error_msg)
            raise Exception(error_msg)

        # 业务规则验证（标签值合法性）
        all_valid = True
        invalid_tags = []
        for tag_config in tag_configs:
            if not self._validate_extraction_result(result, tag_config):
                all_valid = False
                invalid_tags.append(tag_config.name)
                options = json.loads(tag_config.options) if tag_config.options else []
                extract_logger.warning(
                    f"标签 {tag_config.name} ({tag_config.type}) 验证失败，返回值: {result.get(tag_config.name)}, 可选项: {options}"
                )

        if not all_valid:
            extract_logger.warning(f"部分标签验证失败: {invalid_tags}，准备拆分为单个标签分别提取...")
            for tag_name in invalid_tags:
                tag_config = next(tc for tc in tag_configs if tc.name == tag_name)
                try:
                    enhancement_for_single_tag = None
                    if rag_tag_enhancements and tag_config.id in rag_tag_enhancements:
                        enhancement_for_single_tag = {tag_config.id: rag_tag_enhancements[tag_config.id]}

                    single_extract_result = await self.extract_multiple_tags(
                        tag_configs=[tag_config],
                        document=document,
                        retrieval_method=retrieval_method,
                        top_k=top_k,
                        rerank=rerank,
                        rag_enhancement_enabled=rag_enhancement_enabled,
                        rag_tag_enhancements=enhancement_for_single_tag,
                        save_to_db=False
                    )

                    single_tag_result = single_extract_result.get("result", {}).get(tag_name)
                    if single_tag_result is not None:
                        result[tag_name] = single_tag_result
                        extract_logger.info(f"  [{tag_name}] 单独提取成功")
                    else:
                        extract_logger.warning(f"  [{tag_name}] 单独提取结果为空")
                        result[tag_name] = {"values": [], "reasoning": "", "original_content": ""}
                except Exception as e:
                    extract_logger.error(f"  [{tag_name}] 单独提取失败: {str(e)}")
                    result[tag_name] = {"values": [], "reasoning": "", "original_content": ""}

            all_valid = True
            for tag_config in tag_configs:
                if not self._validate_extraction_result(result, tag_config):
                    all_valid = False
                    break

            if all_valid:
                extract_logger.info("拆分提取后所有标签验证通过")
            else:
                extract_logger.error("拆分提取后仍有标签验证失败，使用当前结果继续")
        
        extract_logger.info(f"解析前数据: {result_text[:200] if result_text else 'None'}...")
        extract_logger.info(f"解析后数据: {json.dumps(result, ensure_ascii=False, indent=2) if result else 'None'}")
        
        # 记录每个标签的reasoning和original_content
        for tag_config in tag_configs:
            tag_result_data = result.get(tag_config.name)
            if isinstance(tag_result_data, dict):
                reasoning = tag_result_data.get("reasoning", "")
                original_content = tag_result_data.get("original_content", "")
                extract_logger.info(f"  [{tag_config.name}] 推理过程: {reasoning[:200] if reasoning else '无'}...")
                extract_logger.info(f"  [{tag_config.name}] 推理原文: {original_content[:200] if original_content else '无'}...")
        
        total_time = time.time() - start_time
        extract_logger.info(f"多标签提取完成，总耗时: {total_time:.2f}秒 (检索: {total_retrieval_time:.2f}s, LLM: {llm_time:.2f}s, 解析: {parse_time:.2f}s), 重试次数: {retry_count}")
        extract_logger.info(f"{'='*80}")
        
        # 构建每个标签的结果和来源信息
        tag_results = {}
        all_sources = []
        for tag_config in tag_configs:
            tag_retrieval = tag_retrieval_results[tag_config.id]
            tag_result_data = result.get(tag_config.name)
            
            # 解析新格式：统一使用values字段（数组）
            if isinstance(tag_result_data, dict):
                values = tag_result_data.get("values", [])
                if not isinstance(values, list):
                    values = []
                
                # 根据标签类型处理values
                options = json.loads(tag_config.options) if tag_config.options else []
                if tag_config.type == "single_choice":
                    # 单选：如果返回多个值，只取第一个；如果为空数组，返回None
                    if len(values) == 0:
                        tag_value = None
                    else:
                        tag_value = values[0] if isinstance(values[0], str) else str(values[0])
                        # 确保值在可选项中
                        if tag_value not in options:
                            tag_value = None
                elif tag_config.type == "multiple_choice":
                    # 多选：过滤掉非可选项的内容
                    if len(values) == 0:
                        tag_value = []
                    else:
                        tag_value = [v for v in values if isinstance(v, str) and v in options]
                else:  # text_input
                    # 填空：取第一个值，或空数组时返回None
                    if len(values) == 0:
                        tag_value = None
                    else:
                        tag_value = values[0] if isinstance(values[0], str) else str(values[0])
                
                reasoning = tag_result_data.get("reasoning", "")[:30]  # 限制30字
                original_content = tag_result_data.get("original_content", "")[:30]  # 限制30字
            else:
                # 兼容旧格式：直接是值
                if tag_config.type == "multiple_choice":
                    tag_value = tag_result_data if isinstance(tag_result_data, list) else []
                else:
                    tag_value = tag_result_data
                reasoning = ""
                original_content = ""
            
            sources = [
                {
                    "chunk_id": r.get("chunk_id"),
                    "document_id": document.id,
                    "similarity": r.get("similarity"),
                    "content": r["content"],
                    "page_number": r.get("metadata", {}).get("page_number") if isinstance(r.get("metadata"), dict) else None
                }
                for r in tag_retrieval["results"]
            ]
            all_sources.extend(sources)
            
            tag_results[tag_config.id] = {
                "tag_id": tag_config.id,
                "tag_name": tag_config.name,
                "result": tag_value,
                "reasoning": reasoning,
                "original_content": original_content,
                "query_bundle": tag_retrieval.get("query_bundle", {
                    "base_query": tag_retrieval.get("query"),
                    "enhanced_questions": [],
                    "queries": [tag_retrieval.get("query")],
                }),
                "retrieval_results": tag_retrieval["results"],
                "sources": sources
            }
            
            # 保存到数据库
            if save_to_db:
                extraction_result = ExtractionResult(
                    tag_config_id=tag_config.id,
                    document_id=document.id,
                    result=json.dumps({tag_config.name: tag_value}, ensure_ascii=False),
                    retrieval_results=json.dumps(tag_retrieval["results"], ensure_ascii=False),
                    prompt=prompt,
                    llm_request=prompt,
                    llm_response=result_text,
                    parsed_result=json.dumps({tag_config.name: tag_value}, ensure_ascii=False),
                    extraction_time=json.dumps({
                        "total": total_time,
                        "retrieval": retrieval_times.get(tag_config.id, 0),
                        "llm": llm_time,
                        "parse": parse_time
                    }, ensure_ascii=False),
                    reasoning=reasoning,
                    original_content=original_content
                )
                # 删除该标签和文档的旧结果
                self.db.query(ExtractionResult).filter(
                    ExtractionResult.tag_config_id == tag_config.id,
                    ExtractionResult.document_id == document.id
                ).delete()
                self.db.add(extraction_result)
        
        if save_to_db:
            self.db.commit()
        
        return {
            "result": result,
            "sources": all_sources,
            "tag_results": tag_results,
            "prompt": prompt,
            "llm_response": result_text,
            "extraction_time": {
                "total": total_time,
                "retrieval": total_retrieval_time,
                "llm": llm_time,
                "parse": parse_time
            }
        }
    
    def _validate_extraction_result(self, result: Dict[str, Any], tag_config: TagConfig) -> bool:
        """验证提取结果是否符合标签配置要求"""
        if tag_config.name not in result:
            return False
        
        tag_result = result[tag_config.name]
        
        # 新格式：统一使用values字段（数组）
        if isinstance(tag_result, dict):
            values = tag_result.get("values", [])
            if not isinstance(values, list):
                values = []
        else:
            # 兼容旧格式：直接是值，转换为数组
            if tag_result is None:
                values = []
            elif isinstance(tag_result, list):
                values = tag_result
            else:
                values = [tag_result]
        
        options = json.loads(tag_config.options) if tag_config.options else []
        
        if tag_config.type == "single_choice":
            # 单选：values数组应该包含0个或1个值，且该值在可选项中
            if len(values) == 0:
                return True  # 空数组是允许的
            if len(values) == 1:
                # 如果返回多个值，只取第一个
                value = values[0] if isinstance(values[0], str) else str(values[0])
                return value in options
            # 如果返回多个值，取第一个进行验证
            if len(values) > 1:
                value = values[0] if isinstance(values[0], str) else str(values[0])
                return value in options
            return False
        elif tag_config.type == "multiple_choice":
            # 多选：values数组中的所有元素都必须在可选项中
            if len(values) == 0:
                return True  # 空数组是允许的
            # 过滤掉非可选项的内容
            filtered_values = [v for v in values if isinstance(v, str) and v in options]
            # 如果过滤后还有值，说明原始值都在可选项中
            return len(filtered_values) == len(values)
        else:  # text_input
            # 填空：values数组可以包含任意字符串
            return all(isinstance(item, str) or item is None for item in values)
    
    def _build_multi_tag_extraction_prompt(
        self,
        tag_configs: List[TagConfig],
        tag_retrieval_results: Dict[str, Dict[str, Any]]
    ) -> str:
        """构建多标签提取 Prompt - 统一提取规则，每个标签单独构建文档片段部分"""
        import json
        
        # 收集所有标签的可选项（用于统一说明）
        all_single_choice_options = {}  # {tag_name: [options]}
        all_multiple_choice_options = {}  # {tag_name: [options]}
        tag_type_map = {}  # {tag_name: type}
        
        for tag_config in tag_configs:
            options = json.loads(tag_config.options) if tag_config.options else []
            tag_type_map[tag_config.name] = tag_config.type
            if tag_config.type == "single_choice":
                all_single_choice_options[tag_config.name] = options
            elif tag_config.type == "multiple_choice":
                all_multiple_choice_options[tag_config.name] = options
        
        # 构建标签配置说明
        tag_descriptions = []
        for tag_config in tag_configs:
            tag_descriptions.append(
                f"- {tag_config.name} ({tag_config.type}): {tag_config.description or '无描述'}"
            )
        
        
        # 构建每个标签的文档片段部分（用<p></p>包裹）
        # 限制：每个标签只使用前2个片段，总字数不超过150字
        tag_content_sections = []
        for tag_config in tag_configs:
            tag_retrieval = tag_retrieval_results.get(tag_config.id, {})
            tag_chunks = [r["content"] for r in tag_retrieval.get("results", [])]
            
            # 只取前2个片段
            tag_chunks = tag_chunks[:2]
            
            if tag_chunks:
                # 限制总字数不超过150字
                total_length = 0
                limited_chunks = []
                for chunk in tag_chunks:
                    if total_length + len(chunk) <= 150:
                        limited_chunks.append(chunk)
                        total_length += len(chunk)
                    else:
                        # 截断最后一个片段
                        remaining = 150 - total_length
                        if remaining > 0:
                            limited_chunks.append(chunk[:remaining])
                        break
                
                chunks_text = chr(10).join(f'{chunk}' for chunk in limited_chunks)
                if tag_config.type == "single_choice":
                    tag_content_sections.append(f"""针对"{tag_config.name}"标签，是单选标签，请从下面文档片段中提取一个值返回到values字段，或values字段返回[]：

<p>
{chunks_text}
</p>""")
                elif tag_config.type == "multiple_choice":
                    tag_content_sections.append(f"""针对"{tag_config.name}"标签，是多选标签，请从下面文档片段中提取多个值返回到values字段，或values字段返回[]：

<p>
{chunks_text}
</p>""")
                else:
                    tag_content_sections.append(f"""针对"{tag_config.name}"标签，是填空标签，请从下面文档片段中提取一段文字返回到values字段，或values字段返回[]：

<p>
{chunks_text}
</p>""")
            else:
                tag_content_sections.append(f"""针对"{tag_config.name}"标签，没有相关片段，请针对values返回[]""")
        
        # 构建格式示例（使用真实的标签名和值，统一使用values字段）
        format_examples = []
        for tag_config in tag_configs:
            options = json.loads(tag_config.options) if tag_config.options else []
            if tag_config.type == "single_choice" and options:
                # 单选示例：values数组，但只包含一个值（从可选项中选一个）
                example_value = options[0]
                format_examples.append(f'  "{tag_config.name}": {{"values": ["比如返回：{example_value}， 可选项{options}中选择一个值，或返回空数组"], "reasoning": "这里输出对应的推理过程，30字内", "original_content": "这里输出对应的原文，30字内"}}')
            elif tag_config.type == "multiple_choice" and options:
                # 多选示例：values数组，可包含多个值（从可选项中选多个）
                example_values = f'["比如返回：{options[0]}， 可选项{options}中选择多个值，或返回空数组"]' if len(options) > 0 else "[]"
                format_examples.append(f'  "{tag_config.name}": {{"values": {example_values}, "reasoning": "这里输出对应的推理过程，30字内", "original_content": "这里输出对应的原文，30字内"}}')
            else:
                # 填空示例：values数组，包含提取的文本
                format_examples.append(f'  "{tag_config.name}": {{"values": ["输出从原文中提取的值，或返回空数组"], "reasoning": "这里输出对应的推理过程，30字内", "original_content": "这里输出对应的原文，30字内"}}')
        
        system_prompt = f"""规则：

返回JSON格式，必须包含values字段（数组），reasoning（推理过程，30字内）、original_content（原文片段，30字内），格式示例：
{{
{chr(10).join(format_examples)}
}}
"""
        
        user_prompt = f"""文档片段：

{chr(10).join(tag_content_sections)}
"""
        
        return f"{system_prompt}\n\n{user_prompt}"
    
    def _parse_multi_tag_extraction_result(
        self,
        result_text: str,
        tag_configs: List[TagConfig]
    ) -> Dict[str, Any]:
        """解析多标签提取结果"""
        import json
        import re
        
        if not result_text or not result_text.strip():
            extract_logger.warning("LLM返回结果为空")
            return {tag_config.name: None for tag_config in tag_configs}
        
        # 尝试直接解析整个文本
        try:
            result = json.loads(result_text.strip())
            if not isinstance(result, dict):
                raise ValueError(f"解析结果不是字典类型: {type(result)}")
            # 验证结果包含所有标签
            for tag_config in tag_configs:
                if tag_config.name not in result:
                    result[tag_config.name] = None
            extract_logger.info(f"直接解析JSON成功，包含标签: {list(result.keys())}")
            return result
        except json.JSONDecodeError as e:
            extract_logger.warning(f"直接解析JSON失败: {str(e)}")
        except Exception as e:
            extract_logger.warning(f"解析结果验证失败: {str(e)}")
        
        # 尝试提取 JSON（使用更健壮的正则表达式匹配嵌套JSON）
        # 匹配从第一个 { 开始到最后一个 } 结束的内容
        json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group())
                if not isinstance(result, dict):
                    raise ValueError(f"正则提取结果不是字典类型: {type(result)}")
                # 验证结果包含所有标签
                for tag_config in tag_configs:
                    if tag_config.name not in result:
                        result[tag_config.name] = None
                extract_logger.info(f"正则提取JSON成功，包含标签: {list(result.keys())}")
                return result
            except json.JSONDecodeError as e:
                extract_logger.warning(f"正则提取JSON解析失败: {str(e)}")
            except Exception as e:
                extract_logger.warning(f"正则提取结果验证失败: {str(e)}")
        
        # 如果无法解析，返回空结果
        extract_logger.error(f"无法解析LLM返回结果，原始文本: {result_text[:500]}")
        return {tag_config.name: None for tag_config in tag_configs}

    def _validate_multi_tag_result_schema(
        self,
        result: Dict[str, Any],
        tag_configs: List[TagConfig]
    ) -> tuple[bool, Optional[str]]:
        """验证多标签结果的基础Schema（是否包含每个标签和values字段）"""
        if not isinstance(result, dict):
            return False, f"解析结果类型错误: {type(result)}"

        for tag_config in tag_configs:
            tag_result = result.get(tag_config.name)
            if tag_result is None:
                return False, f"标签 {tag_config.name} 结果为None"
            if not isinstance(tag_result, dict):
                return False, f"标签 {tag_config.name} 结果格式错误: {type(tag_result)}"
            if "values" not in tag_result:
                return False, f"标签 {tag_config.name} 缺少values字段"

        return True, None
