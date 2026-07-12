from flask import Blueprint, jsonify, request, send_from_directory, current_app
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func
from routes.decorators import admin_required
from models import db, Company, Student, PlacementDrive, Application
from constants import ApprovalStatus, DriveStatus
import os

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


# ── Dict helpers ──────────────────────────────────────────────────────────────
# app_count / drive_count accept a precomputed value to avoid N+1 queries
# on list endpoints. Falls back to a single query when called for one record.

def _student_dict(s, include_apps=False, app_count=None):
    d = {
        'id':               s.id,
        'full_name':        s.full_name,
        'email':            s.email,
        'phone':            s.phone,
        'cgpa':             s.cgpa,
        'skills':           s.skills,
        'education':        s.education,
        'resume_path':      s.resume_path,
        'is_blacklisted':   s.is_blacklisted,
        'is_active':        s.is_active,
        'created_at':       s.created_at.isoformat() if s.created_at else None,
        'application_count': app_count if app_count is not None
                             else Application.query.filter_by(student_id=s.id).count(),
    }
    if include_apps:
        d['applications'] = [_app_dict(a) for a in
                             Application.query.filter_by(student_id=s.id)
                             .order_by(Application.applied_at.desc()).all()]
    return d


def _company_dict(c, drive_count=None):
    return {
        'id':               c.id,
        'company_name':     c.company_name,
        'email':            c.email,
        'hr_contact':       c.hr_contact,
        'website':          c.website,
        'industry':         c.industry,
        'description':      c.description,
        'approval_status':  c.approval_status,
        'is_blacklisted':   c.is_blacklisted,
        'created_at':       c.created_at.isoformat() if c.created_at else None,
        'drive_count':      drive_count if drive_count is not None
                            else PlacementDrive.query.filter_by(company_id=c.id).count(),
    }


def _drive_dict(d, app_count=None):
    return {
        'id':                   d.id,
        'company_id':           d.company_id,
        'company_name':         d.company.company_name if d.company else None,
        'job_title':            d.job_title,
        'job_description':      d.job_description,
        'eligibility_criteria': d.eligibility_criteria,
        'required_skills':      d.required_skills,
        'salary_range':         d.salary_range,
        'application_deadline': d.application_deadline.isoformat() if d.application_deadline else None,
        'location':             d.location,
        'status':               d.status,
        'created_at':           d.created_at.isoformat() if d.created_at else None,
        'application_count':    app_count if app_count is not None
                                else Application.query.filter_by(drive_id=d.id).count(),
    }


def _app_dict(a):
    return {
        'id':            a.id,
        'student_id':    a.student_id,
        'student_name':  a.student.full_name if a.student else None,
        'student_email': a.student.email if a.student else None,
        'drive_id':      a.drive_id,
        'job_title':     a.drive.job_title if a.drive else None,
        'company_name':  a.drive.company.company_name if a.drive and a.drive.company else None,
        'status':        a.status,
        'offer_status':  a.offer_status,
        'applied_at':    a.applied_at.isoformat() if a.applied_at else None,
    }


def _precompute_app_counts(ids, id_col):
    """One query to get application counts for a list of student/drive IDs."""
    if not ids:
        return {}
    return dict(
        db.session.query(id_col, func.count(Application.id))
        .filter(id_col.in_(ids))
        .group_by(id_col)
        .all()
    )


def _precompute_drive_counts(company_ids):
    """One query to get drive counts for a list of company IDs."""
    if not company_ids:
        return {}
    return dict(
        db.session.query(PlacementDrive.company_id, func.count(PlacementDrive.id))
        .filter(PlacementDrive.company_id.in_(company_ids))
        .group_by(PlacementDrive.company_id)
        .all()
    )


