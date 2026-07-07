from flask import Blueprint, render_template, redirect, url_for, flash, request, send_from_directory, current_app, abort
from flask_login import login_required, current_user
from models import db, Admin, Company, Student, PlacementDrive, Application, Notification
from functools import wraps
import os
from werkzeug.utils import secure_filename

student_bp = Blueprint('student', __name__, url_prefix='/student')

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def student_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not isinstance(current_user, Student):
            flash('Access denied.', 'danger')
            return redirect(url_for('auth.login'))
        if current_user.is_blacklisted:
            flash('Your account has been blacklisted. Contact admin.', 'danger')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated

@student_bp.route('/dashboard')
@login_required
@student_required
def dashboard():
    applied_drive_ids = [a.drive_id for a in current_user.applications]

    available_drives = PlacementDrive.query.filter_by(
        status='Approved'
    ).filter(
        ~PlacementDrive.id.in_(applied_drive_ids)
    ).order_by(PlacementDrive.created_at.desc()).all()

    applications = Application.query.filter_by(
        student_id=current_user.id
    ).order_by(Application.applied_at.desc()).all()

    recent_notifs = Notification.query.filter_by(
        user_type='student', 
        user_id=current_user.id, 
        is_read=False
    ).order_by(Notification.created_at.desc()).limit(5).all()

    return render_template('student/dashboard.html',
                           student=current_user,
                           available_drives=available_drives,
                           applications=applications,
                           recent_notifs=recent_notifs)

@student_bp.route('/notifications')
@login_required
@student_required
def notifications():
    all_notifs = Notification.query.filter_by(
        user_type='student', 
        user_id=current_user.id
    ).order_by(Notification.created_at.desc()).all()
    
    # Mark them as read upon viewing the page
    for n in all_notifs:
        n.is_read = True
    db.session.commit()
    
    return render_template('student/notifications.html', notifications=all_notifs)


@student_bp.route('/drives')
@login_required
@student_required
def drives():
    q = request.args.get('q', '').strip()
    applied_drive_ids = [a.drive_id for a in current_user.applications]

    query = PlacementDrive.query.filter_by(status='Approved')
    
    if q:
        like = f'%{q}%'
        query = query.join(Company).filter(
            db.or_(
                PlacementDrive.job_title.ilike(like),
                PlacementDrive.required_skills.ilike(like),
                PlacementDrive.location.ilike(like),
                Company.company_name.ilike(like)
            )
        )
        
    drives = query.order_by(PlacementDrive.created_at.desc()).all()
    return render_template('student/drives.html',
                           drives=drives,
                           applied_drive_ids=applied_drive_ids,
                           q=q)

@student_bp.route('/drive/<int:drive_id>')
@login_required
@student_required
def drive_detail(drive_id):
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.status != 'Approved':
        flash('This drive is not available.', 'warning')
        return redirect(url_for('student.drives'))

    already_applied = Application.query.filter_by(
        student_id=current_user.id,
        drive_id=drive_id
    ).first()

    return render_template('student/drive_detail.html',
                           drive=drive,
                           already_applied=already_applied)

@student_bp.route('/drive/<int:drive_id>/apply', methods=['POST'])
@login_required
@student_required
def apply(drive_id):
    drive = PlacementDrive.query.get_or_404(drive_id)

    if drive.status != 'Approved':
        flash('This drive is not open for applications.', 'warning')
        return redirect(url_for('student.drives'))

    if current_user.is_blacklisted:
        flash('You cannot apply while blacklisted.', 'danger')
        return redirect(url_for('student.drives'))

    existing = Application.query.filter_by(
        student_id=current_user.id,
        drive_id=drive_id
    ).first()
    if existing:
        flash('You have already applied for this drive.', 'warning')
        return redirect(url_for('student.drives'))

    cover_letter = request.form.get('cover_letter', '').strip()

    application = Application(
        student_id   = current_user.id,
        drive_id     = drive_id,
        cover_letter = cover_letter,
        status       = 'Applied'
    )
    db.session.add(application)
    db.session.commit()
    flash(f'Successfully applied for {drive.job_title}!', 'success')
    return redirect(url_for('student.history'))

