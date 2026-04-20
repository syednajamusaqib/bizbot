"""
File Name: models.py
Purpose: Define database models for users, WhatsApp conversations, messages,
         workflows, and contact messages using SQLAlchemy ORM.
Author: Omama Arshad
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
)
from sqlalchemy.orm import relationship

from database import Base
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, JSON, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum

# =========================
# TIME UTILITIES
# =========================
def utcnow():
    """Return current UTC time without timezone info."""
    return datetime.utcnow()

# =========================
# USER MODEL
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)

    roles = Column(JSON, default=["Business User"])
    is_active = Column(Boolean, default=True)

    google_sub = Column(String, unique=True, nullable=True)
    profile_picture_url = Column(String, nullable=True)

    job_title = Column(String, nullable=True)
    company = Column(String, nullable=True)

    notification_preferences = Column(
        JSON,
        default={
            "emailNotifications": True,
            "pushNotifications": True,
            "weeklyDigest": False,
            "workflowAlerts": True,
            "securityAlerts": True,
            "marketingEmails": False,
        },
    )

    created_at = Column(DateTime, default=utcnow)

    whatsapp_conversations = relationship(
        "WhatsAppConversation",
        back_populates="user",
        foreign_keys="[WhatsAppConversation.user_id]",
    )

    assigned_conversations = relationship(
        "WhatsAppConversation",
        back_populates="assigned_agent",
        foreign_keys="[WhatsAppConversation.assigned_agent_id]",
    )


# =========================
# WHATSAPP CONVERSATION MODEL
# =========================
class WhatsAppConversation(Base):
    __tablename__ = "whatsapp_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    business_id = Column(String, index=True)

    customer_phone = Column(String)
    status = Column(String, default="open")

    assigned_agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    user = relationship(
        "User",
        back_populates="whatsapp_conversations",
        foreign_keys=[user_id],
    )

    assigned_agent = relationship(
        "User",
        back_populates="assigned_conversations",
        foreign_keys=[assigned_agent_id],
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


# =========================
# MESSAGE MODEL
# =========================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("whatsapp_conversations.id")
    )

    sender_type = Column(String)
    content = Column(String)
    timestamp = Column(DateTime, default=utcnow)

    conversation = relationship(
        "WhatsAppConversation",
        back_populates="messages",
    )


# =========================
# WORKFLOW MODEL
# =========================
class Workflow(Base):
    __tablename__ = "workflows"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(String, index=True)  # This stores the user_id
    name = Column(String, nullable=False)
    status = Column(String, default="active")
    triggers = Column(JSON, default=[])  # JSON for list of triggers
    actions = Column(JSON, default={"nodes": [], "connections": []})  # JSON for canvas state
    created_at = Column(DateTime, default=utcnow)
   


# =========================
# CONTACT MESSAGE MODEL
# =========================
class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String)
    email = Column(String)
    mobile_number = Column(String, nullable=True)
    whatsapp_number = Column(String, nullable=True)

    company = Column(String, nullable=True)
    subject = Column(String)
    message = Column(String)

    created_at = Column(DateTime, default=utcnow)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Any, Optional

import models
from database import get_db  # Ensure your database.py defines get_db

router = APIRouter(prefix="/workflows", tags=["Workflows"])

class PostPlatform(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    LINKEDIN = "linkedin"

class PostStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    REJECTED = "rejected"

class SocialMediaPost(Base):
    __tablename__ = "social_media_posts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # This references existing users table
    
    platform = Column(SQLEnum(PostPlatform), nullable=False)
    image_url = Column(String, nullable=True)
    caption = Column(String, nullable=False)
    hashtags = Column(JSON, default=[])  # List of hashtags
    
    status = Column(SQLEnum(PostStatus), default=PostStatus.PENDING)
    
    scheduled_time = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # For tracking changes/revisions
    original_caption = Column(String, nullable=True)
    revision_history = Column(JSON, default=[])  # Store revision history
    
    # Source of the post (studio or manual)
    source = Column(String, default="studio")
    
    


# =========================
# SOCIAL MEDIA NOTIFICATION MODEL
# =========================

class NotificationType(str, enum.Enum):
    REVIEW_NEEDED = "review_needed"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    NEW_FROM_STUDIO = "new_from_studio"
    CHANGES_REQUESTED = "changes_requested"

class SocialMediaNotification(Base):
    __tablename__ = "social_media_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # References existing users table
    post_id = Column(Integer, ForeignKey("social_media_posts.id"), nullable=True)
    
    type = Column(SQLEnum(NotificationType), nullable=False)
    message = Column(String, nullable=False)
    read = Column(Boolean, default=False)
    
    extradata = Column(JSON, default={})  # Additional data like platform, reason, etc.
    
    created_at = Column(DateTime, default=utcnow)
    
    # No back_populates needed


# =========================
# EMAIL LOG MODEL (for tracking sent emails)
# =========================

class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    recipient_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    type = Column(String, nullable=True)  # review, approval, changes, etc.
    post_id = Column(Integer, nullable=True)
    status = Column(String, default="sent")  # sent, failed
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)



