"""
dependent_server 日志（替代 qanything_kernel.utils.custom_log）
提供 debug_logger / insert_logger，供 PDF 解析子模块使用。
"""
import logging
import os

_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

debug_logger = logging.getLogger("pdf_parser")
insert_logger = logging.getLogger("pdf_insert")
embed_logger = logging.getLogger("pdf_embed")
rerank_logger = logging.getLogger("pdf_rerank")
