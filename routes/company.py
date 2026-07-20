from datetime import date, datetime
import os

from flask import Blueprint, jsonify, request, send_from_directory, current_app
from flask_jwt_extended import get_jwt_identity

from routes.decorators import company_required
from models import db, Company, PlacementDrive, Application, Student, Notification, Interview, Placement, ApplicationStatusLog
from constants import ApplicationStatus, DriveStatus, ApprovalStatus, InterviewStatus

company_bp = Blueprint('company', __name__, url_prefix='/api/company')

# Forward-only state machine for the bare status dropdown.
# 'Interview Scheduled' and 'Selected' are gated behind their own endpoints
# (POST /interviews and PUT /applications/<id>/select) because each requires a
# real record, not just a label flip.  The dropdown can only Shortlist or Reject.
FORWARD_TRANSITIONS = {
    ApplicationStatus.APPLIED:             {ApplicationStatus.SHORTLISTED, ApplicationStatus.REJECTED},
    ApplicationStatus.SHORTLISTED:         {ApplicationStatus.REJECTED},
    ApplicationStatus.INTERVIEW_SCHEDULED: {ApplicationStatus.REJECTED},
    ApplicationStatus.SELECTED:            set(),   # terminal via bare dropdown
    ApplicationStatus.REJECTED:            set(),   # terminal
    ApplicationStatus.PLACED:             set(),   # terminal
}


def _log_status(application_id, from_status, to_status, role, user_id, note=None):
    """Write one ApplicationStatusLog row. Must be called before db.session.commit()."""
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


# ── Serializers ────────────────────────────────────────────────────────────

