"""标签服务层"""
import json
from sqlalchemy.orm import Session
from typing import List, Dict, Optional

from core.database import TagConfig
from app.models.schemas import TagConfigCreate, TagConfigUpdate
from datetime import datetime


class TagService:
    """标签配置服务"""
    
    @staticmethod
    def serialize_tag(tag: TagConfig) -> Dict:
        """序列化标签为字典格式"""
        return {
            "id": tag.id,
            "name": tag.name,
            "type": tag.type,
            "description": tag.description,
            "options": json.loads(tag.options) if tag.options else [],
            "required": tag.required,
            "created_at": tag.created_at,
            "updated_at": tag.updated_at
        }
    
    @staticmethod
    def serialize_tags(tags: List[TagConfig]) -> List[Dict]:
        """批量序列化标签"""
        return [TagService.serialize_tag(tag) for tag in tags]
    
    @staticmethod
    def get_tags(db: Session) -> List[Dict]:
        """获取所有标签"""
        tags = db.query(TagConfig).all()
        return TagService.serialize_tags(tags)
    
    @staticmethod
    def get_tag(db: Session, tag_id: str) -> Optional[Dict]:
        """获取单个标签"""
        tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
        return TagService.serialize_tag(tag) if tag else None
    
    @staticmethod
    def create_tag(db: Session, tag_data: TagConfigCreate) -> Dict:
        """创建标签"""
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
        return TagService.serialize_tag(tag)
    
    @staticmethod
    def update_tag(db: Session, tag_id: str, tag_data: TagConfigUpdate) -> Optional[Dict]:
        """更新标签"""
        tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
        if not tag:
            return None
        
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
        return TagService.serialize_tag(tag)
    
    @staticmethod
    def delete_tag(db: Session, tag_id: str) -> bool:
        """删除标签"""
        tag = db.query(TagConfig).filter(TagConfig.id == tag_id).first()
        if not tag:
            return False
        
        db.delete(tag)
        db.commit()
        return True
