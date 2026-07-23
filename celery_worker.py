"""
celery_worker.py — entry point for the Celery worker/beat processes.

Run with:
    celery -A celery_worker.celery worker --loglevel=info
    celery -A celery_worker.celery beat   --loglevel=info

Note: this reuses the exact Celery instance that tasks.py builds (via its own
module-level create_app() call) instead of calling create_app() a second
time here. Two separate create_app() calls would produce two independent
Flask apps and therefore two independent Celery() objects -- the @celery.task
decorators in tasks.py bind directly to ITS instance's task registry, so a
second, freshly-built Celery object here would start empty ("received
unregistered task" errors). Importing tasks.celery sidesteps that by reusing
the one instance that actually has the tasks registered on it.
"""
from tasks import celery, flask_app  # noqa: F401 -- flask_app kept for parity/debugging
