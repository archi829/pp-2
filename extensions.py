"""
extensions.py — shared Flask extension instances
Import from here in app.py (to init) and in routes (to use).
Avoids circular imports by keeping extensions separate from models and app.
"""

from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from celery import Celery

jwt   = JWTManager()
cors  = CORS()
cache = Cache()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=None,           # set from app.config in init_app
    default_limits=[],          # no global limit — applied per-route
)


def make_celery(app):
    """Create a Celery instance bound to the Flask app context.
    Tasks decorated with @celery.task can call db queries safely because
    every task execution pushes an app context before running."""
    celery = Celery(app.import_name)
    celery.conf.update(
        broker_url        = app.config['CELERY_BROKER_URL'],
        result_backend    = app.config['CELERY_RESULT_BACKEND'],
        task_serializer    = app.config['CELERY_TASK_SERIALIZER'],
        result_serializer  = app.config['CELERY_RESULT_SERIALIZER'],
        accept_content     = app.config['CELERY_ACCEPT_CONTENT'],
        beat_schedule      = app.config.get('CELERYBEAT_SCHEDULE', {}),
    )

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return super().__call__(*args, **kwargs)

    celery.Task = ContextTask
    return celery
