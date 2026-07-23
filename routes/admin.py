from flask import Blueprint, jsonify, request, send_from_directory, current_app
from routes.decorators import admin_required
from models import db, Company, Student, PlacementDrive, Application
from constants import ApprovalStatus, DriveStatus
from cache_keys import (
    student_drives_key, admin_companies_key, admin_students_key,
    remember_key, invalidate_namespace, safe_get, safe_set, safe_delete,
)
import os

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


# ── Serializers ────────────────────────────────────────────────────────────

def serialize_company(c):
    return {
        'id': c.id,
        'company_name': c.company_name,
        'email': c.email,
        'industry': c.industry,
        'approval_status': c.approval_status,
        'is_blacklisted': c.is_blacklisted,
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


def serialize_drive(d):
    return {
        'id': d.id,
        'job_title': d.job_title,
        'company_id': d.company_id,
        'company_name': d.company.company_name if d.company else None,
        'application_deadline': d.application_deadline.isoformat() if d.application_deadline else None,
        'applications_count': len(d.applications),
        'status': d.status,
        'created_at': d.created_at.isoformat() if d.created_at else None,
    }


def serialize_student_summary(s):
    return {
        'id': s.id,
        'full_name': s.full_name,
        'email': s.email,
        'phone': s.phone,
        'cgpa': s.cgpa,
        'is_blacklisted': s.is_blacklisted,
    }


def serialize_student_detail(s):
    return {
        'id': s.id,
        'full_name': s.full_name,
        'email': s.email,
        'phone': s.phone,
        'cgpa': s.cgpa,
        'skills': s.skills,
        'education': s.education,
        'resume_path': s.resume_path,
        'is_blacklisted': s.is_blacklisted,
        'is_active': s.is_active,
        'created_at': s.created_at.isoformat() if s.created_at else None,
    }


def serialize_application_for_student(a):
    return {
        'id': a.id,
        'drive_id': a.drive_id,
        'job_title': a.drive.job_title if a.drive else None,
        'company_name': a.drive.company.company_name if a.drive and a.drive.company else None,
        'location': a.drive.location if a.drive else None,
        'applied_at': a.applied_at.isoformat() if a.applied_at else None,
        'status': a.status,
    }


def serialize_application(a):
    return {
        'id': a.id,
        'student_id': a.student_id,
        'student_name': a.student.full_name if a.student else None,
        'drive_id': a.drive_id,
        'drive_job_title': a.drive.job_title if a.drive else None,
        'company_name': a.drive.company.company_name if a.drive and a.drive.company else None,
        'applied_at': a.applied_at.isoformat() if a.applied_at else None,
        'status': a.status,
        'offer_status': a.offer_status,
    }


def serialize_log(entry):
    return {
        'id':              entry.id,
        'from_status':     entry.from_status,
        'to_status':       entry.to_status,
        'changed_by_role': entry.changed_by_role,
        'note':            entry.note,
        'changed_at':      entry.changed_at.isoformat() if entry.changed_at else None,
    }


# ── Dashboard ────────────────────────────────────────────────────────────

@admin_bp.route('/dashboard')
@admin_required
def dashboard():
    total_students  = Student.query.count()
    total_companies = Company.query.count()
    total_drives    = PlacementDrive.query.count()
    total_apps      = Application.query.count()

    pending_companies = Company.query.filter_by(
        approval_status=ApprovalStatus.PENDING
    ).order_by(Company.created_at.desc()).limit(5).all()

    pending_drives = PlacementDrive.query.filter_by(
        status=DriveStatus.PENDING
    ).order_by(PlacementDrive.created_at.desc()).limit(5).all()

    pending_companies_count = Company.query.filter_by(approval_status=ApprovalStatus.PENDING).count()
    pending_drives_count    = PlacementDrive.query.filter_by(status=DriveStatus.PENDING).count()

    return jsonify({
        'total_students': total_students,
        'total_companies': total_companies,
        'total_drives': total_drives,
        'total_apps': total_apps,
        'pending_companies': [serialize_company(c) for c in pending_companies],
        'pending_drives': [serialize_drive(d) for d in pending_drives],
        'pending_companies_count': pending_companies_count,
        'pending_drives_count': pending_drives_count,
    }), 200


# ── Companies ────────────────────────────────────────────────────────────

@admin_bp.route('/companies')
@admin_required
def companies():
    q      = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()

    cache_key = admin_companies_key(q, status)
    cached = safe_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

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

    companies_list = query.order_by(Company.created_at.desc()).all()
    payload = [serialize_company(c) for c in companies_list]

    safe_set(cache_key, payload, timeout=300)
    remember_key('admin_companies', cache_key)
    return jsonify(payload), 200


@admin_bp.route('/companies/<int:company_id>/approve', methods=['PUT'])
@admin_required
def approve_company(company_id):
    company = Company.query.get(company_id)
    if not company:
        return jsonify({'msg': 'Company not found.'}), 404
    company.approval_status = ApprovalStatus.APPROVED
    db.session.commit()
    invalidate_namespace('admin_companies')
    return jsonify({'msg': f'{company.company_name} has been approved.', 'id': company.id,
                     'new_status': company.approval_status}), 200


@admin_bp.route('/companies/<int:company_id>/reject', methods=['PUT'])
@admin_required
def reject_company(company_id):
    company = Company.query.get(company_id)
    if not company:
        return jsonify({'msg': 'Company not found.'}), 404
    company.approval_status = ApprovalStatus.REJECTED
    db.session.commit()
    invalidate_namespace('admin_companies')
    return jsonify({'msg': f'{company.company_name} has been rejected.', 'id': company.id,
                     'new_status': company.approval_status}), 200


@admin_bp.route('/companies/<int:company_id>/blacklist', methods=['PUT'])
@admin_required
def blacklist_company(company_id):
    company = Company.query.get(company_id)
    if not company:
        return jsonify({'msg': 'Company not found.'}), 404
    company.is_blacklisted = not company.is_blacklisted
    db.session.commit()
    invalidate_namespace('admin_companies')
    state = 'blacklisted' if company.is_blacklisted else 'unblacklisted'
    return jsonify({'msg': f'{company.company_name} has been {state}.', 'id': company.id,
                     'is_blacklisted': company.is_blacklisted}), 200


@admin_bp.route('/companies/<int:company_id>', methods=['DELETE'])
@admin_required
def delete_company(company_id):
    company = Company.query.get(company_id)
    if not company:
        return jsonify({'msg': 'Company not found.'}), 404
    db.session.delete(company)
    db.session.commit()
    invalidate_namespace('admin_companies')
    return jsonify({'msg': 'Company deleted.', 'id': company_id}), 200


@admin_bp.route('/companies/bulk-status', methods=['POST'])
@admin_required
def bulk_company_status():
    data        = request.get_json(silent=True) or {}
    company_ids = data.get('company_ids', [])
    action      = data.get('action')

    if not company_ids:
        return jsonify({'msg': 'No companies selected.'}), 400
    if action not in ('approve', 'reject'):
        return jsonify({'msg': "action must be 'approve' or 'reject'."}), 400

    new_status = ApprovalStatus.APPROVED if action == 'approve' else ApprovalStatus.REJECTED
    updated_ids = []
    for cid in company_ids:
        company = Company.query.get(int(cid))
        if company:
            company.approval_status = new_status
            updated_ids.append(company.id)

    db.session.commit()
    invalidate_namespace('admin_companies')
    return jsonify({'msg': f'{len(updated_ids)} companies marked as {new_status}.',
                     'updated_ids': updated_ids, 'new_status': new_status}), 200


# ── Drives ───────────────────────────────────────────────────────────────

@admin_bp.route('/drives')
@admin_required
def drives():
    status     = request.args.get('status', '').strip()
    company_id = request.args.get('company_id', '').strip()
    query      = PlacementDrive.query

    if status:
        query = query.filter_by(status=status)
    if company_id:
        query = query.filter_by(company_id=company_id)

    drives_list = query.order_by(PlacementDrive.created_at.desc()).all()
    return jsonify([serialize_drive(d) for d in drives_list]), 200


@admin_bp.route('/drives/<int:drive_id>/approve', methods=['PUT'])
@admin_required
def approve_drive(drive_id):
    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'msg': 'Drive not found.'}), 404
    drive.status = DriveStatus.APPROVED
    db.session.commit()
    safe_delete(student_drives_key(''))
    return jsonify({'msg': f'Drive "{drive.job_title}" approved.', 'id': drive.id,
                     'new_status': drive.status}), 200


