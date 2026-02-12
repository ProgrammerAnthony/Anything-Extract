"""RAG 标签增强服务"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional
import json
import re

from core.database import TagConfig
from core.config import settings
from providers.llm.ollama import OllamaProvider
from services.llm_processing_service import LLMProcessingService
from utils.logging import extract_logger, rag_logger


class TagQueryEnhancementStrategy(ABC):
    """标签查询增强策略接口"""

    @abstractmethod
    async def generate_questions(self, tag_config: TagConfig, question_count: int) -> List[str]:
        """根据标签生成增强问题"""


class LLMTagQueryEnhancementStrategy(TagQueryEnhancementStrategy):
    """基于 LLM 的标签问题增强策略"""

    def __init__(self, llm_provider: Optional[OllamaProvider] = None):
        self.llm_provider = llm_provider or OllamaProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
        )
        self.llm_processing_service = LLMProcessingService(self.llm_provider)

    async def generate_questions(self, tag_config: TagConfig, question_count: int) -> List[str]:
        strategy_name = "llm_question_v1"
        rag_logger.info(f"{'='*80}")
        rag_logger.info(
            f"开始标签增强问题生成 - 策略: {strategy_name}, 标签: {tag_config.name}, 数量: {question_count}"
        )
        prompt = self._build_prompt(tag_config, question_count)

        rag_logger.info(
            f"[RAG][{tag_config.name}] 构建提示词完成，长度: {len(prompt)}"
        )
        rag_logger.info(
            f"[RAG][{tag_config.name}] 提示词内容:\n{'-'*80}\n{prompt}\n{'-'*80}"
        )

        try:
            llm_request_payload = {
                "provider": "ollama",
                "model": self.llm_provider.model,
                "base_url": self.llm_provider.base_url,
                "tag_name": tag_config.name,
                "question_count": question_count,
                "strategy": strategy_name,
            }
            workflow_result = await self.llm_processing_service.run_with_retry(
                prompt=prompt,
                logger=rag_logger,
                scene=f"rag.enhance.{tag_config.id}",
                parse_fn=lambda text: self._parse_questions(text),
                validate_fn=lambda parsed: (
                    isinstance(parsed, list) and len(parsed) > 0,
                    "问题列表为空或格式错误",
                ),
                request_payload=llm_request_payload,
                max_retries=3,
            )

            questions = workflow_result.parsed_result or []
            ensured_questions = self._ensure_question_count(questions, tag_config.name, question_count)
            rag_logger.info(
                f"[RAG][{tag_config.name}] 最终问题结果: {json.dumps(ensured_questions, ensure_ascii=False)}"
            )
            rag_logger.info(f"{'='*80}")
            return ensured_questions
        except Exception as exc:
            extract_logger.warning(
                f"标签增强问题生成失败，使用兜底模板。标签: {tag_config.name}, 错误: {str(exc)}"
            )
            fallback_questions = self._fallback_questions(tag_config.name, question_count)
            rag_logger.error(
                f"[RAG][{tag_config.name}] 生成失败，错误: {str(exc)}，兜底结果: {json.dumps(fallback_questions, ensure_ascii=False)}"
            )
            rag_logger.info(f"{'='*80}")
            return fallback_questions

    def _build_prompt(self, tag_config: TagConfig, question_count: int) -> str:
        options = self._parse_options(tag_config.options)
        options_text = "、".join(options) if options else "无"

        return f"""你是一个RAG查询增强助手。
请围绕给定标签，为文档检索生成{question_count}个不同角度的问题。

要求：
1. 只输出 JSON 数组，不要输出其他解释。
2. 每个元素必须是字符串问题。
3. 每个问题都必须紧扣标签语义，不要泛化。
4. 问题之间角度不同，避免重复。
5. 不要输出答案，不要引用不存在的信息。

标签名称：{tag_config.name}
标签类型：{tag_config.type}
标签描述：{tag_config.description or '无'}
标签可选项：{options_text}

