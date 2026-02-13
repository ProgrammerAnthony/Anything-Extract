"""通用 LLM 执行流程服务（LangChain + Provider 兼容）"""
from __future__ import annotations

from dataclasses import dataclass
import logging
import time
import traceback
from typing import Any, Callable, Dict, Generic, Optional, Tuple, TypeVar

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableLambda

from providers.llm.base import LLMProvider


T = TypeVar("T")


@dataclass
class LLMWorkflowResult(Generic[T]):
    """LLM 工作流执行结果"""

    success: bool
    parsed_result: Optional[T]
    response_text: str
    attempts: int
    retry_count: int
    llm_time: float
    parse_time: float
    last_error: Optional[str] = None


class LLMProcessingService:
    """统一封装 LLM 调用、日志、解析和重试逻辑"""

    def __init__(self, llm_provider: LLMProvider):
        self.llm_provider = llm_provider
        self.output_parser = StrOutputParser()
        self.runnable = RunnableLambda(self._invoke_provider_async)

    async def _invoke_provider_async(self, prompt: str) -> str:
        return await self.llm_provider.generate(prompt)

    def render_prompt_from_template(self, template: str, variables: Dict[str, Any]) -> str:
        prompt_template = PromptTemplate.from_template(template)
        return prompt_template.format(**variables)

    async def generate_text(
        self,
        prompt: str,
        logger: logging.Logger,
        scene: str,
        request_payload: Optional[Dict[str, Any]] = None,
        attempt: int = 1,
    ) -> Tuple[str, float]:
        logger.info(f"[{scene}] LLM调用开始，第{attempt}次")
        logger.info(f"[{scene}] 提示词长度: {len(prompt)}")
        logger.info(f"[{scene}] 提示词内容:\n{'-'*80}\n{prompt}\n{'-'*80}")
        if request_payload:
            logger.info(f"[{scene}] 请求参数: {request_payload}")

        llm_start = time.time()
        try:
            raw_response = await self.runnable.ainvoke(prompt)
            response_text = self.output_parser.parse(raw_response if raw_response else "")
            llm_elapsed = time.time() - llm_start
            logger.info(f"[{scene}] LLM调用完成，耗时: {llm_elapsed:.2f}秒，响应长度: {len(response_text)}")
            logger.info(f"[{scene}] LLM响应内容:\n{'-'*80}\n{response_text}\n{'-'*80}")
            return response_text, llm_elapsed
        except Exception as first_exc:
            logger.warning(f"[{scene}] LangChain Runnable 调用失败，回退 Provider 直连。错误: {str(first_exc)}")
            try:
                raw_response = await self.llm_provider.generate(prompt)
                response_text = self.output_parser.parse(raw_response if raw_response else "")
                llm_elapsed = time.time() - llm_start
                logger.info(f"[{scene}] Provider直连完成，耗时: {llm_elapsed:.2f}秒，响应长度: {len(response_text)}")
                logger.info(f"[{scene}] LLM响应内容:\n{'-'*80}\n{response_text}\n{'-'*80}")
                return response_text, llm_elapsed
            except Exception as second_exc:
                llm_elapsed = time.time() - llm_start
                logger.error(
                    f"[{scene}] LLM调用失败，耗时: {llm_elapsed:.2f}秒，错误: {str(second_exc)}"
                )
                logger.error(traceback.format_exc())
                raise second_exc from first_exc

    async def run_with_retry(
        self,
        prompt: str,
        logger: logging.Logger,
        scene: str,
        parse_fn: Callable[[str], T],
        validate_fn: Callable[[T], Tuple[bool, Optional[str]]],
        request_payload: Optional[Dict[str, Any]] = None,
        max_retries: int = 3,
    ) -> LLMWorkflowResult[T]:
        attempts = 0
        total_llm_time = 0.0
        total_parse_time = 0.0
        last_error: Optional[str] = None
        last_response_text = ""
        last_parsed_result: Optional[T] = None

        while attempts < max_retries:
            attempts += 1
            response_text, llm_elapsed = await self.generate_text(
                prompt=prompt,
                logger=logger,
                scene=scene,
                request_payload=request_payload,
                attempt=attempts,
            )
            total_llm_time += llm_elapsed
            last_response_text = response_text

            parse_start = time.time()
            try:
                parsed_result = parse_fn(response_text)
                last_parsed_result = parsed_result
                valid, reason = validate_fn(parsed_result)
                parse_elapsed = time.time() - parse_start
                total_parse_time += parse_elapsed
                if valid:
                    logger.info(
                        f"[{scene}] 解析与校验通过，解析耗时: {parse_elapsed:.2f}秒，第{attempts}次完成"
                    )
                    return LLMWorkflowResult(
                        success=True,
                        parsed_result=parsed_result,
                        response_text=response_text,
                        attempts=attempts,
                        retry_count=attempts - 1,
                        llm_time=total_llm_time,
                        parse_time=total_parse_time,
                        last_error=None,
                    )

                last_error = reason or "校验失败"
                logger.warning(f"[{scene}] 校验失败: {last_error}")
            except Exception as exc:
                parse_elapsed = time.time() - parse_start
                total_parse_time += parse_elapsed
                last_error = f"解析异常: {str(exc)}"
                logger.warning(f"[{scene}] 解析失败: {last_error}")

            if attempts < max_retries:
                logger.warning(f"[{scene}] 准备重试，剩余 {max_retries - attempts} 次")

        logger.error(f"[{scene}] 达到最大重试次数，最后错误: {last_error}")
        return LLMWorkflowResult(
            success=False,
            parsed_result=last_parsed_result,
            response_text=last_response_text,
            attempts=attempts,
            retry_count=max(0, attempts - 1),
            llm_time=total_llm_time,
            parse_time=total_parse_time,
            last_error=last_error,
        )

