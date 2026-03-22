from fastapi import HTTPException
from functools import wraps
from app.models.schemas import ApiResponse

def handle_not_found(resource_name: str = "资源"):
    """统一处理资源不存在的错误装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            if result is None:
                raise HTTPException(status_code=404, detail=f"{resource_name}不存在")
            return result
        return wrapper
    return decorator

def wrap_api_response(message: str = None):
    """统一包装API响应格式装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            data = await func(*args, **kwargs)
            response = {
                "success": True,
                "data": data
            }
            if message:
                response["message"] = message
            return response
        return wrapper
    return decorator