# ── Stats ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def stats():
    pending_cos    = (Company.query
                     .filter_by(approval_status=ApprovalStatus.PENDING)
                     .order_by(Company.created_at.desc()).limit(5).all())
    pending_drives = (PlacementDrive.query
                     .filter_by(status=DriveStatus.PENDING)
                     .order_by(PlacementDrive.created_at.desc()).limit(5).all())

    return jsonify({
        'total_students':      Student.query.count(),
        'total_companies':     Company.query.count(),
        'total_drives':        PlacementDrive.query.count(),
        'total_applications':  Application.query.count(),
        'pending_companies':   Company.query.filter_by(approval_status=ApprovalStatus.PENDING).count(),
        'pending_drives':      PlacementDrive.query.filter_by(status=DriveStatus.PENDING).count(),
        # Latest 5 pending items for dashboard cards (fixes missing pending lists)
        'pending_company_list': [_company_dict(c) for c in pending_cos],
        'pending_drive_list':   [_drive_dict(d)   for d in pending_drives],
    }), 200


# ── Students ──────────────────────────────────────────────────────────────────

@admin_bp.route('/students', methods=['GET'])
@admin_required
def students():
    q     = request.args.get('q', '').strip()
    query = Student.query
    if q:
        like  = f'%{q}%'
        query = query.filter(
            db.or_(
                Student.full_name.ilike(like),
                Student.email.ilike(like),
                Student.phone.ilike(like),
                db.cast(Student.id, db.String).ilike(like),   # ID search restored
            )
        )
    students = query.order_by(Student.created_at.desc()).all()

    # Single query for all application counts — fixes N+1
    ids        = [s.id for s in students]
    app_counts = _precompute_app_counts(ids, Application.student_id)

    return jsonify([_student_dict(s, app_count=app_counts.get(s.id, 0))
                    for s in students]), 200


@admin_bp.route('/students/<int:student_id>', methods=['GET'])
@admin_required
def student_detail(student_id):
    s = Student.query.get_or_404(student_id)
    return jsonify(_student_dict(s, include_apps=True)), 200


@admin_bp.route('/students/<int:student_id>/blacklist', methods=['PATCH'])
@admin_required
def blacklist_student(student_id):
    s = Student.query.get_or_404(student_id)
    s.is_blacklisted = not s.is_blacklisted
    db.session.commit()
    return jsonify({'msg': f'Student {"blacklisted" if s.is_blacklisted else "unblacklisted"}.',
                    'is_blacklisted': s.is_blacklisted}), 200


@admin_bp.route('/students/<int:student_id>', methods=['DELETE'])
@admin_required
def delete_student(student_id):
    s = Student.query.get_or_404(student_id)
    db.session.delete(s)
    db.session.commit()
    return jsonify({'msg': 'Student deleted.'}), 200


@admin_bp.route('/students/<int:student_id>/resume', methods=['GET'])
@admin_required
def download_student_resume(student_id):
    s = Student.query.get_or_404(student_id)
    if not s.resume_path:
        return jsonify({'msg': 'No resume uploaded.'}), 404
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(s.resume_path),
        as_attachment=False
    )


# ── Companies ─────────────────────────────────────────────────────────────────

@admin_bp.route('/companies', methods=['GET'])
@admin_required
def companies():
    q      = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()
    query  = Company.query
    if q:
        like  = f'%{q}%'
        query = query.filter(
            db.or_(
                Company.company_name.ilike(like),
                Company.industry.ilike(like),
                db.cast(Company.id, db.String).ilike(like),   # ID search restored
            )
        )
    if status:
        query = query.filter_by(approval_status=status)
    companies = query.order_by(Company.created_at.desc()).all()

    # Single query for all drive counts — fixes N+1
    ids          = [c.id for c in companies]
    drive_counts = _precompute_drive_counts(ids)

    return jsonify([_company_dict(c, drive_count=drive_counts.get(c.id, 0))
                    for c in companies]), 200


@admin_bp.route('/companies/<int:company_id>/approve', methods=['PATCH'])
@admin_required
def approve_company(company_id):
    c = Company.query.get_or_404(company_id)
    c.approval_status = ApprovalStatus.APPROVED
    db.session.commit()
    return jsonify({'msg': f'{c.company_name} approved.',
                    'approval_status': c.approval_status}), 200


