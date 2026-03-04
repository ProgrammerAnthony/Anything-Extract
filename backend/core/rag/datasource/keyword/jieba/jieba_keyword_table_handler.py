"""Jieba 关键词提取处理器。"""
from __future__ import annotations

import re
from typing import cast

from core.rag.datasource.keyword.jieba.stopwords import STOPWORDS


class JiebaKeywordTableHandler:
    def __init__(self):
        self._tfidf = self._load_tfidf_extractor()
        if hasattr(self._tfidf, "stop_words"):
            self._tfidf.stop_words = STOPWORDS  # type: ignore[attr-defined]

    def _load_tfidf_extractor(self):
        try:
            import jieba.analyse as jieba_analyse  # type: ignore
        except Exception:  # noqa: BLE001
            # 运行环境未安装 jieba 时，自动降级到纯 Python 关键词提取。
            return self._build_fallback_tfidf()

        tfidf = getattr(jieba_analyse, "default_tfidf", None)
        if tfidf is not None:
            return tfidf

        tfidf_class = getattr(jieba_analyse, "TFIDF", None)
        if tfidf_class is None:
            try:
                from jieba.analyse.tfidf import TFIDF  # type: ignore

                tfidf_class = TFIDF
            except Exception:  # noqa: BLE001
                tfidf_class = None

        if tfidf_class is not None:
            tfidf = tfidf_class()
            jieba_analyse.default_tfidf = tfidf  # type: ignore[attr-defined]
            return tfidf

        # 兜底实现：极端场景下没有 TFIDF 类也能退化运行。
        return self._build_fallback_tfidf()

    @staticmethod
    def _build_fallback_tfidf():
        try:
            import jieba  # type: ignore
        except Exception:  # noqa: BLE001
            jieba = None

        class _SimpleTFIDF:
            def __init__(self):
                self.stop_words = STOPWORDS
                self._lcut = getattr(jieba, "lcut", None) if jieba else None

            def extract_tags(self, sentence: str, top_k: int | None = 20, **kwargs):
                top_k = kwargs.pop("topK", top_k)
                cut = getattr(jieba, "cut", None) if jieba else None
                if self._lcut:
                    tokens = self._lcut(sentence)
                elif callable(cut):
                    tokens = list(cut(sentence))
                else:
                    # 无第三方分词时，按中文连续片段 + 单词退化切分。
                    tokens = re.findall(r"[\u4e00-\u9fff]+|\w+", sentence)

                words = [w for w in tokens if w and w not in self.stop_words]
                freq: dict[str, int] = {}
                for word in words:
                    freq[word] = freq.get(word, 0) + 1

                sorted_words = sorted(freq.items(), key=lambda item: item[1], reverse=True)
                if top_k is not None:
                    sorted_words = sorted_words[:top_k]

                return [item[0] for item in sorted_words]

        return _SimpleTFIDF()

    def extract_keywords(self, text: str, max_keywords_per_chunk: int | None = 10) -> set[str]:
        keywords = self._tfidf.extract_tags(sentence=text, topK=max_keywords_per_chunk)
        keywords = cast(list[str], keywords)
        return set(self._expand_tokens_with_subtokens(set(keywords)))

    def _expand_tokens_with_subtokens(self, tokens: set[str]) -> set[str]:
        results = set()
        for token in tokens:
            results.add(token)
            sub_tokens = re.findall(r"\w+", token)
            if len(sub_tokens) > 1:
                results.update({w for w in sub_tokens if w and w not in STOPWORDS})
        return results
