from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import User

async def get_user_email(db: AsyncSession, user_id: int) -> str:
    """Get user email without modifying User model relationships"""
    result = await db.execute(
        select(User.email).where(User.id == user_id)
    )
    email = result.scalar_one_or_none()
    print(f"get_user_email({user_id}) = {email}")  # Add this debug
    return email

async def get_user_name(db: AsyncSession, user_id: int) -> str:
    """Get user name/username without modifying User model relationships"""
    result = await db.execute(
        select(User.username).where(User.id == user_id)
    )
    username = result.scalar_one_or_none()
    return username or f"User_{user_id}"