"""
tests/conftest.py — shared pytest fixtures for the Placement Portal test suite.

Uses an in-memory SQLite database and SimpleCache (no Redis required) so
tests run fast and without external dependencies. Seeds minimal test data:
1 admin, 1 student, 1 approved company, 1 approved drive.
"""
import sys
from pathlib import Path

import pytest
from datetime import date, timedelta
from werkzeug.security import generate_password_hash

# Ensure project root is importable even when pytest is launched from a subdir.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from models import db as _db, Admin, Company, Student, PlacementDrive
from config import Config


class TestConfig(Config):
    """Override production config for testing."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite://'   # in-memory
    CACHE_TYPE = 'SimpleCache'              # no Redis needed
    CACHE_DEFAULT_TIMEOUT = 300
    JWT_SECRET_KEY = 'test-secret'
    SECRET_KEY = 'test-secret'
    CELERY_BROKER_URL = 'memory://'
    CELERY_RESULT_BACKEND = 'cache+memory://'
    RATELIMIT_ENABLED = False               # disable rate limiting in tests
    GROQ_API_KEY = ''                       # no AI calls in tests
    WTF_CSRF_ENABLED = False


@pytest.fixture(scope='session')
def app():
    """Create the Flask app once for the entire test session."""
    app = create_app(config_class=TestConfig)
    return app


@pytest.fixture(scope='function')
def db(app):
    """Create fresh database tables for each test function."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture(scope='function')
def client(app, db):
    """Flask test client with a fresh database."""
    return app.test_client()


@pytest.fixture(scope='function')
def seed_data(db):
    """Seed minimal test data: 1 admin, 1 student, 1 company, 1 drive."""
    password_hash = generate_password_hash('password123')

    admin = Admin(
        username='testadmin',
        email='admin@test.com',
        password_hash=generate_password_hash('admin123'),
    )
    db.session.add(admin)

    student = Student(
        full_name='Test Student',
        email='student@test.com',
        password_hash=password_hash,
        phone='1234567890',
        cgpa=8.5,
        skills='Python, Flask, SQL',
        education='B.Tech Computer Science',
    )
    db.session.add(student)

    company = Company(
        company_name='Test Corp',
        email='company@test.com',
        password_hash=password_hash,
        industry='Software',
        approval_status='Approved',
        is_blacklisted=False,
    )
    db.session.add(company)
    db.session.flush()   # populate IDs

    drive = PlacementDrive(
        company_id=company.id,
        job_title='Software Engineer',
        job_description='We need a skilled Python developer.',
        required_skills='Python, Flask, SQL',
        eligibility_criteria='CGPA >= 7.0',
        salary_range='8-12 LPA',
        location='Bangalore',
        application_deadline=date.today() + timedelta(days=30),
        status='Approved',
    )
    db.session.add(drive)
    db.session.commit()

    return {
        'admin': admin,
        'student': student,
        'company': company,
        'drive': drive,
    }


def _get_token(client, email, password, role):
    """Helper to log in and return a JWT access token."""
    resp = client.post('/api/auth/login', json={
        'email': email,
        'password': password,
        'role': role,
    })
    assert resp.status_code == 200, f'Login failed: {resp.get_json()}'
    return resp.get_json()['access_token']


@pytest.fixture(scope='function')
def admin_token(client, seed_data):
    """JWT token for the test admin."""
    return _get_token(client, 'admin@test.com', 'admin123', 'admin')


@pytest.fixture(scope='function')
def student_token(client, seed_data):
    """JWT token for the test student."""
    return _get_token(client, 'student@test.com', 'password123', 'student')


@pytest.fixture(scope='function')
def company_token(client, seed_data):
    """JWT token for the test company."""
    return _get_token(client, 'company@test.com', 'password123', 'company')


def auth_header(token):
    """Return Authorization header dict for a given token."""
    return {'Authorization': f'Bearer {token}'}
