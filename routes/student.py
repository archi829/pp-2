"""
routes/student.py — MAD2 pure JSON API for the student role.
Replaces the Jinja2/Flask-Login version from MAD1.
All endpoints return JSON; no render_template calls remain.
"""
import os

from flask import Blueprint, jsonify, request, send_from_directory, current_app
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename

from routes.decorators import student_required
from models import (
    db, Student, PlacementDrive, Application,
    Notification, Interview, Placement, Company, ApplicationStatusLog
)
from constants import ApplicationStatus, DriveStatus, OfferStatus
from celery.result import AsyncResult
from cache_keys import student_drives_key, safe_get, safe_set, safe_delete

student_bp = Blueprint('student', __name__, url_prefix='/api/student')

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}


def _log_status(application_id, from_status, to_status, role, user_id, note=None):
    """Write one ApplicationStatusLog row before db.session.commit()."""
    db.session.add(ApplicationStatusLog(
        application_id=application_id,
        from_status=from_status,
        to_status=to_status,
        changed_by_role=role,
        changed_by_id=user_id,
        note=note,
    ))


def _serialize_log(entry):
    return {
        'id':              entry.id,
        'from_status':     entry.from_status,
        'to_status':       entry.to_status,
        'changed_by_role': entry.changed_by_role,
        'note':            entry.note,
        'changed_at':      entry.changed_at.isoformat() if entry.changed_at else None,
    }


def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def current_student():
    return Student.query.get(int(get_jwt_identity()))


# ── Serializers ────────────────────────────────────────────────────────────────

def serialize_student(s):
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


def serialize_drive(d):
    return {
        'id': d.id,
        'company_id': d.company_id,
        'company_name': d.company.company_name if d.company else None,
        'job_title': d.job_title,
        'job_description': d.job_description,
        'eligibility_criteria': d.eligibility_criteria,
        'required_skills': d.required_skills,
        'salary_range': d.salary_range,
        'location': d.location,
        'application_deadline': (
            d.application_deadline.isoformat() if d.application_deadline else None
        ),
        'status': d.status,
        'created_at': d.created_at.isoformat() if d.created_at else None,
    }


def serialize_application(a):
    return {
        'id': a.id,
        'drive_id': a.drive_id,
        'job_title': a.drive.job_title if a.drive else None,
        'company_name': (
            a.drive.company.company_name if a.drive and a.drive.company else None
        ),
        'location': a.drive.location if a.drive else None,
        'salary_range': a.drive.salary_range if a.drive else None,
        'applied_at': a.applied_at.isoformat() if a.applied_at else None,
        'status': a.status,
        'offer_status': a.offer_status,
        'cover_letter': a.cover_letter,
        'student_notes': a.student_notes,
    }


def serialize_notification(n):
    return {
        'id': n.id,
        'message': n.message,
        'is_read': n.is_read,
        'created_at': n.created_at.isoformat() if n.created_at else None,
    }


def serialize_interview(i):
    """Student-facing interview serializer: shows job/company, not the student's own name."""
    a = i.application
    return {
        'id': i.id,
        'application_id': i.application_id,
        'job_title': a.drive.job_title if a and a.drive else None,
        'company_name': (
            a.drive.company.company_name if a and a.drive and a.drive.company else None
        ),
        'scheduled_at': i.scheduled_at.isoformat() if i.scheduled_at else None,
        'mode': i.mode,
        'location_or_link': i.location_or_link,
        'notes': i.notes,
        'status': i.status,
    }


def serialize_placement(p):
    company = Company.query.get(p.company_id)
    drive = PlacementDrive.query.get(p.drive_id)
    return {
        'id': p.id,
        'position': p.position,
        'salary': p.salary,
        'joining_date': p.joining_date.isoformat() if p.joining_date else None,
        'offer_letter_path': p.offer_letter_path,
        'placed_at': p.placed_at.isoformat() if p.placed_at else None,
        'company_name': company.company_name if company else None,
        'job_title': drive.job_title if drive else None,
    }


# ── Dashboard ──────────────────────────────────────────────────────────────────