def serialize_company(c):
    return {
        'id': c.id,
        'company_name': c.company_name,
        'email': c.email,
        'hr_contact': c.hr_contact,
        'website': c.website,
        'industry': c.industry,
        'description': c.description,
        'approval_status': c.approval_status,
        'is_blacklisted': c.is_blacklisted,
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


def serialize_drive(d):
    return {
        'id': d.id,
        'company_id': d.company_id,
        'job_title': d.job_title,
        'job_description': d.job_description,
        'eligibility_criteria': d.eligibility_criteria,
        'required_skills': d.required_skills,
        'salary_range': d.salary_range,
        'location': d.location,
        'application_deadline': d.application_deadline.isoformat() if d.application_deadline else None,
        'status': d.status,
        'applications_count': len(d.applications),
        'created_at': d.created_at.isoformat() if d.created_at else None,
    }


def serialize_student_brief(s):
    return {
        'id': s.id,
        'full_name': s.full_name,
        'email': s.email,
        'phone': s.phone,
        'cgpa': s.cgpa,
        'skills': s.skills,
        'education': s.education,
        'resume_path': s.resume_path,
    }


def serialize_application(a):
    return {
        'id': a.id,
        'drive_id': a.drive_id,
        'job_title': a.drive.job_title if a.drive else None,
        'student': serialize_student_brief(a.student) if a.student else None,
        'applied_at': a.applied_at.isoformat() if a.applied_at else None,
        'status': a.status,
        'offer_status': a.offer_status,
        'cover_letter': a.cover_letter,
    }


def serialize_interview(i):
    application = i.application
    return {
        'id': i.id,
        'application_id': i.application_id,
        'student_id': application.student_id if application else None,
        'student_name': application.student.full_name if application and application.student else None,
        'drive_id': application.drive_id if application else None,
        'job_title': application.drive.job_title if application and application.drive else None,
        'scheduled_at': i.scheduled_at.isoformat() if i.scheduled_at else None,
        'mode': i.mode,
        'location_or_link': i.location_or_link,
        'notes': i.notes,
        'status': i.status,
        'created_at': i.created_at.isoformat() if i.created_at else None,
    }


def current_company():
    return Company.query.get(int(get_jwt_identity()))


def _cancel_scheduled_interviews(application):
    """Reject means the pipeline stopped — any interview still marked 'Scheduled'
    for this application is now stale and should be auto-cancelled, otherwise it
    sits forever on the combined /interviews page looking like it's still on.
    Only touches interviews that are still Scheduled — never overwrites one a
    company already manually marked Completed."""
    for interview in application.interviews:
        if interview.status == InterviewStatus.SCHEDULED:
            interview.status = InterviewStatus.CANCELLED


# ── Dashboard / Profile ──────────────────────────────────────────────────

@company_bp.route('/dashboard')
@company_required
def dashboard():
    company = current_company()
    all_drives = PlacementDrive.query.filter_by(company_id=company.id).all()

    return jsonify({
        'company': serialize_company(company),
        'total_drives': len(all_drives),
        'active_drives': sum(1 for d in all_drives if d.status == DriveStatus.APPROVED),
        'pending_drives': sum(1 for d in all_drives if d.status == DriveStatus.PENDING),
        'total_applicants': sum(len(d.applications) for d in all_drives),
    }), 200


@company_bp.route('/profile')
@company_required
def get_profile():
    return jsonify(serialize_company(current_company())), 200


@company_bp.route('/profile', methods=['PUT'])
@company_required
def update_profile():
    company = current_company()
    data = request.get_json(silent=True) or {}

    # company_name and email are intentionally not editable here.
    if 'hr_contact' in data:
        company.hr_contact = (data.get('hr_contact') or '').strip()
    if 'industry' in data:
        company.industry = (data.get('industry') or '').strip()
    if 'website' in data:
        company.website = (data.get('website') or '').strip()
    if 'description' in data:
        company.description = (data.get('description') or '').strip()

    db.session.commit()
    payload = serialize_company(company)
    payload['msg'] = 'Profile updated.'
    return jsonify(payload), 200


# ── Drives ───────────────────────────────────────────────────────────────

@company_bp.route('/drives', methods=['POST'])
@company_required
def create_drive():
    company = current_company()
    if company.approval_status != ApprovalStatus.APPROVED:
        return jsonify({'msg': 'Your account must be approved by admin before posting drives.'}), 403

    data = request.get_json(silent=True) or {}
    job_title = (data.get('job_title') or '').strip()
    job_desc = (data.get('job_description') or '').strip()
    deadline_str = data.get('application_deadline', '')

    if not job_title or not job_desc or not deadline_str:
        return jsonify({'msg': 'job_title, job_description and application_deadline are required.'}), 400

    try:
        deadline = date.fromisoformat(deadline_str)
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid date format for application_deadline.'}), 400

    if deadline <= date.today():
        return jsonify({'msg': 'Deadline must be a future date.'}), 400

    drive = PlacementDrive(
        company_id=company.id,
        job_title=job_title,
        job_description=job_desc,
        eligibility_criteria=(data.get('eligibility_criteria') or '').strip(),
        required_skills=(data.get('required_skills') or '').strip(),
        salary_range=(data.get('salary_range') or '').strip(),
        application_deadline=deadline,
        location=(data.get('location') or '').strip(),
        status=DriveStatus.PENDING,
    )
    db.session.add(drive)
    db.session.commit()

    payload = serialize_drive(drive)
    payload['msg'] = 'Drive posted. Waiting for admin approval.'
    return jsonify(payload), 201


@company_bp.route('/drives')
@company_required
def list_drives():
    company = current_company()
    status = request.args.get('status', '').strip()

    query = PlacementDrive.query.filter_by(company_id=company.id)
    if status:
        query = query.filter_by(status=status)

    drives_list = query.order_by(PlacementDrive.created_at.desc()).all()
    return jsonify([serialize_drive(d) for d in drives_list]), 200


@company_bp.route('/drives/<int:drive_id>')
@company_required
def get_drive(drive_id):
    company = current_company()
    drive = PlacementDrive.query.get(drive_id)
    if not drive or drive.company_id != company.id:
        return jsonify({'msg': 'Drive not found.'}), 404
    return jsonify(serialize_drive(drive)), 200


@company_bp.route('/drives/<int:drive_id>', methods=['PUT'])
@company_required
def edit_drive(drive_id):
    company = current_company()
    drive = PlacementDrive.query.get(drive_id)
    if not drive or drive.company_id != company.id:
        return jsonify({'msg': 'Drive not found.'}), 404

    data = request.get_json(silent=True) or {}
    job_title = data.get('job_title', drive.job_title) or ''
    job_desc = data.get('job_description', drive.job_description) or ''

    if not job_title.strip() or not job_desc.strip():
        return jsonify({'msg': 'job_title and job_description are required.'}), 400

    drive.job_title = job_title.strip()
    drive.job_description = job_desc.strip()
    drive.eligibility_criteria = (data.get('eligibility_criteria', drive.eligibility_criteria) or '').strip()
    drive.required_skills = (data.get('required_skills', drive.required_skills) or '').strip()
    drive.salary_range = (data.get('salary_range', drive.salary_range) or '').strip()
    drive.location = (data.get('location', drive.location) or '').strip()

    if 'application_deadline' in data:
        try:
            drive.application_deadline = date.fromisoformat(data['application_deadline'])
        except (ValueError, TypeError):
            return jsonify({'msg': 'Invalid date format for application_deadline.'}), 400

    db.session.commit()
    payload = serialize_drive(drive)
    payload['msg'] = 'Drive updated.'
    return jsonify(payload), 200


@company_bp.route('/drives/<int:drive_id>/status', methods=['PUT'])
@company_required
def update_drive_status(drive_id):
    company = current_company()
    drive = PlacementDrive.query.get(drive_id)
    if not drive or drive.company_id != company.id:
        return jsonify({'msg': 'Drive not found.'}), 404

    data = request.get_json(silent=True) or {}
    action = data.get('action')

    if action == 'close':
        if drive.status != DriveStatus.APPROVED:
            return jsonify({'msg': 'Only approved drives can be closed.'}), 400
        drive.status = DriveStatus.CLOSED
    elif action == 'reopen':
        if drive.status != DriveStatus.CLOSED:
            return jsonify({'msg': 'Only closed drives can be re-opened.'}), 400
        drive.status = DriveStatus.APPROVED
    else:
        return jsonify({'msg': "action must be 'close' or 'reopen'."}), 400

    db.session.commit()
    return jsonify({'msg': f'Drive "{drive.job_title}" {"closed" if action == "close" else "re-opened"}.',
                     'id': drive.id, 'new_status': drive.status}), 200


@company_bp.route('/drives/<int:drive_id>', methods=['DELETE'])
@company_required
def delete_drive(drive_id):
    company = current_company()
    drive = PlacementDrive.query.get(drive_id)
    if not drive or drive.company_id != company.id:
        return jsonify({'msg': 'Drive not found.'}), 404

    db.session.delete(drive)
    db.session.commit()
    return jsonify({'msg': 'Drive deleted.', 'id': drive_id}), 200


# ── Applications ─────────────────────────────────────────────────────────

@company_bp.route('/drives/<int:drive_id>/applications')
@company_required
def drive_applications(drive_id):
    company = current_company()
    drive = PlacementDrive.query.get(drive_id)
    if not drive or drive.company_id != company.id:
        return jsonify({'msg': 'Drive not found.'}), 404

    sort = request.args.get('sort', 'date')
    tab = request.args.get('tab', 'all')

    query = Application.query.filter_by(drive_id=drive_id).join(Student)
    if tab != 'all':
        query = query.filter(Application.status == tab)

    if sort == 'cgpa_desc':
        query = query.order_by(Student.cgpa.desc().nullslast())
    elif sort == 'cgpa_asc':
        query = query.order_by(Student.cgpa.asc().nullslast())
    else:
        query = query.order_by(Application.applied_at.desc())

    apps = query.all()
    all_apps = Application.query.filter_by(drive_id=drive_id).all()

    counts = {'all': len(all_apps)}
    for status in ApplicationStatus.ALL:
        counts[status] = sum(1 for a in all_apps if a.status == status)

    return jsonify({
        'drive': serialize_drive(drive),
        'tab': tab,
        'sort': sort,
        'counts': counts,
        'applications': [serialize_application(a) for a in apps],
    }), 200


@company_bp.route('/applications/<int:app_id>/status', methods=['PUT'])
@company_required
def update_status(app_id):
    company = current_company()
    application = Application.query.get(app_id)
    if not application or application.drive.company_id != company.id:
        return jsonify({'msg': 'Application not found.'}), 404

    data = request.get_json(silent=True) or {}
    new_status = data.get('status')
    note = (data.get('note') or '').strip() or None

    # Same status — nothing to do.
    if application.status == new_status:
        payload = serialize_application(application)
        payload['msg'] = 'Status unchanged (already set to this value).'
        return jsonify(payload), 200

    allowed = FORWARD_TRANSITIONS.get(application.status, set())
    if new_status not in allowed:
        if not allowed:
            return jsonify({
                'msg': f"'{application.status}' is a terminal status — it cannot be changed via this endpoint."
            }), 400
        return jsonify({
            'msg': (f"Cannot move from '{application.status}' to '{new_status}'. "
                    f"Allowed transitions: {sorted(allowed)}.")
        }), 400

    if application.status != new_status:
        old_status = application.status
        application.status = new_status
        if new_status == ApplicationStatus.REJECTED:
            _cancel_scheduled_interviews(application)
        _log_status(application.id, old_status, new_status, 'company', company.id, note)
        db.session.add(Notification(
            user_type='student',
            user_id=application.student_id,
            message=(f"Status update: Your application for {application.drive.job_title} "
                     f"at {application.drive.company.company_name} is now '{new_status}'."),
        ))

    db.session.commit()
    payload = serialize_application(application)
    payload['msg'] = f'Status updated to {new_status}.'
    return jsonify(payload), 200


@company_bp.route('/applications/bulk-status', methods=['POST'])
@company_required
def bulk_update_status():
    company = current_company()
    data = request.get_json(silent=True) or {}
    app_ids = data.get('app_ids', [])
    new_status = data.get('status')

    if not app_ids:
        return jsonify({'msg': 'No candidates selected.'}), 400
    # Validate the target status is a known forward-reachable value
    all_reachable = set().union(*FORWARD_TRANSITIONS.values())
    if new_status not in all_reachable:
        return jsonify({'msg': (
            "Invalid status. Use POST /interviews for 'Interview Scheduled' "
            "or PUT /applications/<id>/select for 'Selected'."
        )}), 400

    updated_ids = []
    skipped_ids = []   # applications where the transition is not allowed from their current state
    note = (data.get('note') or '').strip() or None

    for aid in app_ids:
        app = Application.query.get(int(aid))
        if not app or app.drive.company_id != company.id:
            continue
        allowed = FORWARD_TRANSITIONS.get(app.status, set())
        if new_status not in allowed:
            skipped_ids.append(int(aid))
            continue
        if app.status != new_status:
            old_status = app.status
            app.status = new_status
            if new_status == ApplicationStatus.REJECTED:
                _cancel_scheduled_interviews(app)
            _log_status(app.id, old_status, new_status, 'company', company.id, note)
            db.session.add(Notification(
                user_type='student',
                user_id=app.student_id,
                message=(f"Status update: Your application for {app.drive.job_title} "
                         f"at {app.drive.company.company_name} is now '{new_status}'."),
            ))
            updated_ids.append(app.id)

    db.session.commit()
    msg = f'{len(updated_ids)} candidate(s) marked as {new_status}.'
    if skipped_ids:
        msg += f' {len(skipped_ids)} skipped (transition not permitted from their current status).'
    return jsonify({'msg': msg, 'updated_ids': updated_ids,
                    'skipped_ids': skipped_ids, 'new_status': new_status}), 200


@company_bp.route('/applications/<int:app_id>/select', methods=['PUT'])
@company_required
def select_application(app_id):
    company = current_company()
    application = Application.query.get(app_id)
    if not application or application.drive.company_id != company.id:
        return jsonify({'msg': 'Application not found.'}), 404

    data = request.get_json(silent=True) or {}
    position = (data.get('position') or '').strip()
    salary = (data.get('salary') or '').strip()
    joining_date_str = data.get('joining_date')

    joining_date = None
    if joining_date_str:
        try:
            joining_date = date.fromisoformat(joining_date_str)
        except ValueError:
            return jsonify({'msg': 'Invalid date format for joining_date.'}), 400

    status_changed = application.status != ApplicationStatus.SELECTED
    old_status = application.status
    application.status = ApplicationStatus.SELECTED
    if status_changed:
        _log_status(application.id, old_status, ApplicationStatus.SELECTED, 'company', company.id)

    placement = Placement.query.filter_by(
        student_id=application.student_id,
        drive_id=application.drive_id,
    ).first()

    if not placement:
        placement = Placement(
            student_id=application.student_id,
            company_id=company.id,
            drive_id=application.drive_id,
            position=position,
            salary=salary,
            joining_date=joining_date,
        )
        db.session.add(placement)
        db.session.flush()  # populate placement.id before commit

    if status_changed:
        db.session.add(Notification(
            user_type='student',
            user_id=application.student_id,
            message=(f"Congratulations! You have been selected for {application.drive.job_title} "
                     f"at {application.drive.company.company_name}. Please check your offer."),
        ))

    db.session.commit()

    payload = serialize_application(application)
    payload['msg'] = 'Candidate marked as Selected.'
    payload['placement_id'] = placement.id
    return jsonify(payload), 200


# ── Interviews ───────────────────────────────────────────────────────────

@company_bp.route('/interviews', methods=['POST'])
@company_required
def create_interview():
    company = current_company()
    data = request.get_json(silent=True) or {}

    application_id = data.get('application_id')
    scheduled_at_str = data.get('scheduled_at')
    if not application_id or not scheduled_at_str:
        return jsonify({'msg': 'application_id and scheduled_at are required.'}), 400

    application = Application.query.get(application_id)
    if not application or application.drive.company_id != company.id:
        return jsonify({'msg': 'Application not found.'}), 404

    try:
        scheduled_at = datetime.fromisoformat(scheduled_at_str)
    except ValueError:
        return jsonify({'msg': 'Invalid ISO datetime for scheduled_at.'}), 400

    interview = Interview(
        application_id=application.id,
        scheduled_at=scheduled_at,
        mode=(data.get('mode') or '').strip(),
        location_or_link=(data.get('location_or_link') or '').strip(),
        notes=(data.get('notes') or '').strip(),
        status=InterviewStatus.SCHEDULED,
    )
    db.session.add(interview)

    # Scheduling an interview implicitly moves the candidate into the
    # 'Interview Scheduled' pipeline stage — unless they're already past that
    # point (Selected/Rejected/Placed), in which case leave status alone.
    # Without this, the drive-specific applicant tabs (which count by
    # Application.status) never reflect interviews booked from this endpoint,
    # even though the combined /interviews page (which reads the Interview
    # table directly) correctly shows them.
    if application.status not in (ApplicationStatus.SELECTED, ApplicationStatus.REJECTED, ApplicationStatus.PLACED):
        old_status = application.status
        application.status = ApplicationStatus.INTERVIEW_SCHEDULED
        _log_status(application.id, old_status, ApplicationStatus.INTERVIEW_SCHEDULED, 'company', company.id)

    db.session.add(Notification(
        user_type='student',
        user_id=application.student_id,
        message=(f"Interview scheduled for {application.drive.job_title} "
                 f"at {application.drive.company.company_name}."),
    ))
    db.session.commit()

    payload = serialize_interview(interview)
    payload['msg'] = 'Interview scheduled.'
    payload['application_status'] = application.status
    return jsonify(payload), 201


@company_bp.route('/interviews')
@company_required
def list_interviews():
    company = current_company()
    interviews = (
        Interview.query
        .join(Application, Interview.application_id == Application.id)
        .join(PlacementDrive, Application.drive_id == PlacementDrive.id)
        .filter(PlacementDrive.company_id == company.id)
        .order_by(Interview.scheduled_at.asc())
        .all()
    )
    return jsonify([serialize_interview(i) for i in interviews]), 200


@company_bp.route('/interviews/<int:interview_id>', methods=['PUT'])
@company_required
def update_interview(interview_id):
    company = current_company()
    interview = Interview.query.get(interview_id)
    if not interview or interview.application.drive.company_id != company.id:
        return jsonify({'msg': 'Interview not found.'}), 404

    data = request.get_json(silent=True) or {}

    if 'scheduled_at' in data:
        try:
            interview.scheduled_at = datetime.fromisoformat(data['scheduled_at'])
        except ValueError:
            return jsonify({'msg': 'Invalid ISO datetime for scheduled_at.'}), 400
    if 'mode' in data:
        interview.mode = (data.get('mode') or '').strip()
    if 'location_or_link' in data:
        interview.location_or_link = (data.get('location_or_link') or '').strip()
    if 'notes' in data:
        interview.notes = (data.get('notes') or '').strip()
    if 'status' in data:
        valid_statuses = (InterviewStatus.SCHEDULED, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED)
        if data.get('status') not in valid_statuses:
            return jsonify({'msg': f'status must be one of {list(valid_statuses)}.'}), 400
        interview.status = data.get('status')

    db.session.commit()
    payload = serialize_interview(interview)
    payload['msg'] = 'Interview updated.'
    return jsonify(payload), 200


# ── Student profile / resume (scoped to this company's applicants) ────────

def _has_applied_to_company(company_id, student_id):
    return Application.query.join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == company_id,
    ).first() is not None