输出示例：
["问题1", "问题2", "问题3"]
"""

    def _parse_questions(self, raw_response: str) -> List[str]:
        if not raw_response:
            return []

        text = raw_response.strip()

        try:
            parsed = json.loads(text)
            return self._sanitize_question_list(parsed)
        except Exception:
            pass

        json_array_match = re.search(r"\[.*\]", text, re.DOTALL)
        if json_array_match:
            try:
                parsed = json.loads(json_array_match.group())
                return self._sanitize_question_list(parsed)
            except Exception:
                pass

        line_items = [line.strip(" -•\t\r\n") for line in text.splitlines()]
        return self._sanitize_question_list(line_items)

    def _sanitize_question_list(self, data) -> List[str]:
        if not isinstance(data, list):
            return []

        cleaned: List[str] = []
        for item in data:
            question = str(item).strip() if item is not None else ""
            if not question:
                continue
            if question in cleaned:
                continue
            cleaned.append(question)
        return cleaned

    def _ensure_question_count(
        self,
        questions: List[str],
        tag_name: str,
        question_count: int,
    ) -> List[str]:
        if len(questions) >= question_count:
            return questions[:question_count]

        fallback = self._fallback_questions(tag_name, question_count)
        merged = questions[:]
        for question in fallback:
            if question not in merged:
                merged.append(question)
            if len(merged) >= question_count:
                break
        return merged[:question_count]

    def _fallback_questions(self, tag_name: str, question_count: int) -> List[str]:
        templates = [
            f"文档中关于“{tag_name}”的明确信息是什么？",
            f"有哪些内容可以支持判断“{tag_name}”？",
            f"“{tag_name}”在文档中出现在哪些关键段落？",
            f"与“{tag_name}”相关的限定条件或上下文是什么？",
            f"文档中是否存在与“{tag_name}”冲突或补充的信息？",
        ]
        return templates[:question_count]

    def _parse_options(self, options_raw: Optional[str]) -> List[str]:
        if not options_raw:
            return []

        try:
            parsed = json.loads(options_raw)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item is not None]
        except Exception:
            return []
        return []


class RAGEnhancementService:
    """RAG 增强服务，负责标签问题增强编排"""

    DEFAULT_STRATEGY = "llm_question_v1"

    def __init__(self):
        llm_provider = OllamaProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
        )

        self._strategies: Dict[str, TagQueryEnhancementStrategy] = {
            self.DEFAULT_STRATEGY: LLMTagQueryEnhancementStrategy(llm_provider=llm_provider),
        }

    async def enhance_tags(
        self,
        tag_configs: List[TagConfig],
        question_count: int = 3,
        strategy: Optional[str] = None,
    ) -> Dict[str, Dict[str, object]]:
        strategy_name = strategy or self.DEFAULT_STRATEGY
        rag_logger.info(f"{'='*80}")
        rag_logger.info(
            f"RAG增强批处理开始 - 策略: {strategy_name}, 标签数: {len(tag_configs)}, 问题数: {question_count}"
        )
        enhancement_strategy = self._strategies.get(strategy_name)
        if not enhancement_strategy:
            raise ValueError(f"不支持的RAG增强策略: {strategy_name}")

        result: Dict[str, Dict[str, object]] = {}
        for tag_config in tag_configs:
            base_query = self.build_base_query(tag_config)
            rag_logger.info(
                f"[RAG][{tag_config.name}] base_query: {base_query}"
            )
            questions = await enhancement_strategy.generate_questions(tag_config, question_count)

            result[tag_config.id] = {
                "tag_id": tag_config.id,
                "tag_name": tag_config.name,
                "base_query": base_query,
                "questions": questions,
                "strategy": strategy_name,
            }
        rag_logger.info(
            f"RAG增强批处理完成，输出标签: {list(result.keys())}"
        )
        rag_logger.info(
            f"RAG增强批处理结果: {json.dumps(result, ensure_ascii=False)}"
        )
        rag_logger.info(f"{'='*80}")
        return result

    @staticmethod
    def build_base_query(tag_config: TagConfig) -> str:
        description = (tag_config.description or "").strip()
        return f"{tag_config.name}: {description}".strip().rstrip(":")
