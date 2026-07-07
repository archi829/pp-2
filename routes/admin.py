from flask import Blueprint, render_template, redirect, url_for, flash, request, send_from_directory, current_app
from flask_login import login_required, current_user
from models import db, Admin, Company, Student, PlacementDrive, Application
from functools import wraps
import os

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not isinstance(current_user, Admin):
            flash('Access denied.', 'danger')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated


@admin_bp.route('/dashboard')
@login_required
@admin_required
def dashboard():
    total_students  = Student.query.count()
    total_companies = Company.query.count()
    total_drives    = PlacementDrive.query.count()
    total_apps      = Application.query.count()
    
    pending_companies = Company.query.filter_by(approval_status='Pending').order_by(Company.created_at.desc()).limit(5).all()
    pending_drives    = PlacementDrive.query.filter_by(status='Pending').order_by(PlacementDrive.created_at.desc()).limit(5).all()
    
    pending_companies_count = Company.query.filter_by(approval_status='Pending').count()
    pending_drives_count = PlacementDrive.query.filter_by(status='Pending').count()

    return render_template('admin/dashboard.html',
        total_students=total_students,
        total_companies=total_companies,
        total_drives=total_drives,
        total_apps=total_apps,
        pending_companies=pending_companies,
        pending_drives=pending_drives,
        pending_companies_count=pending_companies_count,
        pending_drives_count=pending_drives_count
    )


# ── Individual Approve/Reject Companies ───────────────────────────────────────
@admin_bp.route('/company/<int:company_id>/approve', methods=['POST'])
@login_required
@admin_required
def approve_company(company_id):
    company = Company.query.get_or_404(company_id)
    company.approval_status = 'Approved'
    db.session.commit()
    flash(f'{company.company_name} has been approved.', 'success')
    return redirect(request.referrer or url_for('admin.dashboard'))


@admin_bp.route('/company/<int:company_id>/reject', methods=['POST'])
@login_required
@admin_required
def reject_company(company_id):
    company = Company.query.get_or_404(company_id)
    company.approval_status = 'Rejected'
    db.session.commit()
    flash(f'{company.company_name} has been rejected.', 'warning')
    return redirect(request.referrer or url_for('admin.dashboard'))


# ── Bulk Approve/Reject Companies ────────────────────────────────────────────
@admin_bp.route('/company/bulk-status', methods=['POST'])
@login_required
@admin_required
def bulk_company_status():
    company_ids = request.form.getlist('company_ids')
    action = request.form.get('bulk_action')
    
    if not company_ids:
        flash('No companies selected.', 'warning')
        return redirect(request.referrer or url_for('admin.companies'))
    
    new_status = 'Approved' if action == 'approve' else 'Rejected'
    updated = 0
    
    for cid in company_ids:
        company = Company.query.get(int(cid))
        if company:
            company.approval_status = new_status
            updated += 1
            
    db.session.commit()
    flash(f'{updated} companies marked as {new_status}.', 'success')
    return redirect(request.referrer or url_for('admin.companies'))

# ── Individual Approve/Reject Drives ──────────────────────────────────────────
@admin_bp.route('/drive/<int:drive_id>/approve', methods=['POST'])
@login_required
@admin_required
def approve_drive(drive_id):
    drive = PlacementDrive.query.get_or_404(drive_id)
    drive.status = 'Approved'
    db.session.commit()
    flash(f'Drive "{drive.job_title}" approved.', 'success')
    return redirect(request.referrer or url_for('admin.dashboard'))


@admin_bp.route('/drive/<int:drive_id>/reject', methods=['POST'])
@login_required
@admin_required
def reject_drive(drive_id):
    drive = PlacementDrive.query.get_or_404(drive_id)
    drive.status = 'Rejected'
    db.session.commit()
    flash(f'Drive "{drive.job_title}" rejected.', 'warning')
    return redirect(request.referrer or url_for('admin.dashboard'))


# ── Bulk Approve/Reject Drives ───────────────────────────────────────────────
@admin_bp.route('/drive/bulk-status', methods=['POST'])
@login_required
@admin_required
def bulk_drive_status():
    drive_ids = request.form.getlist('drive_ids')
    action = request.form.get('bulk_action')
    
    if not drive_ids:
        flash('No drives selected.', 'warning')
        return redirect(request.referrer or url_for('admin.drives'))
    
    new_status = 'Approved' if action == 'approve' else 'Rejected'
    updated = 0
    
    for did in drive_ids:
        drive = PlacementDrive.query.get(int(did))
        if drive:
            drive.status = new_status
            updated += 1
            
    db.session.commit()
    flash(f'{updated} drives marked as {new_status}.', 'success')
    return redirect(request.referrer or url_for('admin.drives'))


