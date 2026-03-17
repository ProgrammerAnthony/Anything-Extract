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

router = APIRouter()


@router.get("", response_model=ApiResponse)
async def get_tags(db: Session = Depends(get_db)):
    """获取所有标签配置"""
    tags = TagService.get_tags(db)
    return ApiResponse(
        success=True,
        data={"tags": tags}
    )


@router.get("/{tag_id}", response_model=ApiResponse)
async def get_tag(tag_id: str, db: Session = Depends(get_db)):
    """获取单个标签配置"""
    tag = TagService.get_tag(db, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    return ApiResponse(
        success=True,
        data={"tag": tag}
    )


@router.post("", response_model=ApiResponse)
async def create_tag(tag_data: TagConfigCreate, db: Session = Depends(get_db)):
    """创建标签配置"""
    tag = TagService.create_tag(db, tag_data)
    return ApiResponse(
        success=True,
        data={"tag": tag},
        message="标签创建成功"
    )


@router.put("/{tag_id}", response_model=ApiResponse)
async def update_tag(
    tag_id: str,
    tag_data: TagConfigUpdate,
    db: Session = Depends(get_db)
):
    """更新标签配置"""
    tag = TagService.update_tag(db, tag_id, tag_data)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    return ApiResponse(
        success=True,
        data={"tag": tag},
        message="标签更新成功"
    )


@router.delete("/{tag_id}", response_model=ApiResponse)
async def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    """删除标签配置"""
    success = TagService.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="标签不存在")
    return ApiResponse(
        success=True,
        message="标签已删除"
    )

