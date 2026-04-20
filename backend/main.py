"""
File Name: main.py
Purpose: Initialize FastAPI application, configure middleware, mount static
         files, register routers, and handle startup tasks.
Author: Najam U Saqib
"""

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

import models
import security
import deps
from database import Base, ENGINE as engine, SessionLocal as session_local
from routers import auth, contact, users,workflows,social_media


# =========================
# APPLICATION INITIALIZATION
# =========================
app = FastAPI(title="BizBot Backend")


# =========================
# STATIC FILES SETUP
# =========================
STATIC_UPLOAD_DIR = "static/uploads"
os.makedirs(STATIC_UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")


# =========================
# CORS CONFIGURATION
# =========================
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# ROUTER REGISTRATION
# =========================
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(contact.router)
app.include_router(workflows.router)
app.include_router(social_media.router)
# =========================
# STARTUP EVENTS
# =========================
@app.on_event("startup")
async def startup_event():
    """
    Create database tables and ensure a default administrator user exists.
    """
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        result = await db.execute(
            select(models.User).where(
                models.User.email == "admin@bizbot.com"
            )
        )
        admin_user = result.scalars().first()

        if not admin_user:
            print("Creating default administrator user...")

            hashed_password = security.get_password_hash("admin123")
            new_admin = models.User(
                email="admin@bizbot.com",
                username="SuperAdmin",
                password_hash=hashed_password,
                roles=[
                    "Administrator",
                    "Developer",
                    "Business User",
                ],
                is_active=True,
            )

            db.add(new_admin)
            await db.commit()

            print(
                "Administrator created: admin@bizbot.com / admin123"
            )


# =========================
# API ROUTES
# =========================
@app.get("/api/dashboard")
async def get_dashboard_data(
    user: models.User = Depends(deps.get_current_user),
):
    """
    Return basic dashboard information for the authenticated user.
    """
    return {
        "message": f"Welcome back, {user.username}",
        "role": user.roles,
    }


@app.get("/api/admin/system-health")
async def get_system_health(
    user: models.User = deps.RequireAdmin,
):
    """
    Return basic system health information for administrators.
    """
    return {
        "status": "Healthy",
        "cpu": "12%",
        "memory": "40%",
    }
