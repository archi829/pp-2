import os
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Admin, Company, Student

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'pdf', 'doc', 'docx'}

def redirect_to_dashboard():
    if isinstance(current_user, Admin):
        return redirect(url_for('admin.dashboard'))
    elif isinstance(current_user, Company):
        return redirect(url_for('company.dashboard'))
    elif isinstance(current_user, Student):
        return redirect(url_for('student.dashboard'))
    return redirect(url_for('auth.login'))

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect_to_dashboard()

    if request.method == 'POST':
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        role     = request.form.get('role', '')

        if not email or not password or not role:
            flash('All fields are required.', 'danger')
            return render_template('auth/login.html')

        user = None

        if role == 'admin':
            user = Admin.query.filter_by(email=email).first()

        elif role == 'company':
            user = Company.query.filter_by(email=email).first()
            if user:
                if user.is_blacklisted:
                    flash('Your account has been blacklisted. Contact admin.', 'danger')
                    return render_template('auth/login.html')
                if user.approval_status == 'Pending':
                    flash('Your registration is pending admin approval. Please wait.', 'warning')
                    return render_template('auth/login.html')
                if user.approval_status == 'Rejected':
                    flash('Your registration was rejected. Contact admin.', 'danger')
                    return render_template('auth/login.html')

        elif role == 'student':
            user = Student.query.filter_by(email=email).first()
            if user and user.is_blacklisted:
                flash('Your account has been blacklisted. Contact admin.', 'danger')
                return render_template('auth/login.html')

        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            flash('Logged in successfully!', 'success')
            return redirect_to_dashboard()
        else:
            flash('Invalid email or password.', 'danger')

    return render_template('auth/login.html')

@auth_bp.route('/register/student', methods=['GET', 'POST'])
def register_student():
    if current_user.is_authenticated:
        return redirect_to_dashboard()

    if request.method == 'POST':
        full_name = request.form.get('full_name', '').strip()
        email     = request.form.get('email', '').strip().lower()
        password  = request.form.get('password', '')
        confirm   = request.form.get('confirm_password', '')
        phone     = request.form.get('phone', '').strip()
        cgpa      = request.form.get('cgpa', '')
        skills    = request.form.get('skills', '').strip()
        education = request.form.get('education', '').strip()

        if not full_name or not email or not password:
            flash('Name, email and password are required.', 'danger')
            return render_template('auth/register.html', role='student')
        if password != confirm:
            flash('Passwords do not match.', 'danger')
            return render_template('auth/register.html', role='student')
        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return render_template('auth/register.html', role='student')
        if Student.query.filter_by(email=email).first():
            flash('Email already registered.', 'danger')
            return render_template('auth/register.html', role='student')

        try:
            cgpa = float(cgpa) if cgpa else None
            if cgpa and not (0 <= cgpa <= 10):
                raise ValueError
        except ValueError:
            flash('CGPA must be a number between 0 and 10.', 'danger')
            return render_template('auth/register.html', role='student')

        # Handle Resume Upload
        resume_file = request.files.get('resume')
        resume_filename = None
        if resume_file and resume_file.filename and allowed_file(resume_file.filename):
            filename = secure_filename(resume_file.filename)
            resume_filename = f"{email.split('@')[0]}_{filename}"
            upload_folder = current_app.config['UPLOAD_FOLDER']
            os.makedirs(upload_folder, exist_ok=True)
            upload_path = os.path.join(upload_folder, resume_filename)
            resume_file.save(upload_path)

        student = Student(
            full_name     = full_name,
            email         = email,
            password_hash = generate_password_hash(password),
            phone         = phone,
            cgpa          = cgpa,
            skills        = skills,
            education     = education,
            resume_path   = resume_filename
        )
        db.session.add(student)
        db.session.commit()
        flash('Registration successful! Please log in.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html', role='student')

@auth_bp.route('/register/company', methods=['GET', 'POST'])
def register_company():
    if current_user.is_authenticated:
        return redirect_to_dashboard()

    if request.method == 'POST':
        company_name = request.form.get('company_name', '').strip()
        email        = request.form.get('email', '').strip().lower()
        password     = request.form.get('password', '')
        confirm      = request.form.get('confirm_password', '')
        hr_contact   = request.form.get('hr_contact', '').strip()
        website      = request.form.get('website', '').strip()
        industry     = request.form.get('industry', '').strip()
        description  = request.form.get('description', '').strip()

        if not company_name or not email or not password:
            flash('Company name, email and password are required.', 'danger')
            return render_template('auth/register.html', role='company')
        if password != confirm:
            flash('Passwords do not match.', 'danger')
            return render_template('auth/register.html', role='company')
        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
            return render_template('auth/register.html', role='company')
        if Company.query.filter_by(email=email).first():
            flash('Email already registered.', 'danger')
            return render_template('auth/register.html', role='company')

        company = Company(
            company_name    = company_name,
            email           = email,
            password_hash   = generate_password_hash(password),
            hr_contact      = hr_contact,
            website         = website,
            industry        = industry,
            description     = description,
            approval_status = 'Pending'
        )
        db.session.add(company)
        db.session.commit()
        flash('Registration submitted! Wait for admin approval before logging in.', 'warning')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html', role='company')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth.login'))