#!/bin/bash
# QAnything 模型容器入口：使用 anything-extract 本地 dependent_server 代码
# 镜像（xixihahaliu01/qanything-{platform}:v1.5.1）提供 /root/models 中的 ML 模型
# 本脚本建立软链，并仅启动 OCR(:7001) 和 PDF Parser(:9009) 服务

WORKSPACE="/workspace/dependent_server"
OCR_DIR="${WORKSPACE}/ocr_server"
PDF_DIR="${WORKSPACE}/pdf_parser_server"

echo "=========================================="
echo "QAnything 模型服务启动（OCR + PDF Parser）"
echo "  代码来源: ${WORKSPACE}"
echo "  模型来源: /root/models"
echo "=========================================="

# 创建日志目录
mkdir -p "${WORKSPACE}/logs"

# ---- 建立 OCR 模型软链 ----
if [ ! -e "${OCR_DIR}/ocr_models" ]; then
    echo "建立 OCR 模型软链: ${OCR_DIR}/ocr_models -> /root/models/ocr_models"
    ln -s /root/models/ocr_models "${OCR_DIR}/ocr_models"
else
    echo "OCR 模型路径已存在: ${OCR_DIR}/ocr_models"
fi

# ---- 建立 PDF 解析模型软链 ----
PDF_CHECKPOINTS="${PDF_DIR}/pdf_to_markdown/checkpoints"
if [ ! -e "${PDF_CHECKPOINTS}" ]; then
    echo "建立 PDF 解析模型软链: ${PDF_CHECKPOINTS} -> /root/models/pdf_models"
    ln -s /root/models/pdf_models "${PDF_CHECKPOINTS}"
else
    echo "PDF 模型路径已存在: ${PDF_CHECKPOINTS}"
fi

# ---- 启动 OCR 服务（端口 7001）----
echo "启动 OCR 服务（端口 7001）..."
nohup python3 -u "${OCR_DIR}/ocr_server.py" --workers 1 \
    > "${WORKSPACE}/logs/ocr_server.log" 2>&1 &
OCR_PID=$!
echo "OCR Server PID: $OCR_PID"

# ---- 启动 PDF Parser 服务（端口 9009）----
echo "启动 PDF Parser 服务（端口 9009）..."
nohup python3 -u "${PDF_DIR}/pdf_parser_server.py" --workers 1 \
    > "${WORKSPACE}/logs/pdf_parser_server.log" 2>&1 &
PDF_PID=$!
echo "PDF Parser Server PID: $PDF_PID"

echo "=========================================="
echo "服务已启动："
echo "  OCR Server:        http://0.0.0.0:7001/ocr"
echo "  PDF Parser Server: http://0.0.0.0:9009/pdfparser"
echo "日志目录: ${WORKSPACE}/logs"
echo "=========================================="

# 保持容器运行，定期健康检查
while true; do
    sleep 10
    if ! kill -0 "$OCR_PID" 2>/dev/null; then
        echo "[warn] OCR Server 进程已退出，查看日志: ${WORKSPACE}/logs/ocr_server.log"
    fi
    if ! kill -0 "$PDF_PID" 2>/dev/null; then
        echo "[warn] PDF Parser 进程已退出，查看日志: ${WORKSPACE}/logs/pdf_parser_server.log"
    fi
done