@student_bp.route('/dashboard')
@student_required
def dashboard():
    student = current_student()
    applied_drive_ids = [a.drive_id for a in student.applications]

    available_count = PlacementDrive.query.filter_by(
        status=DriveStatus.APPROVED
    ).filter(
        ~PlacementDrive.id.in_(applied_drive_ids)
    ).count()

    available_drives = PlacementDrive.query.filter_by(
        status=DriveStatus.APPROVED
    ).filter(
        ~PlacementDrive.id.in_(applied_drive_ids)
    ).order_by(PlacementDrive.created_at.desc()).limit(5).all()

    all_apps = Application.query.filter_by(student_id=student.id).all()
    recent_apps = sorted(all_apps, key=lambda a: a.applied_at or '', reverse=True)[:5]

    recent_notifs = Notification.query.filter_by(
        user_type='student',
        user_id=student.id,
        is_read=False
    ).order_by(Notification.created_at.desc()).limit(5).all()

    return jsonify({
        'student': serialize_student(student),
        'stats': {
            'available_drives': available_count,
            'applied': len(all_apps),
            'shortlisted': sum(
                1 for a in all_apps if a.status == ApplicationStatus.SHORTLISTED
            ),
            'selected': sum(
                1 for a in all_apps if a.status == ApplicationStatus.SELECTED
            ),
        },
        'available_drives': [serialize_drive(d) for d in available_drives],
        'recent_applications': [serialize_application(a) for a in recent_apps],
        'notifications': [serialize_notification(n) for n in recent_notifs],
    }), 200


# ── Profile ────────────────────────────────────────────────────────────────────

@student_bp.route('/profile')
@student_required
def get_profile():
    return jsonify(serialize_student(current_student())), 200


@student_bp.route('/profile', methods=['PUT'])
@student_required
def update_profile():
    student = current_student()
    data = request.get_json(silent=True) or {}

    # email is intentionally not editable.
    if 'full_name' in data:
        student.full_name = (data.get('full_name') or '').strip()
    if 'phone' in data:
        student.phone = (data.get('phone') or '').strip()
    if 'skills' in data:
        student.skills = (data.get('skills') or '').strip()
    if 'education' in data:
        student.education = (data.get('education') or '').strip()
    if 'cgpa' in data:
        raw = data.get('cgpa')
        if raw is None or raw == '':
            student.cgpa = None
        else:
            try:
                cgpa = float(raw)
                if not (0 <= cgpa <= 10):
                    raise ValueError
                student.cgpa = cgpa
            except (ValueError, TypeError):
                return jsonify({'msg': 'CGPA must be a number between 0 and 10.'}), 400

    db.session.commit()
    payload = serialize_student(student)
    payload['msg'] = 'Profile updated.'
    return jsonify(payload), 200


@student_bp.route('/profile/resume', methods=['POST'])
@student_required
def upload_resume():
    student = current_student()
    file = request.files.get('resume')
    if not file or not file.filename:
        return jsonify({'msg': 'No file provided.'}), 400
    if not _allowed_file(file.filename):
        return jsonify({'msg': 'Only PDF, DOC, DOCX files are allowed.'}), 400

    filename = secure_filename(f"student_{student.id}_{file.filename}")
    upload_folder = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_folder, exist_ok=True)
    file.save(os.path.join(upload_folder, filename))
    student.resume_path = filename
    db.session.commit()

    payload = serialize_student(student)
    payload['msg'] = 'Resume uploaded successfully.'
    return jsonify(payload), 200


@student_bp.route('/resume')
@student_required
def download_resume():
    student = current_student()
    if not student.resume_path:
        return jsonify({'msg': 'No resume uploaded yet.'}), 404
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(student.resume_path),
        as_attachment=False
    )


# ── Drives ─────────────────────────────────────────────────────────────────────

