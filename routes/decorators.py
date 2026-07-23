from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity
from models import Admin, Company, Student
from constants import ApprovalStatus


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get('role') != 'admin':
            return jsonify({'msg': 'Admins only.'}), 403
        return fn(*args, **kwargs)
    return wrapper


def company_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get('role') != 'company':
            return jsonify({'msg': 'Companies only.'}), 403
        company = Company.query.get(int(get_jwt_identity()))
        if not company:
            return jsonify({'msg': 'Company not found.'}), 404
        if company.is_blacklisted:
            return jsonify({'msg': 'Your account has been blacklisted. Contact admin.'}), 403
        if company.approval_status != ApprovalStatus.APPROVED:
            return jsonify({'msg': 'Your account is pending admin approval.'}), 403
        return fn(*args, **kwargs)
    return wrapper


def student_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get('role') != 'student':
            return jsonify({'msg': 'Students only.'}), 403
        student = Student.query.get(int(get_jwt_identity()))
        if not student:
            return jsonify({'msg': 'Student not found.'}), 404
        if student.is_blacklisted:
            return jsonify({'msg': 'Your account has been blacklisted. Contact admin.'}), 403
        if not student.is_active:
            return jsonify({'msg': 'Your account is inactive.'}), 403
        return fn(*args, **kwargs)
    return wrapper