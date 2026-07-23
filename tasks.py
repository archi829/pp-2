"""
tasks.py — Celery background tasks for the Placement Portal.

Importing this module triggers create_app() at module level, which is
intentional: celery_worker.py imports it explicitly so Celery can discover
every @celery.task-decorated function below. Because the ContextTask base
class (see extensions.make_celery) pushes a Flask app context before each
task call, every task can use db.session / SQLAlchemy models directly with
no manual `with app.app_context():` wrapper.

Do NOT import this module at the top of routes/student.py — import inside
the route function instead (see trigger_export/export_status) to avoid a
circular import between app -> routes.student -> tasks -> app.
"""
import csv
import io
import os
import smtplib
from datetime import date, datetime, timezone, timedelta
from email.mime.text import MIMEText

from app import create_app

flask_app = create_app()
celery = flask_app.celery


# ── Task 1 — daily interview reminders ──────────────────────────────────────

@celery.task(name='tasks.send_interview_reminders')
def send_interview_reminders():
    """Runs daily at 8 AM via Celery Beat. Notifies (Notification row + email)
    every student with an interview still 'Scheduled' in the next 48 hours."""
    from models import db, Interview, Notification
    from constants import InterviewStatus

    now = datetime.now(timezone.utc)
    window = now + timedelta(hours=48)

    interviews = Interview.query.filter(
        Interview.status == InterviewStatus.SCHEDULED,
        Interview.scheduled_at >= now,
        Interview.scheduled_at <= window,
    ).all()

    sent = 0
    for iv in interviews:
        app_obj = iv.application
        student = app_obj.student if app_obj else None
        drive = app_obj.drive if app_obj else None
        if not student or not drive:
            continue

        message = (
            f"Reminder: You have an interview for {drive.job_title} at "
            f"{drive.company.company_name} scheduled on "
            f"{iv.scheduled_at.strftime('%d %b %Y at %H:%M')} ({iv.mode}). "
            f"Location/Link: {iv.location_or_link or 'TBD'}."
        )
        db.session.add(Notification(
            user_type='student',
            user_id=student.id,
            message=message,
        ))
        _send_email(student.email, 'Interview Reminder', message)
        sent += 1

    db.session.commit()
    return {'reminders_sent': sent}


# ── Task 2 — monthly placement report (to admin) ────────────────────────────

@celery.task(name='tasks.send_monthly_report')
def send_monthly_report():
    """Runs on the 1st of each month at 6 AM. Emails admin a summary of the
    previous month's applications, selections, and confirmed placements."""
    from models import Application, Placement, PlacementDrive, Student
    from constants import ApplicationStatus

    today = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)

    new_apps = Application.query.filter(
        Application.applied_at >= first_prev,
        Application.applied_at < first_this,
    ).count()

    new_placements = Placement.query.filter(
        Placement.placed_at >= first_prev,
        Placement.placed_at < first_this,
    ).count()

    selected = Application.query.filter(
        Application.status == ApplicationStatus.SELECTED,
        Application.applied_at >= first_prev,
        Application.applied_at < first_this,
    ).count()

    month_label = first_prev.strftime('%B %Y')
    body = (
        f"Monthly Placement Report — {month_label}\n\n"
        f"New Applications:    {new_apps}\n"
        f"Candidates Selected: {selected}\n"
        f"Confirmed Placements: {new_placements}\n\n"
        f"Total Students: {Student.query.count()}\n"
        f"Total Drives:   {PlacementDrive.query.count()}\n"
    )

    from config import Config
    _send_email(Config.ADMIN_EMAIL, f'Monthly Report — {month_label}', body)
    return {'month': month_label, 'applications': new_apps, 'placements': new_placements}


# ── Task 3 — user-triggered CSV export of a student's application history ──

@celery.task(name='tasks.export_applications_csv')
def export_applications_csv(student_id):
    """Called by POST /api/student/applications/export. Builds a CSV of the
    student's full application history, saves it under static/exports/, and
    creates a Notification with the download link when done."""
    from models import db, Application, Student, Notification

    student = Student.query.get(student_id)
    if not student:
        return {'error': 'Student not found'}

    apps = Application.query.filter_by(student_id=student_id) \
        .order_by(Application.applied_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Application ID', 'Job Title', 'Company', 'Location',
        'Salary Range', 'Applied On', 'Status', 'Offer Status', 'Cover Letter'
    ])
    for a in apps:
        writer.writerow([
            a.id,
            a.drive.job_title if a.drive else '',
            a.drive.company.company_name if a.drive and a.drive.company else '',
            a.drive.location if a.drive else '',
            a.drive.salary_range if a.drive else '',
            a.applied_at.strftime('%Y-%m-%d %H:%M') if a.applied_at else '',
            a.status,
            a.offer_status,
            (a.cover_letter or '').replace('\n', ' '),
        ])

    export_dir = 'static/exports'
    os.makedirs(export_dir, exist_ok=True)
    filename = f'applications_student_{student_id}.csv'
    filepath = os.path.join(export_dir, filename)
    with open(filepath, 'w', newline='') as f:
        f.write(output.getvalue())

    db.session.add(Notification(
        user_type='student',
        user_id=student_id,
        message=f'Your application history CSV is ready. Download: /static/exports/{filename}',
    ))
    db.session.commit()
    return {'file': filepath, 'rows': len(apps)}


# ── Shared email helper ──────────────────────────────────────────────────────

def _send_email(to_addr, subject, body):
    """Send a plain-text email. Silently skips (logging to stdout) if
    MAIL_USERNAME is not configured — in dev, check the Notification record
    that was created alongside the call instead of looking for a real email."""
    from config import Config

    if not Config.MAIL_USERNAME:
        print(f'[EMAIL SKIPPED — no MAIL_USERNAME] To: {to_addr} | {subject}')
        return

    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = Config.MAIL_FROM
    msg['To'] = to_addr

    try:
        with smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT) as smtp:
            smtp.starttls()
            smtp.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
            smtp.send_message(msg)
    except Exception as e:
        print(f'[EMAIL ERROR] {e}')
