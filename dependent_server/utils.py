"""
dependent_server 工具函数（替代 qanything_kernel.utils.general_utils 中用到的部分）
"""
from typing import Any, Optional


def safe_get(request: Any, key: str, default: Optional[Any] = None) -> Optional[Any]:
    """从 Sanic request 中安全获取 JSON 字段。"""
    try:
        return request.json.get(key, default)
    except Exception:
        return default