# ── Students ──────────────────────────────────────────────────────────────────
@admin_bp.route('/students')
@login_required
@admin_required
def students():
    q = request.args.get('q', '').strip()
    query = Student.query
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(
                Student.full_name.ilike(like),
                Student.email.ilike(like),
                Student.phone.ilike(like),
                db.cast(Student.id, db.String).ilike(like),
            )
        )
    students = query.order_by(Student.created_at.desc()).all()
    return render_template('admin/students.html', students=students, q=q)


@admin_bp.route('/student/<int:student_id>')
@login_required
@admin_required
def student_detail(student_id):
    student = Student.query.get_or_404(student_id)
    applications = Application.query.filter_by(
        student_id=student_id
    ).order_by(Application.applied_at.desc()).all()
    return render_template('admin/student_detail.html',
                           student=student, applications=applications)


@admin_bp.route('/student/<int:student_id>/blacklist', methods=['POST'])
@login_required
@admin_required
def blacklist_student(student_id):
    student = Student.query.get_or_404(student_id)
    student.is_blacklisted = not student.is_blacklisted
    db.session.commit()
    state = 'blacklisted' if student.is_blacklisted else 'unblacklisted'
    flash(f'{student.full_name} has been {state}.', 'warning')
    return redirect(request.referrer or url_for('admin.students'))


@admin_bp.route('/student/<int:student_id>/delete', methods=['POST'])
@login_required
@admin_required
def delete_student(student_id):
    student = Student.query.get_or_404(student_id)
    db.session.delete(student)
    db.session.commit()
    flash('Student deleted.', 'danger')
    return redirect(url_for('admin.students'))


# ── Companies ─────────────────────────────────────────────────────────────────
@admin_bp.route('/companies')
@login_required
@admin_required
def companies():
    q = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()
    query = Company.query
    
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(
                Company.company_name.ilike(like),
                Company.industry.ilike(like),
                db.cast(Company.id, db.String).ilike(like),
            )
        )
    if status:
        query = query.filter_by(approval_status=status)
        
    companies = query.order_by(Company.created_at.desc()).all()
    return render_template('admin/companies.html', companies=companies, q=q, status=status)


@admin_bp.route('/company/<int:company_id>/blacklist', methods=['POST'])
@login_required
@admin_required
def blacklist_company(company_id):
    company = Company.query.get_or_404(company_id)
    company.is_blacklisted = not company.is_blacklisted
    db.session.commit()
    state = 'blacklisted' if company.is_blacklisted else 'unblacklisted'
    flash(f'{company.company_name} has been {state}.', 'warning')
    return redirect(request.referrer or url_for('admin.companies'))


@admin_bp.route('/company/<int:company_id>/delete', methods=['POST'])
@login_required
@admin_required
def delete_company(company_id):
    company = Company.query.get_or_404(company_id)
    db.session.delete(company)
    db.session.commit()
    flash('Company deleted.', 'danger')
    return redirect(url_for('admin.companies'))


#  All Drives (admin view) 
@admin_bp.route('/drives')
@login_required
@admin_required
def drives():
    status = request.args.get('status', '').strip()
    company_id = request.args.get('company_id', '').strip()
    
    query = PlacementDrive.query
    if status:
        query = query.filter_by(status=status)
    if company_id:
        query = query.filter_by(company_id=company_id)
        
    drives = query.order_by(PlacementDrive.created_at.desc()).all()
    companies = Company.query.all()
    
    return render_template('admin/drives.html', drives=drives, status=status, company_id=company_id, companies=companies)


# All Applications (admin view) 
@admin_bp.route('/applications')
@login_required
@admin_required
def applications():
    apps = Application.query.order_by(Application.applied_at.desc()).all()
    return render_template('admin/applications.html', apps=apps)


@admin_bp.route('/student/<int:student_id>/resume')
@login_required
@admin_required
def download_student_resume(student_id):
    student = Student.query.get_or_404(student_id)
    if not student.resume_path:
        flash('This student has not uploaded a resume.', 'warning')
        return redirect(request.referrer or url_for('admin.students'))
    
    filename = os.path.basename(student.resume_path)
    
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        filename,
        as_attachment=False
    )