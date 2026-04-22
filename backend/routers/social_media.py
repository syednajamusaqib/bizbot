"""
File Name: social_media.py
Purpose: Social media endpoints for AI generation, scheduling, and approval.
Updated to include Make.com Webhook triggers and receivers.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import json
import traceback
import httpx  # Added for outgoing Make.com webhook requests
import os     # Added to read Render environment variables

from database import get_db
from models import User, SocialMediaPost, SocialMediaNotification, PostPlatform, PostStatus, NotificationType, EmailLog
from utils.auth_helpers import get_current_user
from utils.user_helpers import get_user_email, get_user_name
from services.email_service import send_post_review_email, send_post_approval_email, send_changes_requested_email

# =========================
# ENVIRONMENT VARIABLES
# =========================
MAKE_GENERATOR_WEBHOOK_URL = os.getenv("MAKE_GENERATOR_WEBHOOK_URL")
MAKE_PUBLISH_WEBHOOK_URL = os.getenv("MAKE_PUBLISH_WEBHOOK_URL")

router = APIRouter(prefix="/social-media", tags=["Social Media"])

print("\n" + "="*60)
print("✅ SOCIAL MEDIA ROUTER LOADED")
print("="*60 + "\n")


# =========================
# HELPER FUNCTION FOR TIMEZONE
# =========================

def remove_timezone(dt: Optional[datetime]) -> Optional[datetime]:
    """Remove timezone info from datetime for database storage"""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


# =========================
# SCHEMAS
# =========================

class CreatePostRequest(BaseModel):
    platform: str
    image_url: Optional[str] = None
    caption: str
    hashtags: List[str] = []
    scheduled_time: Optional[datetime] = None
    source: str = "studio"

class UpdatePostRequest(BaseModel):
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    image_url: Optional[str] = None
    scheduled_time: Optional[datetime] = None

class RegeneratePostRequest(BaseModel):
    prompt: str
    original_caption: str
    platform: str

class PostResponse(BaseModel):
    id: int
    platform: str
    image_url: Optional[str]
    caption: str
    hashtags: List[str]
    status: str
    scheduled_time: Optional[datetime]
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    source: str
    
    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    id: int
    type: str
    message: str
    read: bool
    extradata: Dict[str, Any]
    created_at: datetime
    post_id: Optional[int]
    
    class Config:
        from_attributes = True

class AIGenerateRequest(BaseModel):
    topic: str
    platforms: List[str]
    tone: str

class AIGenerateResponse(BaseModel):
    image_url: str
    posts: List[Dict[str, Any]]

# NEW: Schema specifically for Make.com webhook to bypass auth
class MakeWebhookRequest(BaseModel):
    platform: str
    image_url: Optional[str] = None
    caption: str
    hashtags: List[str] = []
    source: str = "make_automation"
    user_email: str


# =========================
# HELPER FUNCTIONS
# =========================

def utcnow():
    return datetime.utcnow()

async def get_pending_count(db: AsyncSession, user_id: int) -> int:
    """Get count of pending posts for a user"""
    result = await db.execute(
        select(func.count()).select_from(SocialMediaPost).where(
            SocialMediaPost.user_id == user_id,
            SocialMediaPost.status == PostStatus.PENDING
        )
    )
    return result.scalar() or 0


# =========================
# MAKE.COM INTEGRATION ENDPOINTS
# =========================

@router.post("/trigger-automation")
async def trigger_make_automation(
    current_user: User = Depends(get_current_user)
):
    """
    Trigger Make.com to start generating posts from Google Sheets.
    Passes the secure logged-in user's email to Make.com.
    """
    print(f"\n🚀 TRIGGER AUTOMATION CALLED by {current_user.email}")
    
    if not MAKE_GENERATOR_WEBHOOK_URL:
        print("❌ ERROR: MAKE_GENERATOR_WEBHOOK_URL is not set!")
        raise HTTPException(status_code=500, detail="Automation webhook URL not configured")

    async with httpx.AsyncClient() as client:
        payload = {
            "user_email": current_user.email,
            "trigger_source": "dashboard_button"
        }
        try:
            response = await client.post(MAKE_GENERATOR_WEBHOOK_URL, json=payload)
            if response.status_code == 200:
                print("✅ Successfully triggered Make.com automation")
                return {"status": "success", "message": "Automation triggered successfully!"}
            else:
                print(f"❌ Make.com rejected the request: {response.status_code}")
                raise HTTPException(status_code=response.status_code, detail="Automation server rejected request")
        except Exception as e:
            print(f"❌ Failed to trigger automation: {e}")
            raise HTTPException(status_code=500, detail="Failed to connect to automation server")

@router.post("/webhook/make", response_model=PostResponse)
async def receive_from_make(
    request: MakeWebhookRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Unauthenticated endpoint for Make.com. 
    It identifies the user via the user_email provided in the JSON payload.
    """
    print("\n🤖 MAKE.COM WEBHOOK TRIGGERED")
    print(f"Platform: {request.platform}, User: {request.user_email}")

    # FIX: Select ONLY the user ID instead of the whole User object 
    # to prevent async MissingGreenlet lazy-loading errors.
    result = await db.execute(select(User.id).where(User.email == request.request_email))
    user_id = result.scalar_one_or_none()
    
    if not user_id:
        print(f"❌ User not found for email: {request.user_email}")
        raise HTTPException(status_code=404, detail="User not found")

    try:
        platform_enum = PostPlatform(request.platform.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid platform: {request.platform}")

    # Create the post using the discovered user_id
    post = SocialMediaPost(
        user_id=user_id,
        platform=platform_enum,
        image_url=request.image_url,
        caption=request.caption,
        hashtags=request.hashtags,
        status=PostStatus.PENDING,
        source=request.source,
        created_at=utcnow(),
        updated_at=utcnow()
    )
    
    db.add(post)
    await db.commit()
    await db.refresh(post)

    # Create a dashboard notification
    notification = SocialMediaNotification(
        user_id=user_id,
        post_id=post.id,
        type=NotificationType.NEW_FROM_STUDIO,
        message=f"📝 New {post.platform.value} post generated by AI needs review",
        extradata={"platform": post.platform.value, "source": request.source},
        created_at=utcnow()
    )
    db.add(notification)
    await db.commit()
    
    print(f"✅ Make.com post saved successfully! Post ID: {post.id}")

    return PostResponse(
        id=post.id,
        platform=post.platform.value,
        image_url=post.image_url,
        caption=post.caption,
        hashtags=post.hashtags,
        status=post.status.value,
        scheduled_time=post.scheduled_time,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        source=post.source
    )

# =========================
# POST ENDPOINTS
# =========================

@router.post("/generate", response_model=AIGenerateResponse)
async def generate_ai_content(
    request: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate AI-powered social media content"""
    print("\n🎨 GENERATE CONTENT CALLED")
    print(f"   Topic: {request.topic}")
    print(f"   Platforms: {request.platforms}")
    print(f"   Tone: {request.tone}")
    
    image_urls = [
        "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=600&fit=crop",
    ]
    image_url = image_urls[hash(request.topic) % len(image_urls)]
    
    tone_words = {
        "excited": "🎉 Get ready for warp speed! Our NEW",
        "informative": "📊 Introducing our new",
        "professional": "💼 We are pleased to announce",
    }
    
    tone_word = tone_words.get(request.tone, tone_words["excited"])
    
    platform_texts = {
        "instagram": f"{tone_word} {request.topic}! Blazing fast, reliable, and affordable. Say goodbye to buffering! #LaunchDay #UnlimitedData",
        "facebook": f"{tone_word} {request.topic}! Keep everyone connected on the ultimate fiber internet plan!",
        "twitter": f"{tone_word} {request.topic}! Experience the business of tomorrow with our fiber optic network! #FutureIsHere #Innovation",
        "linkedin": f"{tone_word} {request.topic}. Empowering businesses with cutting-edge connectivity solutions.",
    }
    
    hashtags = [
        "#Innovation",
        "#LaunchDay",
        "#UnlimitedData",
        f"#{request.topic.replace(' ', '')}"
    ]
    
    posts = []
    for platform in request.platforms:
        posts.append({
            "platform": platform,
            "text": platform_texts.get(platform, f"Check out our new {request.topic}!"),
            "hashtags": hashtags.copy()
        })
    
    print(f"✅ Generated {len(posts)} posts")
    return AIGenerateResponse(image_url=image_url, posts=posts)


@router.post("/posts", response_model=PostResponse)
async def create_post(
    request: CreatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new social media post"""
    
    print("\n" + "!"*60)
    print("📝 CREATE POST ENDPOINT CALLED!")
    print("!"*60)
    print(f"Request platform: {request.platform}")
    print(f"Request caption: {request.caption[:50]}...")
    print(f"Request scheduled_time: {request.scheduled_time}")
    print(f"Request source: {request.source}")
    
    try:
        # STORE USER ID IMMEDIATELY
        user_id = current_user.id
        print(f"✅ User ID: {user_id}")
        
        try:
            platform_enum = PostPlatform(request.platform.lower())
            print(f"✅ Platform enum: {platform_enum}")
        except ValueError:
            print(f"❌ Invalid platform: {request.platform}")
            raise HTTPException(status_code=400, detail=f"Invalid platform: {request.platform}")
        
        # Remove timezone from scheduled_time
        scheduled_time_naive = remove_timezone(request.scheduled_time)
        print(f"✅ Scheduled time (naive): {scheduled_time_naive}")
        
        post = SocialMediaPost(
            user_id=user_id,
            platform=platform_enum,
            image_url=request.image_url,
            caption=request.caption,
            hashtags=request.hashtags,
            status=PostStatus.PENDING,
            scheduled_time=scheduled_time_naive,
            source=request.source,
            created_at=utcnow(),
            updated_at=utcnow()
        )
        
        db.add(post)
        print("✅ Post added to session")
        
        await db.commit()
        print("✅ Database commit successful")
        
        await db.refresh(post)
        print(f"✅ Post refreshed, ID: {post.id}")
        
        # STORE ALL ATTRIBUTES IMMEDIATELY AFTER REFRESH
        post_id = post.id
        platform_value = post.platform.value
        image_url_value = post.image_url
        caption_value = post.caption
        hashtags_value = post.hashtags
        status_value = post.status.value
        scheduled_time_value = post.scheduled_time
        published_at_value = post.published_at
        created_at_value = post.created_at
        updated_at_value = post.updated_at
        source_value = post.source
        caption_preview = caption_value[:100] if caption_value else ""
        
        print(f"✅ Stored post_id: {post_id}")
        print(f"✅ Stored platform: {platform_value}")
        
        # Create notification
        notification = SocialMediaNotification(
            user_id=user_id,
            post_id=post_id,
            type=NotificationType.NEW_FROM_STUDIO,
            message=f"📝 New {platform_value} post created and needs review",
            extradata={"platform": platform_value, "source": request.source},
            created_at=utcnow()
        )
        db.add(notification)
        await db.commit()
        print("✅ Notification created")
        
        # Send email
        print("\n📧 ATTEMPTING TO SEND EMAIL...")
        user_email = await get_user_email(db, user_id)
        user_name = await get_user_name(db, user_id)
        
        print(f"   User email from DB: {user_email}")
        print(f"   User name from DB: {user_name}")
        
        if user_email:
            print(f"   📧 Sending email to {user_email}...")
            try:
                email_result = await send_post_review_email(
                    to_email=user_email,
                    user_name=user_name,
                    post_id=str(post_id),
                    platform=platform_value,
                    caption=caption_preview,
                    scheduled_time=scheduled_time_naive
                )
                print(f"   📧 Email send result: {email_result}")
                if email_result:
                    print("   ✅ Email sent successfully!")
                else:
                    print("   ❌ Email failed to send!")
            except Exception as email_error:
                print(f"   ❌ Email exception: {email_error}")
                print(f"   Traceback: {traceback.format_exc()}")
        else:
            print("   ❌ No user_email found! Cannot send email.")
            print(f"   User ID {user_id} has no email in database")
        
        print("\n✅ Returning post response")
        return PostResponse(
            id=post_id,
            platform=platform_value,
            image_url=image_url_value,
            caption=caption_value,
            hashtags=hashtags_value,
            status=status_value,
            scheduled_time=scheduled_time_value,
            published_at=published_at_value,
            created_at=created_at_value,
            updated_at=updated_at_value,
            source=source_value
        )
        
    except Exception as e:
        print(f"\n❌ ERROR in create_post: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/posts/batch", response_model=List[PostResponse])
async def create_batch_posts(
    requests: List[CreatePostRequest],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple social media posts at once"""
    
    print("\n📦 BATCH CREATE POSTS CALLED")
    print(f"Number of requests: {len(requests)}")
    
    # STORE USER ID IMMEDIATELY
    user_id = current_user.id
    
    created_posts = []
    created_responses = []
    
    for request in requests:
        try:
            platform_enum = PostPlatform(request.platform.lower())
        except ValueError:
            continue
        
        scheduled_time_naive = remove_timezone(request.scheduled_time)
        
        post = SocialMediaPost(
            user_id=user_id,
            platform=platform_enum,
            image_url=request.image_url,
            caption=request.caption,
            hashtags=request.hashtags,
            status=PostStatus.PENDING,
            scheduled_time=scheduled_time_naive,
            source=request.source,
            created_at=utcnow(),
            updated_at=utcnow()
        )
        db.add(post)
        created_posts.append(post)
    
    await db.commit()
    
    for post in created_posts:
        await db.refresh(post)
        
        post_id = post.id
        platform_value = post.platform.value
        image_url_value = post.image_url
        caption_value = post.caption
        hashtags_value = post.hashtags
        status_value = post.status.value
        scheduled_time_value = post.scheduled_time
        published_at_value = post.published_at
        created_at_value = post.created_at
        updated_at_value = post.updated_at
        source_value = post.source
        
        notification = SocialMediaNotification(
            user_id=user_id,
            post_id=post_id,
            type=NotificationType.NEW_FROM_STUDIO,
            message=f"📝 New {platform_value} post created and needs review",
            extradata={"platform": platform_value, "source": "studio"},
            created_at=utcnow()
        )
        db.add(notification)
        
        created_responses.append(PostResponse(
            id=post_id,
            platform=platform_value,
            image_url=image_url_value,
            caption=caption_value,
            hashtags=hashtags_value,
            status=status_value,
            scheduled_time=scheduled_time_value,
            published_at=published_at_value,
            created_at=created_at_value,
            updated_at=updated_at_value,
            source=source_value
        ))
    
    await db.commit()
    
    # Send summary email
    user_email = await get_user_email(db, user_id)
    user_name = await get_user_name(db, user_id)
    
    if user_email and created_posts:
        await send_post_review_email(
            to_email=user_email,
            user_name=user_name,
            post_id="batch",
            platform="multiple",
            caption=f"{len(created_posts)} new posts created",
            scheduled_time=None
        )
    
    return created_responses


@router.get("/posts", response_model=List[PostResponse])
async def get_posts(
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all social media posts for the current user"""
    
    user_id = current_user.id
    
    query = select(SocialMediaPost).where(SocialMediaPost.user_id == user_id)
    
    if status:
        try:
            status_enum = PostStatus(status.lower())
            query = query.where(SocialMediaPost.status == status_enum)
        except ValueError:
            pass
    
    if platform:
        try:
            platform_enum = PostPlatform(platform.lower())
            query = query.where(SocialMediaPost.platform == platform_enum)
        except ValueError:
            pass
    
    query = query.order_by(SocialMediaPost.created_at.desc())
    
    result = await db.execute(query)
    posts = result.scalars().all()
    
    return [
        PostResponse(
            id=post.id,
            platform=post.platform.value,
            image_url=post.image_url,
            caption=post.caption,
            hashtags=post.hashtags,
            status=post.status.value,
            scheduled_time=post.scheduled_time,
            published_at=post.published_at,
            created_at=post.created_at,
            updated_at=post.updated_at,
            source=post.source
        )
        for post in posts
    ]


@router.get("/posts/pending/count", response_model=dict)
async def get_pending_count_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get count of pending posts"""
    user_id = current_user.id
    count = await get_pending_count(db, user_id)
    return {"pending_count": count, "total_pending": count}


@router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific post"""
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaPost).where(
            SocialMediaPost.id == post_id,
            SocialMediaPost.user_id == user_id
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    return PostResponse(
        id=post.id,
        platform=post.platform.value,
        image_url=post.image_url,
        caption=post.caption,
        hashtags=post.hashtags,
        status=post.status.value,
        scheduled_time=post.scheduled_time,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        source=post.source
    )


@router.put("/posts/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    request: UpdatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a post"""
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaPost).where(
            SocialMediaPost.id == post_id,
            SocialMediaPost.user_id == user_id
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Store revision
    revision = {
        "timestamp": utcnow().isoformat(),
        "caption": post.caption,
        "hashtags": post.hashtags,
        "image_url": post.image_url
    }
    revisions = post.revision_history or []
    revisions.append(revision)
    post.revision_history = revisions
    
    # Update fields
    if request.caption is not None:
        post.caption = request.caption
    if request.hashtags is not None:
        post.hashtags = request.hashtags
    if request.image_url is not None:
        post.image_url = request.image_url
    if request.scheduled_time is not None:
        post.scheduled_time = remove_timezone(request.scheduled_time)
    
    post.updated_at = utcnow()
    
    await db.commit()
    await db.refresh(post)
    
    return PostResponse(
        id=post.id,
        platform=post.platform.value,
        image_url=post.image_url,
        caption=post.caption,
        hashtags=post.hashtags,
        status=post.status.value,
        scheduled_time=post.scheduled_time,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        source=post.source
    )


@router.post("/posts/{post_id}/approve", response_model=PostResponse)
async def approve_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Approve and publish a post"""
    
    print(f"\n✅ APPROVE POST CALLED for post {post_id}")
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaPost).where(
            SocialMediaPost.id == post_id,
            SocialMediaPost.user_id == user_id
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if post.status != PostStatus.PENDING:
        raise HTTPException(status_code=400, detail="Post is not pending review")
    
    post.status = PostStatus.PUBLISHED
    post.published_at = utcnow()
    post.updated_at = utcnow()
    
    await db.commit()
    await db.refresh(post)
    
    # Store values after refresh
    post_id_val = post.id
    platform_val = post.platform.value
    image_url_val = post.image_url
    caption_val = post.caption
    hashtags_val = post.hashtags
    status_val = post.status.value
    scheduled_time_val = post.scheduled_time
    published_at_val = post.published_at
    created_at_val = post.created_at
    updated_at_val = post.updated_at
    source_val = post.source
    caption_preview = caption_val[:100] if caption_val else ""

    # TRIGGER MAKE.COM WEBHOOK
    if MAKE_PUBLISH_WEBHOOK_URL:
        async with httpx.AsyncClient() as client:
            payload = {
                "post_id": post_id_val,
                "platform": platform_val,
                "caption": caption_val,
                "image_url": image_url_val,
                "user_id": user_id
            }
            try:
                response = await client.post(MAKE_PUBLISH_WEBHOOK_URL, json=payload)
                print(f"🚀 Sent to Make.com! Status: {response.status_code}")
            except Exception as e:
                print(f"❌ Failed to trigger Make.com webhook: {e}")
                print(traceback.format_exc())
    else:
        print("⚠️ Warning: MAKE_PUBLISH_WEBHOOK_URL is not set in environment variables.")
    
    # Create notification
    notification = SocialMediaNotification(
        user_id=user_id,
        post_id=post_id_val,
        type=NotificationType.APPROVED,
        message=f"✅ {platform_val.capitalize()} post has been approved and published!",
        extradata={"platform": platform_val},
        created_at=utcnow()
    )
    db.add(notification)
    await db.commit()
    
    # Send email
    user_email = await get_user_email(db, user_id)
    user_name = await get_user_name(db, user_id)
    
    print(f"📧 Approval email - User email: {user_email}")
    
    if user_email:
        await send_post_approval_email(
            to_email=user_email,
            user_name=user_name,
            post_id=str(post_id_val),
            platform=platform_val,
            caption=caption_preview
        )
    
    return PostResponse(
        id=post_id_val,
        platform=platform_val,
        image_url=image_url_val,
        caption=caption_val,
        hashtags=hashtags_val,
        status=status_val,
        scheduled_time=scheduled_time_val,
        published_at=published_at_val,
        created_at=created_at_val,
        updated_at=updated_at_val,
        source=source_val
    )


@router.post("/posts/{post_id}/regenerate", response_model=PostResponse)
async def regenerate_post(
    post_id: int,
    request: RegeneratePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Regenerate post content based on feedback"""
    
    print(f"\n🔄 REGENERATE POST CALLED for post {post_id}")
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaPost).where(
            SocialMediaPost.id == post_id,
            SocialMediaPost.user_id == user_id
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Store original
    original_caption = post.caption
    
    # Generate new content
    platform_texts = {
        PostPlatform.INSTAGRAM: f"✨ NEW: {request.prompt[:50]}! Experience lightning-fast fiber internet! Blazing speeds, reliable connection. #GameChanger",
        PostPlatform.FACEBOOK: f"Big news! {request.prompt[:50]}. Our new fiber plans keep you connected like never before.",
        PostPlatform.TWITTER: f"{request.prompt[:50]}. Ultra-fast fiber internet is here! #FiberFuture",
        PostPlatform.LINKEDIN: f"Announcing: {request.prompt[:50]}. Next-generation connectivity for businesses.",
    }
    
    new_hashtags = [
        "#Updated",
        "#FreshContent",
        f"#{request.prompt[:20].replace(' ', '')}",
        "#AIGenerated"
    ]
    
    post.caption = platform_texts.get(post.platform, f"Updated: {request.prompt[:50]}")
    post.hashtags = new_hashtags
    post.status = PostStatus.PENDING
    post.updated_at = utcnow()
    
    # Store revision
    revisions = post.revision_history or []
    revisions.append({
        "timestamp": utcnow().isoformat(),
        "caption": original_caption,
        "regeneration_prompt": request.prompt
    })
    post.revision_history = revisions
    
    await db.commit()
    await db.refresh(post)
    
    # Store values after refresh
    post_id_val = post.id
    platform_val = post.platform.value
    image_url_val = post.image_url
    caption_val = post.caption
    hashtags_val = post.hashtags
    status_val = post.status.value
    scheduled_time_val = post.scheduled_time
    published_at_val = post.published_at
    created_at_val = post.created_at
    updated_at_val = post.updated_at
    source_val = post.source
    caption_preview = caption_val[:100] if caption_val else ""
    
    # Create notification
    notification = SocialMediaNotification(
        user_id=user_id,
        post_id=post_id_val,
        type=NotificationType.CHANGES_REQUESTED,
        message=f"🔄 {platform_val.capitalize()} post has been regenerated - needs review",
        extradata={"platform": platform_val, "prompt": request.prompt},
        created_at=utcnow()
    )
    db.add(notification)
    await db.commit()
    
    # Send email
    user_email = await get_user_email(db, user_id)
    user_name = await get_user_name(db, user_id)
    
    print(f"📧 Regeneration email - User email: {user_email}")
    
    if user_email:
        await send_changes_requested_email(
            to_email=user_email,
            user_name=user_name,
            post_id=str(post_id_val),
            platform=platform_val,
            caption=caption_preview,
            feedback=request.prompt
        )
    
    return PostResponse(
        id=post_id_val,
        platform=platform_val,
        image_url=image_url_val,
        caption=caption_val,
        hashtags=hashtags_val,
        status=status_val,
        scheduled_time=scheduled_time_val,
        published_at=published_at_val,
        created_at=created_at_val,
        updated_at=updated_at_val,
        source=source_val
    )


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a post"""
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaPost).where(
            SocialMediaPost.id == post_id,
            SocialMediaPost.user_id == user_id
        )
    )
    post = result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    await db.delete(post)
    await db.commit()
    
    return {"message": "Post deleted successfully"}


# =========================
# NOTIFICATION ENDPOINTS
# =========================

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all notifications for the current user"""
    
    user_id = current_user.id
    
    query = select(SocialMediaNotification).where(
        SocialMediaNotification.user_id == user_id
    )
    
    if unread_only:
        query = query.where(SocialMediaNotification.read == False)
    
    query = query.order_by(SocialMediaNotification.created_at.desc())
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return [
        NotificationResponse(
            id=n.id,
            type=n.type.value,
            message=n.message,
            read=n.read,
            extradata=n.extradata or {},
            created_at=n.created_at,
            post_id=n.post_id
        )
        for n in notifications
    ]


@router.get("/notifications/unread/count")
async def get_unread_notification_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get count of unread notifications"""
    
    user_id = current_user.id
    
    result = await db.execute(
        select(func.count()).select_from(SocialMediaNotification).where(
            SocialMediaNotification.user_id == user_id,
            SocialMediaNotification.read == False
        )
    )
    count = result.scalar() or 0
    
    return {"unread_count": count}


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a notification as read"""
    
    user_id = current_user.id
    
    result = await db.execute(
        select(SocialMediaNotification).where(
            SocialMediaNotification.id == notification_id,
            SocialMediaNotification.user_id == user_id
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.read = True
    await db.commit()
    
    return {"message": "Notification marked as read"}


@router.put("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all notifications as read"""
    
    user_id = current_user.id
    
    await db.execute(
        update(SocialMediaNotification)
        .where(
            SocialMediaNotification.user_id == user_id,
            SocialMediaNotification.read == False
        )
        .values(read=True)
    )
    await db.commit()
    
    return {"message": "All notifications marked as read"}


@router.delete("/notifications")
async def clear_all_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear all notifications"""
    
    user_id = current_user.id
    
    await db.execute(
        delete(SocialMediaNotification).where(
            SocialMediaNotification.user_id == user_id
        )
    )
    await db.commit()
    
    return {"message": "All notifications cleared"}
