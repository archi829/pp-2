import os
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from models import db, Admin, Company, Student
from constants import ApprovalStatus

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

ALLOWED_RESUME_EXTENSIONS = {'pdf', 'doc', 'docx'}


def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_RESUME_EXTENSIONS


def _make_token(user_id, role, email):
    return create_access_token(
        identity=str(user_id),
        additional_claims={'role': role, 'email': email},
    )


@auth_bp.route('/login', methods=['POST'])
def login():
    data     = request.get_json(silent=True) or {}
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role     = data.get('role', '')

    if not email or not password or not role:
        return jsonify({'msg': 'email, password and role are required.'}), 400
    if role not in ('admin', 'company', 'student'):
        return jsonify({'msg': 'role must be admin, company, or student.'}), 400

    if role == 'admin':
        user = Admin.query.filter_by(email=email).first()

    elif role == 'company':
        user = Company.query.filter_by(email=email).first()
        if user:
            if user.is_blacklisted:
                return jsonify({'msg': 'Your account has been blacklisted. Contact admin.'}), 403
            if user.approval_status == ApprovalStatus.PENDING:
                return jsonify({'msg': 'Your registration is pending admin approval.'}), 403
            if user.approval_status == ApprovalStatus.REJECTED:
                return jsonify({'msg': 'Your registration was rejected. Contact admin.'}), 403

    elif role == 'student':
        user = Student.query.filter_by(email=email).first()
        if user and user.is_blacklisted:
            return jsonify({'msg': 'Your account has been blacklisted. Contact admin.'}), 403

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'msg': 'Invalid email or password.'}), 401

    return jsonify({
        'access_token': _make_token(user.id, role, user.email),
        'role':         role,
        'user_id':      user.id,
        'email':        user.email,
    }), 200


@auth_bp.route('/register/student', methods=['POST'])
def register_student():
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form
    else:
        data = request.get_json(silent=True) or {}

    full_name = data.get('full_name', '').strip()
    email     = data.get('email', '').strip().lower()
    password  = data.get('password', '')
    confirm   = data.get('confirm_password', '')
    phone     = data.get('phone', '').strip()
    skills    = data.get('skills', '').strip()
    education = data.get('education', '').strip()

    if not full_name or not email or not password:
        return jsonify({'msg': 'full_name, email and password are required.'}), 400
    if confirm and password != confirm:
        return jsonify({'msg': 'Passwords do not match.'}), 400
    if len(password) < 6:
        return jsonify({'msg': 'Password must be at least 6 characters.'}), 400
    if Student.query.filter_by(email=email).first():
        return jsonify({'msg': 'Email already registered.'}), 409

    cgpa = None
    raw_cgpa = data.get('cgpa', '')
    if raw_cgpa:
        try:
            cgpa = float(raw_cgpa)
            if not (0 <= cgpa <= 10):
                raise ValueError
        except ValueError:
            return jsonify({'msg': 'CGPA must be a number between 0 and 10.'}), 400

    resume_filename = None
    resume_file = request.files.get('resume')
    if resume_file and resume_file.filename and _allowed_file(resume_file.filename):
        filename = secure_filename(resume_file.filename)
        resume_filename = f"{email.split('@')[0]}_{filename}"
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)
        resume_file.save(os.path.join(upload_folder, resume_filename))

    student = Student(
        full_name     = full_name,
        email         = email,
        password_hash = generate_password_hash(password),
        phone         = phone,
        cgpa          = cgpa,
        skills        = skills,
        education     = education,
        resume_path   = resume_filename,
    )
    db.session.add(student)
    db.session.commit()

    return jsonify({
        'msg':          'Registration successful.',
        'access_token': _make_token(student.id, 'student', student.email),
        'user_id':      student.id,
        'email':        student.email,
    }), 201


@auth_bp.route('/register/company', methods=['POST'])
def register_company():
    data = request.get_json(silent=True) or {}

    company_name = data.get('company_name', '').strip()
    email        = data.get('email', '').strip().lower()
    password     = data.get('password', '')
    confirm      = data.get('confirm_password', '')

    if not company_name or not email or not password:
        return jsonify({'msg': 'company_name, email and password are required.'}), 400
    if confirm and password != confirm:
        return jsonify({'msg': 'Passwords do not match.'}), 400
    if len(password) < 6:
        return jsonify({'msg': 'Password must be at least 6 characters.'}), 400
    if Company.query.filter_by(email=email).first():
        return jsonify({'msg': 'Email already registered.'}), 409

    company = Company(
        company_name    = company_name,
        email           = email,
        password_hash   = generate_password_hash(password),
        hr_contact      = data.get('hr_contact', '').strip(),
        website         = data.get('website', '').strip(),
        industry        = data.get('industry', '').strip(),
        description     = data.get('description', '').strip(),
        approval_status = ApprovalStatus.PENDING,
    )
    db.session.add(company)
    db.session.commit()

    return jsonify({
        'msg':     'Registration submitted. Wait for admin approval before logging in.',
        'user_id': company.id,
        'email':   company.email,
    }), 201


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    return jsonify({'msg': 'Logout successful. Delete your token on the client.'}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    claims  = get_jwt()
    role    = claims.get('role')
    user_id = int(get_jwt_identity())

    if role == 'admin':
        user = Admin.query.get(user_id)
        if not user:
            return jsonify({'msg': 'User not found.'}), 404
        return jsonify({
            'role': 'admin', 'id': user.id, 'username': user.username,
            'email': user.email,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }), 200

    elif role == 'company':
        user = Company.query.get(user_id)
        if not user:
            return jsonify({'msg': 'User not found.'}), 404
        return jsonify({
            'role': 'company', 'id': user.id, 'company_name': user.company_name,
            'email': user.email, 'hr_contact': user.hr_contact,
            'website': user.website, 'industry': user.industry,
            'description': user.description, 'approval_status': user.approval_status,
            'is_blacklisted': user.is_blacklisted,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }), 200

    elif role == 'student':
        user = Student.query.get(user_id)
        if not user:
            return jsonify({'msg': 'User not found.'}), 404
        return jsonify({
            'role': 'student', 'id': user.id, 'full_name': user.full_name,
            'email': user.email, 'phone': user.phone, 'cgpa': user.cgpa,
            'skills': user.skills, 'education': user.education,
            'resume_path': user.resume_path, 'is_blacklisted': user.is_blacklisted,
            'is_active': user.is_active,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }), 200

    return jsonify({'msg': 'Invalid role in token.'}), 400