@admin_bp.route('/drives/<int:drive_id>/reject', methods=['PUT'])
@admin_required
def reject_drive(drive_id):
    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'msg': 'Drive not found.'}), 404
    drive.status = DriveStatus.REJECTED
    db.session.commit()
    safe_delete(student_drives_key(''))
    return jsonify({'msg': f'Drive "{drive.job_title}" rejected.', 'id': drive.id,
                     'new_status': drive.status}), 200


@admin_bp.route('/drives/<int:drive_id>', methods=['DELETE'])
@admin_required
def delete_drive(drive_id):
    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'msg': 'Drive not found.'}), 404
    db.session.delete(drive)
    db.session.commit()
    safe_delete(student_drives_key(''))
    return jsonify({'msg': 'Drive deleted.', 'id': drive_id}), 200


@admin_bp.route('/drives/bulk-status', methods=['POST'])
@admin_required
def bulk_drive_status():
    data      = request.get_json(silent=True) or {}
    drive_ids = data.get('drive_ids', [])
    action    = data.get('action')

    if not drive_ids:
        return jsonify({'msg': 'No drives selected.'}), 400
    if action not in ('approve', 'reject'):
        return jsonify({'msg': "action must be 'approve' or 'reject'."}), 400

    new_status = DriveStatus.APPROVED if action == 'approve' else DriveStatus.REJECTED
    updated_ids = []
    for did in drive_ids:
        drive = PlacementDrive.query.get(int(did))
        if drive:
            drive.status = new_status
            updated_ids.append(drive.id)

    db.session.commit()
    safe_delete(student_drives_key(''))
    return jsonify({'msg': f'{len(updated_ids)} drives marked as {new_status}.',
                     'updated_ids': updated_ids, 'new_status': new_status}), 200


