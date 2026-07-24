"""
tests/test_auth.py — Authentication & authorization tests.

Covers: JWT login, registration, invalid credentials, /me endpoint.
"""
from tests.conftest import auth_header


class TestLogin:
    def test_login_success_admin(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'admin@test.com',
            'password': 'admin123',
            'role': 'admin',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'access_token' in data
        assert data['role'] == 'admin'
        assert data['email'] == 'admin@test.com'

    def test_login_success_student(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'student@test.com',
            'password': 'password123',
            'role': 'student',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'access_token' in data
        assert data['role'] == 'student'

    def test_login_success_company(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'company@test.com',
            'password': 'password123',
            'role': 'company',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'access_token' in data
        assert data['role'] == 'company'

    def test_login_invalid_password(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'student@test.com',
            'password': 'wrongpassword',
            'role': 'student',
        })
        assert resp.status_code == 401
        assert 'Invalid email or password' in resp.get_json()['msg']

    def test_login_missing_fields(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'student@test.com',
        })
        assert resp.status_code == 400
        assert 'required' in resp.get_json()['msg'].lower()

    def test_login_invalid_role(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'student@test.com',
            'password': 'password123',
            'role': 'superadmin',
        })
        assert resp.status_code == 400

    def test_login_nonexistent_email(self, client, seed_data):
        resp = client.post('/api/auth/login', json={
            'email': 'nobody@test.com',
            'password': 'password123',
            'role': 'student',
        })
        assert resp.status_code == 401


class TestRegister:
    def test_register_student_success(self, client, db):
        resp = client.post('/api/auth/register/student', json={
            'full_name': 'New Student',
            'email': 'new@student.com',
            'password': 'secret123',
            'skills': 'React, Node.js',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert 'access_token' in data
        assert data['email'] == 'new@student.com'

    def test_register_student_duplicate_email(self, client, seed_data):
        resp = client.post('/api/auth/register/student', json={
            'full_name': 'Duplicate Student',
            'email': 'student@test.com',   # already exists
            'password': 'secret123',
        })
        assert resp.status_code == 409
        assert 'already registered' in resp.get_json()['msg'].lower()

    def test_register_student_short_password(self, client, db):
        resp = client.post('/api/auth/register/student', json={
            'full_name': 'Short Pass',
            'email': 'short@test.com',
            'password': '123',
        })
        assert resp.status_code == 400
        assert 'at least 6' in resp.get_json()['msg'].lower()

    def test_register_company_success(self, client, db):
        resp = client.post('/api/auth/register/company', json={
            'company_name': 'NewCo',
            'email': 'new@company.com',
            'password': 'secret123',
            'industry': 'Tech',
        })
        assert resp.status_code == 201
        assert 'admin approval' in resp.get_json()['msg'].lower()

    def test_register_company_duplicate(self, client, seed_data):
        resp = client.post('/api/auth/register/company', json={
            'company_name': 'Duplicate',
            'email': 'company@test.com',
            'password': 'secret123',
        })
        assert resp.status_code == 409


class TestMeEndpoint:
    def test_me_admin(self, client, admin_token):
        resp = client.get('/api/auth/me', headers=auth_header(admin_token))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['role'] == 'admin'
        assert data['email'] == 'admin@test.com'

    def test_me_student(self, client, student_token):
        resp = client.get('/api/auth/me', headers=auth_header(student_token))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['role'] == 'student'
        assert data['full_name'] == 'Test Student'

    def test_me_company(self, client, company_token):
        resp = client.get('/api/auth/me', headers=auth_header(company_token))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['role'] == 'company'
        assert data['company_name'] == 'Test Corp'

    def test_me_no_token(self, client, seed_data):
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401


class TestLogout:
    def test_logout(self, client, student_token):
        resp = client.post('/api/auth/logout', headers=auth_header(student_token))
        assert resp.status_code == 200
        assert 'logout' in resp.get_json()['msg'].lower()