@admin_bp.route('/companies/<int:company_id>/reject', methods=['PATCH'])
@admin_required
def reject_company(company_id):
    c = Company.query.get_or_404(company_id)
    c.approval_status = ApprovalStatus.REJECTED
    db.session.commit()
    return jsonify({'msg': f'{c.company_name} rejected.',
                    'approval_status': c.approval_status}), 200


@admin_bp.route('/companies/<int:company_id>/blacklist', methods=['PATCH'])
@admin_required
def blacklist_company(company_id):
    c = Company.query.get_or_404(company_id)
    c.is_blacklisted = not c.is_blacklisted
    db.session.commit()
    return jsonify({'msg': f'Company {"blacklisted" if c.is_blacklisted else "unblacklisted"}.',
                    'is_blacklisted': c.is_blacklisted}), 200


@admin_bp.route('/companies/<int:company_id>', methods=['DELETE'])
@admin_required
def delete_company(company_id):
    c = Company.query.get_or_404(company_id)
    db.session.delete(c)
    db.session.commit()
    return jsonify({'msg': 'Company deleted.'}), 200


@admin_bp.route('/companies/bulk', methods=['POST'])
@admin_required
def bulk_company_status():
    data       = request.get_json(silent=True) or {}
    ids        = data.get('ids', [])
    action     = data.get('action', '')
    if not ids or action not in ('approve', 'reject'):
        return jsonify({'msg': 'ids and action (approve/reject) required.'}), 400
    new_status = ApprovalStatus.APPROVED if action == 'approve' else ApprovalStatus.REJECTED
    updated    = 0
    for cid in ids:
        c = Company.query.get(cid)
        if c:
            c.approval_status = new_status
            updated += 1
    db.session.commit()
    return jsonify({'msg': f'{updated} companies marked as {new_status}.'}), 200


# ── Drives ────────────────────────────────────────────────────────────────────

@admin_bp.route('/drives', methods=['GET'])
@admin_required
def drives():
    status     = request.args.get('status', '').strip()
    company_id = request.args.get('company_id', '').strip()
    query      = PlacementDrive.query
    if status:
        query = query.filter_by(status=status)
    if company_id:
        query = query.filter_by(company_id=company_id)
    drives = query.order_by(PlacementDrive.created_at.desc()).all()

    # Single query for all application counts — fixes N+1
    ids        = [d.id for d in drives]
    app_counts = _precompute_app_counts(ids, Application.drive_id)

    return jsonify([_drive_dict(d, app_count=app_counts.get(d.id, 0))
                    for d in drives]), 200


@admin_bp.route('/drives/<int:drive_id>/approve', methods=['PATCH'])
@admin_required
def approve_drive(drive_id):
    d = PlacementDrive.query.get_or_404(drive_id)
    d.status = DriveStatus.APPROVED
    db.session.commit()
    return jsonify({'msg': f'Drive "{d.job_title}" approved.', 'status': d.status}), 200


@admin_bp.route('/drives/<int:drive_id>/reject', methods=['PATCH'])
@admin_required
def reject_drive(drive_id):
    d = PlacementDrive.query.get_or_404(drive_id)
    d.status = DriveStatus.REJECTED
    db.session.commit()
    return jsonify({'msg': f'Drive "{d.job_title}" rejected.', 'status': d.status}), 200


@admin_bp.route('/drives/bulk', methods=['POST'])
@admin_required
def bulk_drive_status():
    data       = request.get_json(silent=True) or {}
    ids        = data.get('ids', [])
    action     = data.get('action', '')
    if not ids or action not in ('approve', 'reject'):
        return jsonify({'msg': 'ids and action (approve/reject) required.'}), 400
    new_status = DriveStatus.APPROVED if action == 'approve' else DriveStatus.REJECTED
    updated    = 0
    for did in ids:
        d = PlacementDrive.query.get(did)
        if d:
            d.status = new_status
            updated += 1
    db.session.commit()
    return jsonify({'msg': f'{updated} drives marked as {new_status}.'}), 200


# ── Applications ──────────────────────────────────────────────────────────────

@admin_bp.route('/applications', methods=['GET'])
@admin_required
def applications():
    apps = Application.query.order_by(Application.applied_at.desc()).all()
    return jsonify([_app_dict(a) for a in apps]), 200