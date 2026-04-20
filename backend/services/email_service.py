# backend/services/email_service.py

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import os
from datetime import datetime
import traceback
from dotenv import load_dotenv
load_dotenv() 


# Email configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)
APP_NAME = os.getenv("APP_NAME", "Social Media Management Studio")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")

# Print config for debugging (remove in production)
print("=" * 50)
print("EMAIL CONFIGURATION:")
print(f"SMTP_HOST: {SMTP_HOST}")
print(f"SMTP_PORT: {SMTP_PORT}")
print(f"SMTP_USER: {SMTP_USER}")
print(f"SMTP_PASSWORD: {'*' * len(SMTP_PASSWORD) if SMTP_PASSWORD else 'NOT SET'}")
print(f"FROM_EMAIL: {FROM_EMAIL}")
print("=" * 50)


def get_platform_color(platform: str) -> str:
    """Get platform-specific color"""
    colors = {
        "instagram": "#E4405F",
        "facebook": "#1877F2",
        "twitter": "#1DA1F2",
        "linkedin": "#0A66C2"
    }
    return colors.get(platform.lower(), "#667eea")


def format_date(date_value) -> str:
    """Format date for display"""
    if not date_value:
        return "Not scheduled"
    try:
        if isinstance(date_value, str):
            dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        else:
            dt = date_value
        return dt.strftime("%B %d, %Y at %I:%M %p")
    except:
        return str(date_value)


