"""Ollama LLM Provider"""
from typing import AsyncIterator
import ollama

from providers.llm.base import LLMProvider


class OllamaProvider(LLMProvider):
    """Ollama LLM Provider"""
    
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model
        self.client = ollama.Client(host=base_url)
    
    async def generate(self, prompt: str, **kwargs) -> str:
        """生成文本"""
        response = self.client.generate(
            model=self.model,
            prompt=prompt,
            **kwargs
        )
        return response["response"]
    
    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """流式生成文本"""
        stream = self.client.generate(
            model=self.model,
            prompt=prompt,
            stream=True,
            **kwargs
        )
        for chunk in stream:
            if "response" in chunk:
                yield chunk["response"]

