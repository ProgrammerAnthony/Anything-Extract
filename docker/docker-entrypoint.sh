#!/bin/bash
# 后端容器入口：同时启动 ingest worker 和主服务

set -e

echo "=========================================="
echo "AnythingExtract Backend 启动"
echo "=========================================="

# 确保存储目录存在
mkdir -p storage/documents storage/vector-cache storage/lancedb storage/uploads logs

# 如果启用 ingest 队列，在后台启动 worker
if [ "${INGEST_DEFAULT_MODE:-queue}" = "queue" ]; then
    echo "启动 Ingest Worker（后台）..."
    python workers/ingest_worker.py &
    INGEST_PID=$!
    echo "Ingest Worker PID: $INGEST_PID"
fi

echo "启动 FastAPI 主服务（端口 ${API_PORT:-8888}）..."
exec python main.py
