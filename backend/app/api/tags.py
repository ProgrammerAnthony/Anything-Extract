"""标签管理 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from app.models.schemas import (
    TagConfigCreate,
    TagConfigUpdate,
    ApiResponse
)
from app.services.tag_service import TagService
from app.utils.error_handler import handle_not_found, wrap_api_response

router = APIRouter()


@router.get("", response_model=ApiResponse)
@wrap_api_response()
async def get_tags(db: Session = Depends(get_db)):
    """获取所有标签配置"""
    return {"tags": TagService.get_tags(db)}


@router.get("/{tag_id}", response_model=ApiResponse)
@wrap_api_response()
@handle_not_found(resource_name="标签")
async def get_tag(tag_id: str, db: Session = Depends(get_db)):
    """获取单个标签配置"""
    return {"tag": TagService.get_tag(db, tag_id)}


@router.post("", response_model=ApiResponse)
@wrap_api_response(message="标签创建成功")
async def create_tag(tag_data: TagConfigCreate, db: Session = Depends(get_db)):
    """创建标签配置"""
    return {"tag": TagService.create_tag(db, tag_data)}


@router.put("/{tag_id}", response_model=ApiResponse)
@wrap_api_response(message="标签更新成功")
@handle_not_found(resource_name="标签")
async def update_tag(
    tag_id: str,
    tag_data: TagConfigUpdate,
    db: Session = Depends(get_db)
):
    """更新标签配置"""
    return {"tag": TagService.update_tag(db, tag_id, tag_data)}


@router.delete("/{tag_id}", response_model=ApiResponse)
@wrap_api_response(message="标签已删除")
async def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    """删除标签配置"""
    success = TagService.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="标签不存在")
    return {}