def get_review_email_html(post: dict, user_name: str) -> str:
    """Generate HTML email for post review request"""
    platform = post.get('platform', 'social media')
    platform_color = get_platform_color(platform)
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
            }}
            .content {{
                background: #f8f9fa;
                padding: 30px;
                border-radius: 0 0 10px 10px;
            }}
            .post-card {{
                background: white;
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
                border-left: 4px solid #667eea;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }}
            .platform-badge {{
                display: inline-block;
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                margin-bottom: 15px;
                background: {platform_color}20;
                color: {platform_color};
            }}
            .btn {{
                display: inline-block;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin-top: 20px;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📝 Post Review Required</h1>
            <p>Your AI-generated content needs your attention</p>
        </div>
        <div class="content">
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>A new social media post has been generated and is ready for your review.</p>
            
            <div class="post-card">
                <div class="platform-badge">
                    {platform.upper()}
                </div>
                <p><strong>Caption:</strong></p>
                <p>{post.get('caption', 'No caption provided')}</p>
                {f'<p><strong>Scheduled for:</strong> {format_date(post.get("scheduled_time"))}</p>' if post.get('scheduled_time') else ''}
            </div>
            
            <p>Please review this post in the Verification Studio:</p>
            <a href="{APP_URL}/social-media-verification" class="btn">📋 Review Post</a>
            
            <p style="margin-top: 20px;">You can either:</p>
            <ul>
                <li>✅ Approve and publish immediately</li>
                <li>✏️ Request changes for AI regeneration</li>
                <li>🗑️ Delete the post</li>
            </ul>
        </div>
        <div class="footer">
            <p>This is an automated message from {APP_NAME}. Please do not reply to this email.</p>
            <p>&copy; {datetime.now().year} {APP_NAME}. All rights reserved.</p>
        </div>
    </body>
    </html>
    """


def get_approval_email_html(post: dict, user_name: str) -> str:
    """Generate HTML email for post approval confirmation"""
    platform = post.get('platform', 'social media')
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
            }}
            .content {{
                background: #f8f9fa;
                padding: 30px;
                border-radius: 0 0 10px 10px;
            }}
            .success-icon {{
                font-size: 48px;
                text-align: center;
                margin: 20px 0;
            }}
            .btn {{
                display: inline-block;
                padding: 12px 24px;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin-top: 20px;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>✅ Post Published!</h1>
            <p>Your social media post has been approved and published</p>
        </div>
        <div class="content">
            <div class="success-icon">🎉</div>
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>Great news! Your {platform} post has been approved and is now live.</p>
            
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 20px 0;">
                <p><strong>Published Content:</strong></p>
                <p>{post.get('caption', 'No caption provided')}</p>
            </div>
            
            <a href="{APP_URL}/social-media-verification?tab=approved" class="btn">📊 View Published Posts</a>
        </div>
        <div class="footer">
            <p>This is an automated message from {APP_NAME}. Please do not reply to this email.</p>
        </div>
    </body>
    </html>
    """


def get_changes_requested_email_html(post: dict, user_name: str, feedback: str) -> str:
    """Generate HTML email for changes requested notification"""
    platform = post.get('platform', 'social media')
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
            }}
            .content {{
                background: #f8f9fa;
                padding: 30px;
                border-radius: 0 0 10px 10px;
            }}
            .feedback-box {{
                background: #fff3e0;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .btn {{
                display: inline-block;
                padding: 12px 24px;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin-top: 20px;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>✏️ Changes Requested</h1>
            <p>Your post has been regenerated based on your feedback</p>
        </div>
        <div class="content">
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>Based on your feedback, the AI has regenerated your {platform} post.</p>
            
            <div class="feedback-box">
                <strong>Your Feedback:</strong>
                <p>{feedback}</p>
            </div>
            
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 20px 0;">
                <p><strong>New Caption:</strong></p>
                <p>{post.get('caption', 'No caption provided')}</p>
            </div>
            
            <a href="{APP_URL}/social-media-verification" class="btn">📝 Review Updated Post</a>
        </div>
        <div class="footer">
            <p>This is an automated message from {APP_NAME}. Please do not reply to this email.</p>
        </div>
    </body>
    </html>
    """


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """
    Send an email using SMTP
    Returns True if successful, False otherwise
    """
    print(f"\n📧 Attempting to send email to: {to_email}")
    print(f"   Subject: {subject}")
    
    # Check if credentials are configured
    if not SMTP_USER or not SMTP_PASSWORD:
        print("   ❌ ERROR: SMTP_USER or SMTP_PASSWORD not configured!")
        print("   Please check your .env file")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email
        
        # Attach plain text version if provided
        if text_content:
            part_text = MIMEText(text_content, "plain")
            msg.attach(part_text)
        
        # Attach HTML version
        part_html = MIMEText(html_content, "html")
        msg.attach(part_html)
        
        print(f"   Connecting to {SMTP_HOST}:{SMTP_PORT}...")
        
        # Send email
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.set_debuglevel(1)  # Enable debug output
            server.starttls()
            print(f"   Logging in as {SMTP_USER}...")
            server.login(SMTP_USER, SMTP_PASSWORD)
            print("   ✅ Login successful!")
            print(f"   Sending message...")
            server.send_message(msg)
            print("   ✅ Email sent successfully!")
        
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"   ❌ SMTP Authentication Error: {e}")
        print("   This usually means your password is incorrect or you need to use an App Password")
        print("   For Gmail: Enable 2-Factor Authentication and generate an App Password")
        return False
    except smtplib.SMTPException as e:
        print(f"   ❌ SMTP Error: {e}")
        print(f"   Full error: {traceback.format_exc()}")
        return False
    except Exception as e:
        print(f"   ❌ Unexpected error: {e}")
        print(f"   Full traceback: {traceback.format_exc()}")
        return False


async def send_post_review_email(
    to_email: str,
    user_name: str,
    post_id: str,
    platform: str,
    caption: str,
    scheduled_time: Optional[datetime] = None
) -> bool:
    """Send email notification for post review request"""
    print(f"\n📧 send_post_review_email called")
    print(f"   To: {to_email}")
    print(f"   Platform: {platform}")
    
    post = {
        "id": post_id,
        "platform": platform,
        "caption": caption,
        "scheduled_time": scheduled_time.isoformat() if scheduled_time else None
    }
    
    subject = f"📝 Review Needed: {platform.capitalize()} Post - {APP_NAME}"
    html_content = get_review_email_html(post, user_name)
    
    return await send_email(to_email, subject, html_content)


async def send_post_approval_email(
    to_email: str,
    user_name: str,
    post_id: str,
    platform: str,
    caption: str
) -> bool:
    """Send email notification for post approval"""
    print(f"\n📧 send_post_approval_email called")
    print(f"   To: {to_email}")
    print(f"   Platform: {platform}")
    
    post = {
        "id": post_id,
        "platform": platform,
        "caption": caption
    }
    
    subject = f"✅ Post Published: {platform.capitalize()} - {APP_NAME}"
    html_content = get_approval_email_html(post, user_name)
    
    return await send_email(to_email, subject, html_content)


async def send_changes_requested_email(
    to_email: str,
    user_name: str,
    post_id: str,
    platform: str,
    caption: str,
    feedback: str
) -> bool:
    """Send email notification for changes requested"""
    print(f"\n📧 send_changes_requested_email called")
    print(f"   To: {to_email}")
    print(f"   Platform: {platform}")
    
    post = {
        "id": post_id,
        "platform": platform,
        "caption": caption
    }
    
    subject = f"✏️ Changes Requested: {platform.capitalize()} Post - {APP_NAME}"
    html_content = get_changes_requested_email_html(post, user_name, feedback)
    
    return await send_email(to_email, subject, html_content)