# ── Students ─────────────────────────────────────────────────────────────

@admin_bp.route('/students')
@admin_required
def students():
    q = request.args.get('q', '').strip()

    cache_key = admin_students_key(q)
    cached = safe_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

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
    students_list = query.order_by(Student.created_at.desc()).all()
    payload = [serialize_student_summary(s) for s in students_list]

    safe_set(cache_key, payload, timeout=300)
    remember_key('admin_students', cache_key)
    return jsonify(payload), 200


@admin_bp.route('/students/<int:student_id>')
@admin_required
def student_detail(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'msg': 'Student not found.'}), 404
    applications = Application.query.filter_by(
        student_id=student_id
    ).order_by(Application.applied_at.desc()).all()

    payload = serialize_student_detail(student)
    payload['applications'] = [serialize_application_for_student(a) for a in applications]
    return jsonify(payload), 200


@admin_bp.route('/students/<int:student_id>/blacklist', methods=['PUT'])
@admin_required
def blacklist_student(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'msg': 'Student not found.'}), 404
    student.is_blacklisted = not student.is_blacklisted
    db.session.commit()
    invalidate_namespace('admin_students')
    state = 'blacklisted' if student.is_blacklisted else 'unblacklisted'
    return jsonify({'msg': f'{student.full_name} has been {state}.', 'id': student.id,
                     'is_blacklisted': student.is_blacklisted}), 200


@admin_bp.route('/students/<int:student_id>', methods=['DELETE'])
@admin_required
def delete_student(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'msg': 'Student not found.'}), 404
    db.session.delete(student)
    db.session.commit()
    invalidate_namespace('admin_students')
    return jsonify({'msg': 'Student deleted.', 'id': student_id}), 200


@admin_bp.route('/students/<int:student_id>/resume')
@admin_required
def download_student_resume(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'msg': 'Student not found.'}), 404
    if not student.resume_path:
        return jsonify({'msg': 'This student has not uploaded a resume.'}), 404
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(student.resume_path),
        as_attachment=False
    )


# ── Applications ─────────────────────────────────────────────────────────

@admin_bp.route('/applications')
@admin_required
def applications():
    include_history = request.args.get('history') == '1'
    apps = Application.query.order_by(Application.applied_at.desc()).all()
    result = []
    for a in apps:
        row = serialize_application(a)
        if include_history:
            row['status_log'] = [serialize_log(e) for e in a.status_log]
        result.append(row)
    return jsonify(result), 200


@admin_bp.route('/applications/<int:app_id>/history')
@admin_required
def application_history(app_id):
    app = Application.query.get_or_404(app_id)
    return jsonify([serialize_log(e) for e in app.status_log]), 200


# ── Search ───────────────────────────────────────────────────────────────

@admin_bp.route('/search')
@admin_required
def search():
    q     = request.args.get('q', '').strip()
    ttype = request.args.get('type', '').strip()

    if ttype == 'company':
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
        results = query.order_by(Company.created_at.desc()).all()
        return jsonify([serialize_company(c) for c in results]), 200

    elif ttype == 'student':
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
        results = query.order_by(Student.created_at.desc()).all()
        return jsonify([serialize_student_summary(s) for s in results]), 200

    return jsonify({'msg': "type must be 'company' or 'student'."}), 400