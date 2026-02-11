"""日志系统 - 参考 QAnything 实现"""
import logging
import os
from pathlib import Path
from concurrent_log_handler import ConcurrentRotatingFileHandler
import time


# 定义日志文件夹路径
debug_log_folder = './logs/debug_logs'
extract_log_folder = './logs/extract_logs'
document_log_folder = './logs/document_logs'
embed_log_folder = './logs/embed_logs'
retrieval_log_folder = './logs/retrieval_logs'

# 确保日志文件夹存在
for folder in [debug_log_folder, extract_log_folder, document_log_folder, embed_log_folder, retrieval_log_folder]:
    Path(folder).mkdir(parents=True, exist_ok=True)

# 创建 logger 实例
debug_logger = logging.getLogger('debug_logger')
extract_logger = logging.getLogger('extract_logger')
document_logger = logging.getLogger('document_logger')
embed_logger = logging.getLogger('embed_logger')
retrieval_logger = logging.getLogger('retrieval_logger')

# 设置日志级别
for logger in [debug_logger, extract_logger, document_logger, embed_logger, retrieval_logger]:
    logger.setLevel(logging.INFO)
    logger.propagate = False

# 创建 handler
debug_handler = ConcurrentRotatingFileHandler(
    os.path.join(debug_log_folder, "debug.log"), "a", 64 * 1024 * 1024, 256
)
extract_handler = ConcurrentRotatingFileHandler(
    os.path.join(extract_log_folder, "extract.log"), "a", 64 * 1024 * 1024, 256
)
document_handler = ConcurrentRotatingFileHandler(
    os.path.join(document_log_folder, "document.log"), "a", 64 * 1024 * 1024, 256
)
embed_handler = ConcurrentRotatingFileHandler(
    os.path.join(embed_log_folder, "embed.log"), "a", 64 * 1024 * 1024, 256
)
retrieval_handler = ConcurrentRotatingFileHandler(
    os.path.join(retrieval_log_folder, "retrieval.log"), "a", 64 * 1024 * 1024, 256
)

# 定义日志格式
process_type = 'MainProcess'
formatter = logging.Formatter(
    f"%(asctime)s - [PID: %(process)d][{process_type}] - [Function: %(funcName)s] - %(levelname)s - %(message)s"
)
simple_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

# 创建控制台 handler（同时输出到控制台和文件）
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

# 设置格式并添加 handler
debug_handler.setFormatter(formatter)
debug_logger.addHandler(debug_handler)
debug_logger.addHandler(console_handler)  # 同时输出到控制台

extract_handler.setFormatter(formatter)
extract_logger.addHandler(extract_handler)
extract_logger.addHandler(console_handler)  # 同时输出到控制台

document_handler.setFormatter(formatter)
document_logger.addHandler(document_handler)
document_logger.addHandler(console_handler)  # 同时输出到控制台

embed_handler.setFormatter(simple_formatter)
embed_logger.addHandler(embed_handler)
embed_logger.addHandler(console_handler)  # 同时输出到控制台

retrieval_handler.setFormatter(simple_formatter)
retrieval_logger.addHandler(retrieval_handler)
retrieval_logger.addHandler(console_handler)  # 同时输出到控制台

