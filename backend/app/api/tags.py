"""标签管理 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db, TagConfig
from app.models.schemas import (
    TagConfigCreate,
    TagConfigUpdate,
    TagConfigResponse,
    ApiResponse
)
from datetime import datetime

router = APIRouter()


@router.get("", response_model=ApiResponse)
async def get_tags(db: Session = Depends(get_db)):
    """获取所有标签配置"""
    import json
    tags = db.query(TagConfig).all()
    tags_list = []
    for tag in tags:
        tags_list.append({
            "id": tag.id,
            "name": tag.name,
            "type": tag.type,
            "description": tag.description,
            "options": json.loads(tag.options) if tag.options else [],
            "required": tag.required,
            "created_at": tag.created_at,
            "updated_at": tag.updated_at
        })
    return ApiResponse(
        success=True,
        data={"tags": tags_list}
    )


@router.get("/{tag_id}", response_model=ApiResponse)
async def get_tag(tag_id: str, db: Session = Depends(get_db)):
    """获取单个标签配置"""
    import json
    tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    tag_dict = {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "options": json.loads(tag.options) if tag.options else [],
        "required": tag.required,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at
    }
    return ApiResponse(
        success=True,
        data={"tag": tag_dict}
    )


@router.post("", response_model=ApiResponse)
async def create_tag(tag_data: TagConfigCreate, db: Session = Depends(get_db)):
    """创建标签配置"""
    import json
    
    tag = TagConfig(
        name=tag_data.name,
        type=tag_data.type.value,
        description=tag_data.description,
        options=json.dumps(tag_data.options or []),
        required=tag_data.required
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    
    # 转换为响应格式
    tag_dict = {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "options": json.loads(tag.options) if tag.options else [],
        "required": tag.required,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at
    }
    
    return ApiResponse(
        success=True,
        data={"tag": tag_dict},
        message="标签创建成功"
    )


@router.put("/{tag_id}", response_model=ApiResponse)
async def update_tag(
    tag_id: str,
    tag_data: TagConfigUpdate,
    db: Session = Depends(get_db)
):
    """更新标签配置"""
    import json
    
    tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    if tag_data.name is not None:
        tag.name = tag_data.name
    if tag_data.type is not None:
        tag.type = tag_data.type.value
    if tag_data.description is not None:
        tag.description = tag_data.description
    if tag_data.options is not None:
        tag.options = json.dumps(tag_data.options)
    if tag_data.required is not None:
        tag.required = tag_data.required
    
    tag.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(tag)
    
    tag_dict = {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "options": json.loads(tag.options) if tag.options else [],
        "required": tag.required,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at
    }
    
    return ApiResponse(
        success=True,
        data={"tag": tag_dict},
        message="标签更新成功"
    )


@router.delete("/{tag_id}", response_model=ApiResponse)
async def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    """删除标签配置"""
    tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    db.delete(tag)
    db.commit()
    
    return ApiResponse(
        success=True,
        message="标签已删除"
    )

