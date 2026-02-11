"""Embedding 模型维度映射"""
# Embedding 模型名称到维度的映射
EMBEDDING_MODEL_DIMENSIONS = {
    "all-minilm": 384,
    "all-minilm-l6-v2": 384,
    "bge-small": 384,
    "bge-small-en-v1.5": 384,
    "nomic-embed-text": 768,
    "nomic-embed-text-v1": 768,
    "nomic-embed-text-v1.5": 768,
    "text-embedding-ada-002": 1536,  # OpenAI (如果将来支持)
    "text-embedding-3-small": 1536,  # OpenAI (如果将来支持)
    "text-embedding-3-large": 3072,  # OpenAI (如果将来支持)
}


def get_embedding_dimension(model_name: str) -> int:
    """获取 embedding 模型的维度
    
    Args:
        model_name: 模型名称（可能包含版本号，如 "nomic-embed-text:v1"）
    
    Returns:
        模型维度，如果未知则返回 None
    """
    # 移除可能的版本号（如 "nomic-embed-text:v1" -> "nomic-embed-text"）
    base_model = model_name.split(":")[0] if ":" in model_name else model_name
    
    # 精确匹配
    if base_model in EMBEDDING_MODEL_DIMENSIONS:
        return EMBEDDING_MODEL_DIMENSIONS[base_model]
    
    # 部分匹配（处理变体）
    for model_key, dimension in EMBEDDING_MODEL_DIMENSIONS.items():
        if model_key in base_model or base_model in model_key:
            return dimension
    
    return None

