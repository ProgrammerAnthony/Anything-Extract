"""
dependent_server 独立配置
提供 OCR_MODEL_PATH 和 PDF_MODEL_PATH，供 OCR/PDF 服务使用。
路径可通过环境变量覆盖，Docker 部署时通过软链指向镜像内的模型文件。
"""
import os

_root = os.path.dirname(os.path.abspath(__file__))

# OCR 模型目录（需含 det.onnx / rec.onnx / ocr.res）
# Docker 模式下由 entrypoint 软链: dependent_server/ocr_server/ocr_models -> /root/models/ocr_models
OCR_MODEL_PATH = os.environ.get(
    "OCR_MODEL_PATH",
    os.path.join(_root, "ocr_server", "ocr_models"),
)

# PDF 解析模型根目录
# Docker 模式下由 entrypoint 软链:
#   dependent_server/pdf_parser_server/pdf_to_markdown/checkpoints -> /root/models/pdf_models
PDF_MODEL_PATH = os.environ.get(
    "PDF_MODEL_PATH",
    os.path.join(_root, "pdf_parser_server", "pdf_to_markdown"),
)
