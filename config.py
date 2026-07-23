"""
config.py — single source of truth for all app configuration.
app.py loads this via app.config.from_object(Config) instead of hardcoding
values inline. celery_worker.py / extensions.make_celery() read the
CELERY_* keys straight off app.config, so they stay in sync automatically.
"""
import os
from celery.schedules import crontab


class Config:
    # ── Flask / SQLAlchemy ───────────────────────────────────────────────
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mad2-jwt-secret-change-in-prod')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'mad2-jwt-secret-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = False   # no expiry for dev; set a timedelta in prod
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///placement_portal.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = 'static/uploads/resumes'

    # ── Redis ────────────────────────────────────────────────────────────
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')

    # ── Celery ───────────────────────────────────────────────────────────
    CELERY_BROKER_URL = REDIS_URL + '/0'
    CELERY_RESULT_BACKEND = REDIS_URL + '/0'
    CELERY_TASK_SERIALIZER = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_ACCEPT_CONTENT = ['json']
    CELERYBEAT_SCHEDULE = {
        'daily-interview-reminders': {
            'task': 'tasks.send_interview_reminders',
            'schedule': crontab(hour=8, minute=0),                    # 8 AM daily
        },
        'monthly-placement-report': {
            'task': 'tasks.send_monthly_report',
            'schedule': crontab(day_of_month=1, hour=6, minute=0),    # 1st of month
        },
    }

    # ── Flask-Caching (Milestone 8 — configured here so app.py doesn't
    #    need to change again when that milestone lands) ───────────────
    CACHE_TYPE = 'redis'
    CACHE_REDIS_URL = REDIS_URL + '/1'   # DB 1 keeps cache separate from the Celery broker (DB 0)
    CACHE_DEFAULT_TIMEOUT = 300

    # ── Email (Mailtrap for dev, real SMTP for prod) ────────────────────
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.mailtrap.io')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '587'))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_FROM = os.environ.get('MAIL_FROM', 'noreply@placementportal.local')
    ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@placementportal.com')