@student_bp.route('/history')
@login_required
@student_required
def history():
    applications = Application.query.filter_by(
        student_id=current_user.id
    ).order_by(Application.applied_at.desc()).all()

    status_counts = {
        'Applied':     sum(1 for a in applications if a.status == 'Applied'),
        'Shortlisted': sum(1 for a in applications if a.status == 'Shortlisted'),
        'Interview':   sum(1 for a in applications if a.status == 'Interview'),
        'Selected':    sum(1 for a in applications if a.status == 'Selected'),
        'Rejected':    sum(1 for a in applications if a.status == 'Rejected'),
    }

    return render_template('student/history.html',
                           applications=applications,
                           status_counts=status_counts)

@student_bp.route('/application/<int:app_id>/note', methods=['POST'])
@login_required
@student_required
def save_note(app_id):
    app = Application.query.get_or_404(app_id)
    if app.student_id != current_user.id:
        flash('Access denied.', 'danger')
        return redirect(url_for('student.history'))
    
    app.student_notes = request.form.get('student_notes', '').strip()
    db.session.commit()
    flash('Personal note updated.', 'success')
    return redirect(url_for('student.history'))

@student_bp.route('/application/<int:app_id>/offer', methods=['POST'])
@login_required
@student_required
def respond_offer(app_id):
    app = Application.query.get_or_404(app_id)
    if app.student_id != current_user.id or app.status != 'Selected':
        flash('Invalid action.', 'danger')
        return redirect(url_for('student.dashboard'))
    
    action = request.form.get('action')
    if action == 'accept':
        app.offer_status = 'Accepted'
        flash('Congratulations! You have accepted the offer.', 'success')
    elif action == 'reject':
        app.offer_status = 'Declined'
        flash('You have declined the offer.', 'warning')
        
    db.session.commit()
    return redirect(url_for('student.dashboard'))

@student_bp.route('/profile', methods=['GET', 'POST'])
@login_required
@student_required
def profile():
    if request.method == 'POST':
        current_user.full_name = request.form.get('full_name', '').strip()
        current_user.phone     = request.form.get('phone', '').strip()
        current_user.skills    = request.form.get('skills', '').strip()
        current_user.education = request.form.get('education', '').strip()

        cgpa = request.form.get('cgpa', '')
        try:
            current_user.cgpa = float(cgpa) if cgpa else None
            if current_user.cgpa is not None and not (0 <= current_user.cgpa <= 10):
                raise ValueError
        except ValueError:
            flash('CGPA must be between 0 and 10.', 'danger')
            return render_template('student/profile.html', student=current_user)

        file = request.files.get('resume')
        if file and file.filename:
            if allowed_file(file.filename):
                filename = secure_filename(f"student_{current_user.id}_{file.filename}")
                upload_folder = current_app.config['UPLOAD_FOLDER']
                os.makedirs(upload_folder, exist_ok=True)
                file.save(os.path.join(upload_folder, filename))
                current_user.resume_path = filename
            else:
                flash('Only PDF, DOC, DOCX files allowed.', 'danger')
                return render_template('student/profile.html', student=current_user)

        db.session.commit()
        flash('Profile updated successfully.', 'success')
        return redirect(url_for('student.profile'))
    return render_template('student/profile.html', student=current_user)

@student_bp.route('/resume/download')
@login_required
@student_required
def download_own_resume():
    if not current_user.resume_path:
        flash('You have not uploaded a resume yet.', 'warning')
        return redirect(url_for('student.profile'))
    
    filename = os.path.basename(current_user.resume_path)
    
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        filename,
        as_attachment=False
    )