@company_bp.route('/student/<int:student_id>/profile')
@company_required
def view_student_profile(student_id):
    company = current_company()
    student = Student.query.get(student_id)
    if not student or not _has_applied_to_company(company.id, student_id):
        return jsonify({'msg': 'Student not found.'}), 404

    applications = Application.query.join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == company.id,
    ).order_by(Application.applied_at.desc()).all()

    payload = serialize_student_brief(student)
    payload['applications'] = [serialize_application(a) for a in applications]
    return jsonify(payload), 200


@company_bp.route('/applications/<int:app_id>/history')
@company_required
def application_history(app_id):
    company = current_company()
    application = Application.query.get_or_404(app_id)
    if application.drive.company_id != company.id:
        return jsonify({'msg': 'Application not found.'}), 404
    return jsonify([_serialize_log(e) for e in application.status_log]), 200


@company_bp.route('/student/<int:student_id>/resume')
@company_required
def view_resume(student_id):
    company = current_company()
    student = Student.query.get(student_id)
    if not student or not _has_applied_to_company(company.id, student_id):
        return jsonify({'msg': 'Student not found.'}), 404

    if not student.resume_path:
        return jsonify({'msg': 'This student has not uploaded a resume.'}), 404

    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(student.resume_path),
        as_attachment=False,
    )