from flask import Blueprint, render_template, redirect, url_for, flash, request, send_from_directory, current_app
from flask_jwt_extended import get_jwt_identity
from routes.decorators import company_required
from models import db, Company, PlacementDrive, Application, Student, Notification
from constants import ApplicationStatus, DriveStatus, ApprovalStatus
import os

company_bp = Blueprint('company', __name__, url_prefix='/company')


@company_bp.route('/dashboard')
@company_required
def dashboard():
    current_user  = Company.query.get(int(get_jwt_identity()))
    status_filter = request.args.get('status', '').strip()
    all_drives    = PlacementDrive.query.filter_by(
        company_id=current_user.id
    ).order_by(PlacementDrive.created_at.desc()).all()

    if status_filter:
        table_drives = [d for d in all_drives if d.status == status_filter]
    else:
        table_drives = all_drives

    return render_template('company/dashboard.html',
                           company=current_user,
                           all_drives=all_drives,
                           table_drives=table_drives,
                           status_filter=status_filter)


@company_bp.route('/drive/create', methods=['GET', 'POST'])
@company_required
def create_drive():
    current_user = Company.query.get(int(get_jwt_identity()))
    if current_user.approval_status != ApprovalStatus.APPROVED:
        flash('Your account must be approved by admin before posting drives.', 'danger')
        return redirect(url_for('company.dashboard'))

    if request.method == 'POST':
        job_title    = request.form.get('job_title', '').strip()
        job_desc     = request.form.get('job_description', '').strip()
        eligibility  = request.form.get('eligibility_criteria', '').strip()
        skills       = request.form.get('required_skills', '').strip()
        salary       = request.form.get('salary_range', '').strip()
        deadline_str = request.form.get('application_deadline', '')
        location     = request.form.get('location', '').strip()

        if not job_title or not job_desc or not deadline_str:
            flash('Job title, description and deadline are required.', 'danger')
            return render_template('company/create_drive.html')

        from datetime import date
        try:
            deadline = date.fromisoformat(deadline_str)
            if deadline <= date.today():
                flash('Deadline must be a future date.', 'danger')
                return render_template('company/create_drive.html')
        except ValueError:
            flash('Invalid date format.', 'danger')
            return render_template('company/create_drive.html')

        drive = PlacementDrive(
            company_id           = current_user.id,
            job_title            = job_title,
            job_description      = job_desc,
            eligibility_criteria = eligibility,
            required_skills      = skills,
            salary_range         = salary,
            application_deadline = deadline,
            location             = location,
            status               = DriveStatus.PENDING
        )
        db.session.add(drive)
        db.session.commit()
        flash('Drive posted! Waiting for admin approval.', 'success')
        return redirect(url_for('company.dashboard'))
    return render_template('company/create_drive.html')


@company_bp.route('/drive/<int:drive_id>/edit', methods=['GET', 'POST'])
@company_required
def edit_drive(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))

    if request.method == 'POST':
        drive.job_title            = request.form.get('job_title', '').strip()
        drive.job_description      = request.form.get('job_description', '').strip()
        drive.eligibility_criteria = request.form.get('eligibility_criteria', '').strip()
        drive.required_skills      = request.form.get('required_skills', '').strip()
        drive.salary_range         = request.form.get('salary_range', '').strip()
        drive.location             = request.form.get('location', '').strip()

        from datetime import date
        deadline_str = request.form.get('application_deadline', '')
        try:
            drive.application_deadline = date.fromisoformat(deadline_str)
        except ValueError:
            flash('Invalid date.', 'danger')
            return render_template('company/edit_drive.html', drive=drive)

        db.session.commit()
        flash('Drive updated.', 'success')
        return redirect(url_for('company.dashboard'))
    return render_template('company/edit_drive.html', drive=drive)


@company_bp.route('/drive/<int:drive_id>/close', methods=['POST'])
@company_required
def close_drive(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))
    drive.status = DriveStatus.CLOSED
    db.session.commit()
    flash('Drive closed.', 'warning')
    return redirect(url_for('company.dashboard'))


@company_bp.route('/drive/<int:drive_id>/reopen', methods=['POST'])
@company_required
def reopen_drive(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))

    if drive.status == DriveStatus.CLOSED:
        drive.status = DriveStatus.APPROVED
        db.session.commit()
        flash('Drive re-opened successfully.', 'success')
    else:
        flash('Only closed drives can be re-opened.', 'warning')
    return redirect(url_for('company.dashboard'))


@company_bp.route('/drive/<int:drive_id>/delete', methods=['POST'])
@company_required
def delete_drive(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))
    db.session.delete(drive)
    db.session.commit()
    flash('Drive deleted.', 'danger')
    return redirect(url_for('company.dashboard'))