@student_bp.route('/drives')
@student_required
def list_drives():
    student_id = int(get_jwt_identity())
    q = (request.args.get('q') or '').strip()

    # Per-student applied drive IDs (Cached in Redis to avoid DB hits on cache hits)
    user_cache_key = f'student_applied_ids_{student_id}'
    applied_drive_ids = safe_get(user_cache_key)
    if applied_drive_ids is None:
        applied_drive_ids = [
            r[0] for r in db.session.query(Application.drive_id).filter_by(student_id=student_id).all()
        ]
        safe_set(user_cache_key, applied_drive_ids, timeout=300)

    if not q:
        # Only the unfiltered "all approved drives" view is cacheable — it's
        # identical for every student and is the single most-hit request
        # pattern (every student landing on Browse Drives with no query yet
        # typed). Cached manually (not via @cache.cached on the whole view)
        # because the view's response also bundles the per-student
        # applied_drive_ids above, which must stay fresh on every request.
        cache_key = student_drives_key('')
        serialized = safe_get(cache_key)
        if serialized is None:
            drives = PlacementDrive.query.filter_by(
                status=DriveStatus.APPROVED
            ).order_by(PlacementDrive.created_at.desc()).all()
            serialized = [serialize_drive(d) for d in drives]
            safe_set(cache_key, serialized, timeout=300)
    else:
        # Search queries are cheap one-off `ilike` lookups and are never
        # cached — caching every distinct search term a student could type
        # isn't worth the memory, and this keeps the cache surface small.
        like = f'%{q}%'
        query = PlacementDrive.query.filter_by(status=DriveStatus.APPROVED).join(Company).filter(
            db.or_(
                PlacementDrive.job_title.ilike(like),
                PlacementDrive.required_skills.ilike(like),
                PlacementDrive.location.ilike(like),
                Company.company_name.ilike(like),
            )
        )
        drives = query.order_by(PlacementDrive.created_at.desc()).all()
        serialized = [serialize_drive(d) for d in drives]

    return jsonify({
        'drives': serialized,
        'applied_drive_ids': applied_drive_ids,
    }), 200


@student_bp.route('/drives/<int:drive_id>')
@student_required
def get_drive(drive_id):
    student = current_student()
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.status != DriveStatus.APPROVED:
        return jsonify({'msg': 'This drive is not available.'}), 404

    existing = Application.query.filter_by(
        student_id=student.id,
        drive_id=drive_id
    ).first()

    payload = serialize_drive(drive)
    payload['already_applied'] = serialize_application(existing) if existing else None
    return jsonify(payload), 200


# ── Applications ───────────────────────────────────────────────────────────────

@student_bp.route('/applications', methods=['POST'])
@student_required
def apply():
    student = current_student()
    data = request.get_json(silent=True) or {}
    drive_id = data.get('drive_id')
    if not drive_id:
        return jsonify({'msg': 'drive_id is required.'}), 400

    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'msg': 'Drive not found.'}), 404
    if drive.status != DriveStatus.APPROVED:
        return jsonify({'msg': 'This drive is not open for applications.'}), 400

    application = Application(
        student_id=student.id,
        drive_id=drive_id,
        cover_letter=(data.get('cover_letter') or '').strip(),
        status=ApplicationStatus.APPLIED,
    )
    db.session.add(application)
    try:
        db.session.flush()  # populate application.id before writing the log row
        _log_status(application.id, None, ApplicationStatus.APPLIED, 'student', student.id)
        db.session.commit()
        safe_delete(f'student_applied_ids_{student.id}')
    except IntegrityError:
        db.session.rollback()
        return jsonify({'msg': 'You have already applied for this drive.'}), 409

    payload = serialize_application(application)
    payload['msg'] = f'Successfully applied for {drive.job_title}!'
    return jsonify(payload), 201


@student_bp.route('/applications')
@student_required
def list_applications():
    student = current_student()
    apps = Application.query.filter_by(
        student_id=student.id
    ).order_by(Application.applied_at.desc()).all()

    counts = {s: 0 for s in ApplicationStatus.ALL}
    for a in apps:
        if a.status in counts:
            counts[a.status] += 1

    return jsonify({
        'applications': [serialize_application(a) for a in apps],
        'status_counts': counts,
        'total': len(apps),
    }), 200


@student_bp.route('/applications/export', methods=['POST'])
@student_required
def trigger_export():
    """Kicks off a background CSV export of this student's application
    history (Milestone 7). Fire-and-forget: returns 202 with a task_id the
    frontend can poll via GET /applications/export/status/<task_id>."""
    student = current_student()
    from tasks import export_applications_csv
    try:
        result = export_applications_csv.delay(student.id)
    except Exception:
        # Redis/Celery broker unreachable — degrade gracefully instead of a 500.
        return jsonify({'msg': 'Export service is currently unavailable. Try again later.'}), 503

    return jsonify({
        'msg': 'Export started. You will receive a notification when your CSV is ready.',
        'task_id': result.id,
    }), 202


