"""
File Name: database.py
Purpose: Configure and provide asynchronous database session for BizBot backend.
Author: Najam U Saqib
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# DATABASE CONFIGURATION
raw_db_url = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:najam@localhost:5432/bizzbot"  # default fallback
)

# FIX FOR RENDER: Render's internal/external URLs start with 'postgres://' or 'postgresql://'
# SQLAlchemy's async driver requires 'postgresql+asyncpg://'
if raw_db_url.startswith("postgres://"):
    DATABASE_URL = raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif raw_db_url.startswith("postgresql://"):
    DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = raw_db_url

# Create asynchronous engine
ENGINE = create_async_engine(DATABASE_URL, echo=True)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=ENGINE,
    class_=AsyncSession
)


Base = declarative_base()


# DATABASE DEPENDENCY
async def get_db():
    """
    Dependency to provide a database session.
    Usage: `db: AsyncSession = Depends(get_db)`
    """
    async with SessionLocal() as session:
        yield session