@company_bp.route('/drive/<int:drive_id>/applications')
@company_required
def drive_applications(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))

    sort  = request.args.get('sort', 'date')
    tab   = request.args.get('tab', 'all')
    query = Application.query.filter_by(drive_id=drive_id).join(Student)

    if tab != 'all':
        query = query.filter(Application.status == tab)
    if sort == 'cgpa_desc':
        query = query.order_by(Student.cgpa.desc().nullslast())
    elif sort == 'cgpa_asc':
        query = query.order_by(Student.cgpa.asc().nullslast())
    else:
        query = query.order_by(Application.applied_at.desc())

    apps     = query.all()
    all_apps = Application.query.filter_by(drive_id=drive_id).all()
    counts   = {
        'all':                             len(all_apps),
        ApplicationStatus.APPLIED:         sum(1 for a in all_apps if a.status == ApplicationStatus.APPLIED),
        ApplicationStatus.SHORTLISTED:     sum(1 for a in all_apps if a.status == ApplicationStatus.SHORTLISTED),
        ApplicationStatus.INTERVIEW_SCHEDULED: sum(1 for a in all_apps if a.status == ApplicationStatus.INTERVIEW_SCHEDULED),
        ApplicationStatus.SELECTED:        sum(1 for a in all_apps if a.status == ApplicationStatus.SELECTED),
        ApplicationStatus.REJECTED:        sum(1 for a in all_apps if a.status == ApplicationStatus.REJECTED),
    }

    return render_template('company/applications.html',
                           drive=drive, apps=apps, tab=tab, sort=sort, counts=counts)


@company_bp.route('/application/<int:app_id>/status', methods=['POST'])
@company_required
def update_status(app_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    application  = Application.query.get_or_404(app_id)
    if application.drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))

    new_status = request.form.get('status')
    if new_status not in ApplicationStatus.VALID_TRANSITIONS:
        flash('Invalid status.', 'danger')
        return redirect(request.referrer or url_for('company.dashboard'))

    if application.status != new_status:
        application.status = new_status
        db.session.add(Notification(
            user_type = 'student',
            user_id   = application.student_id,
            message   = f"Status update: Your application for {application.drive.job_title} at {application.drive.company.company_name} is now '{new_status}'."
        ))

    db.session.commit()
    flash(f'Status updated to {new_status}.', 'success')
    tab  = request.form.get('tab', 'all')
    sort = request.form.get('sort', 'date')
    return redirect(url_for('company.drive_applications',
                            drive_id=application.drive_id, tab=tab, sort=sort))


@company_bp.route('/drive/<int:drive_id>/bulk-status', methods=['POST'])
@company_required
def bulk_update_status(drive_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    drive        = PlacementDrive.query.get_or_404(drive_id)
    if drive.company_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('company.dashboard'))

    app_ids    = request.form.getlist('app_ids')
    new_status = request.form.get('bulk_status')

    if not app_ids:
        flash('No candidates selected.', 'warning')
        return redirect(request.referrer or url_for('company.drive_applications', drive_id=drive_id))
    if new_status not in ApplicationStatus.VALID_TRANSITIONS:
        flash('Invalid status selected.', 'danger')
        return redirect(request.referrer or url_for('company.drive_applications', drive_id=drive_id))

    updated = 0
    for aid in app_ids:
        app = Application.query.get(int(aid))
        if app and app.drive.company_id == current_user.id and app.status != new_status:
            app.status = new_status
            db.session.add(Notification(
                user_type = 'student',
                user_id   = app.student_id,
                message   = f"Status update: Your application for {app.drive.job_title} at {app.drive.company.company_name} is now '{new_status}'."
            ))
            updated += 1

    db.session.commit()
    flash(f'{updated} candidate(s) marked as {new_status}.', 'success')
    tab  = request.form.get('tab', 'all')
    sort = request.form.get('sort', 'date')
    return redirect(url_for('company.drive_applications', drive_id=drive_id, tab=tab, sort=sort))


@company_bp.route('/student/<int:student_id>/profile')
@company_required
def view_student_profile(student_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    student      = Student.query.get_or_404(student_id)
    Application.query.join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == current_user.id
    ).first_or_404()
    applications = Application.query.join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == current_user.id
    ).all()
    return render_template('company/student_profile.html',
                           student=student, applications=applications)


@company_bp.route('/student/<int:student_id>/resume')
@company_required
def view_resume(student_id):
    current_user = Company.query.get(int(get_jwt_identity()))
    student      = Student.query.get_or_404(student_id)
    Application.query.join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == current_user.id
    ).first_or_404()
    if not student.resume_path:
        flash('This student has not uploaded a resume.', 'warning')
        return redirect(request.referrer)
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        os.path.basename(student.resume_path),
        as_attachment=False
    )