@student_bp.route('/applications/export/status/<task_id>')
@student_required
def export_status(task_id):
    """Poll the status of a previously-triggered export task. task_id is an
    opaque, unguessable UUID from Celery, so no per-student ownership check
    is needed here beyond requiring a valid student JWT to reach the route."""
    from tasks import export_applications_csv
    result = AsyncResult(task_id, app=export_applications_csv.app)
    return jsonify({
        'task_id': task_id,
        'status': result.status,  # PENDING / STARTED / SUCCESS / FAILURE
        'result': result.result if result.ready() and not result.failed() else None,
    }), 200


@student_bp.route('/applications/<int:app_id>')
@student_required
def get_application(app_id):
    student = current_student()
    app = Application.query.get_or_404(app_id)
    if app.student_id != student.id:
        return jsonify({'msg': 'Not found.'}), 404
    return jsonify(serialize_application(app)), 200


@student_bp.route('/applications/<int:app_id>/history')
@student_required
def application_history(app_id):
    student = current_student()
    app = Application.query.get_or_404(app_id)
    if app.student_id != student.id:
        return jsonify({'msg': 'Not found.'}), 404
    return jsonify([_serialize_log(e) for e in app.status_log]), 200


@student_bp.route('/applications/<int:app_id>/note', methods=['PUT'])
@student_required
def save_note(app_id):
    student = current_student()
    app = Application.query.get_or_404(app_id)
    if app.student_id != student.id:
        return jsonify({'msg': 'Not found.'}), 404

    data = request.get_json(silent=True) or {}
    app.student_notes = (data.get('student_notes') or '').strip()
    db.session.commit()

    payload = serialize_application(app)
    payload['msg'] = 'Note saved.'
    return jsonify(payload), 200


@student_bp.route('/applications/<int:app_id>/offer', methods=['PUT'])
@student_required
def respond_offer(app_id):
    student = current_student()
    app = Application.query.get_or_404(app_id)
    if app.student_id != student.id:
        return jsonify({'msg': 'Not found.'}), 404
    if app.status != ApplicationStatus.SELECTED:
        return jsonify({'msg': 'Only Selected applications can respond to offers.'}), 400

    data = request.get_json(silent=True) or {}
    action = data.get('action')
    if action == 'accept':
        app.offer_status = OfferStatus.ACCEPTED
        msg = 'Congratulations! You have accepted the offer.'
    elif action == 'reject':
        app.offer_status = OfferStatus.DECLINED
        msg = 'You have declined the offer.'
    else:
        return jsonify({'msg': 'action must be "accept" or "reject".'}), 400

    db.session.commit()
    payload = serialize_application(app)
    payload['msg'] = msg
    return jsonify(payload), 200


# ── Notifications ──────────────────────────────────────────────────────────────

@student_bp.route('/notifications')
@student_required
def list_notifications():
    student = current_student()
    notifs = Notification.query.filter_by(
        user_type='student',
        user_id=student.id
    ).order_by(Notification.created_at.desc()).all()

    # Mark-as-read side effect preserved from MAD1 behaviour.
    for n in notifs:
        n.is_read = True
    db.session.commit()

    return jsonify([serialize_notification(n) for n in notifs]), 200


# ── Interviews ─────────────────────────────────────────────────────────────────

@student_bp.route('/interviews')
@student_required
def list_interviews():
    student = current_student()
    interviews = (
        Interview.query
        .join(Application)
        .filter(Application.student_id == student.id)
        .order_by(Interview.scheduled_at)
        .all()
    )
    return jsonify([serialize_interview(i) for i in interviews]), 200


# ── Placements ─────────────────────────────────────────────────────────────────

@student_bp.route('/placements')
@student_required
def list_placements():
    student = current_student()
    placements = (
        Placement.query
        .filter_by(student_id=student.id)
        .order_by(Placement.placed_at.desc())
        .all()
    )
    return jsonify([serialize_placement(p) for p in placements]), 200


@student_bp.route('/placements/<int:placement_id>/offer-letter')
@student_required
def download_offer_letter(placement_id):
    student = current_student()
    placement = Placement.query.get_or_404(placement_id)
    if placement.student_id != student.id:
        return jsonify({'msg': 'Not found.'}), 404
    if not placement.offer_letter_path:
        return jsonify({'msg': 'Offer letter not available yet.'}), 404
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(placement.offer_letter_path),
        as_attachment=True
    )