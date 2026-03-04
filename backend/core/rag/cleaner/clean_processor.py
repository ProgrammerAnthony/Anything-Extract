"""文本清洗器。"""
from __future__ import annotations

import re


class CleanProcessor:
    @classmethod
    def clean(cls, text: str, process_rule: dict | None) -> str:
        # 默认字符清洗
        text = re.sub(r"<\|", "<", text)
        text = re.sub(r"\|>", ">", text)
        text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\xEF\xBF\xBE]", "", text)
        text = re.sub("\ufffe", "", text)

        rules = process_rule.get("rules") if process_rule else {}
        pre_rules = rules.get("pre_processing_rules") if isinstance(rules, dict) else None
        if not pre_rules:
            return text

        for pre_rule in pre_rules:
            if pre_rule.get("id") == "remove_extra_spaces" and pre_rule.get("enabled") is True:
                text = re.sub(r"\n{3,}", "\n\n", text)
                text = re.sub(r"[\t\f\r\x20\u00a0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]{2,}", " ", text)
            elif pre_rule.get("id") == "remove_urls_emails" and pre_rule.get("enabled") is True:
                # 去邮箱
                text = re.sub(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)", "", text)

                # 保护 markdown 链接和图片，避免把合法链接结构清掉。
                markdown_link_pattern = r"\[([^\]]*)\]\((https?://[^)]+)\)"
                markdown_image_pattern = r"!\[.*?\]\((https?://[^)]+)\)"
                placeholders: list[tuple[str, str, str]] = []

                def replace_markdown(match):
                    placeholder = f"__MARKDOWN_PLACEHOLDER_{len(placeholders)}__"
                    placeholders.append(("link", match.group(1), match.group(2)))
                    return placeholder

                def replace_image(match):
                    placeholder = f"__MARKDOWN_PLACEHOLDER_{len(placeholders)}__"
                    placeholders.append(("image", "image", match.group(1)))
                    return placeholder

                text = re.sub(markdown_link_pattern, replace_markdown, text)
                text = re.sub(markdown_image_pattern, replace_image, text)
                text = re.sub(r"https?://\S+", "", text)

                for i, (link_type, text_or_alt, url) in enumerate(placeholders):
                    placeholder = f"__MARKDOWN_PLACEHOLDER_{i}__"
                    if link_type == "link":
                        text = text.replace(placeholder, f"[{text_or_alt}]({url})")
                    else:
                        text = text.replace(placeholder, f"![{text_or_alt}]({url})")

        return text
