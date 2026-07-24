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
from reports import build_pdf_report, render_admin_report_html, render_company_report_html

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


# ── Task 2 — monthly placement report (admin platform-wide + per-company) ──

@celery.task(name='tasks.send_monthly_report')
def send_monthly_report():
    """Runs on the 1st of each month at 6 AM.
    - Admin gets one platform-wide HTML+PDF report.
    - Every Approved, non-blacklisted company gets its own HTML+PDF report
      scoped to its own drives (stats + a per-drive breakdown table).
    Both are also saved under static/reports/ and companies additionally
    get a Notification, so the report is visible in dev even when SMTP
    isn't configured (email send is skipped, but the PDF file + in-app
    notification still exist)."""
    from models import db, Application, Company, Notification, Placement, PlacementDrive, Student
    from constants import ApplicationStatus, ApprovalStatus
    from reports import render_admin_report_html, render_company_report_html, build_pdf_report

    today = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)
    month_label = first_prev.strftime('%B %Y')

    reports_dir = 'static/reports'
    os.makedirs(reports_dir, exist_ok=True)

    def _in_month(column):
        return db.and_(column >= first_prev, column < first_this)

    # ── Admin: platform-wide ────────────────────────────────────────────
    admin_stats = {
        'new_apps': Application.query.filter(_in_month(Application.applied_at)).count(),
        'selected': Application.query.filter(
            Application.status == ApplicationStatus.SELECTED,
            _in_month(Application.applied_at),
        ).count(),
        'new_placements': Placement.query.filter(_in_month(Placement.placed_at)).count(),
        'total_students': Student.query.count(),
        'total_drives': PlacementDrive.query.count(),
        'total_companies': Company.query.count(),
    }

    admin_html = render_admin_report_html(month_label, admin_stats)
    admin_pdf = build_pdf_report(
        'Monthly Placement Report', f'{month_label} — Platform Overview',
        [
            ('New Applications', admin_stats['new_apps']),
            ('Candidates Selected', admin_stats['selected']),
            ('Confirmed Placements', admin_stats['new_placements']),
            ('Total Students', admin_stats['total_students']),
            ('Total Drives', admin_stats['total_drives']),
            ('Total Companies', admin_stats['total_companies']),
        ],
    )
    admin_pdf_name = f"admin_{first_prev.strftime('%Y_%m')}.pdf"
    with open(os.path.join(reports_dir, admin_pdf_name), 'wb') as f:
        f.write(admin_pdf)

    from config import Config
    _send_report_email(Config.ADMIN_EMAIL, f'Monthly Placement Report — {month_label}',
                        admin_html, admin_pdf, admin_pdf_name)

    # ── Each approved, non-blacklisted company: scoped to its own drives ─
    companies = Company.query.filter_by(
        approval_status=ApprovalStatus.APPROVED, is_blacklisted=False
    ).all()

    companies_reported = 0
    for company in companies:
        drives = PlacementDrive.query.filter_by(company_id=company.id).all()
        drive_ids = [d.id for d in drives]

        company_stats = {
            'active_drives': sum(1 for d in drives if d.status == 'Approved'),
            'new_apps': 0,
            'selected': 0,
            'placements': Placement.query.filter(
                Placement.company_id == company.id, _in_month(Placement.placed_at)
            ).count(),
        }

        per_drive_rows = []
        for d in drives:
            apps_this_month = Application.query.filter(
                Application.drive_id == d.id, _in_month(Application.applied_at)
            ).count()
            selected_this_month = Application.query.filter(
                Application.drive_id == d.id,
                Application.status == ApplicationStatus.SELECTED,
                _in_month(Application.applied_at),
            ).count()
            placed_this_drive = Placement.query.filter(
                Placement.drive_id == d.id, _in_month(Placement.placed_at)
            ).count()

            company_stats['new_apps'] += apps_this_month
            company_stats['selected'] += selected_this_month

            if apps_this_month or selected_this_month or placed_this_drive:
                per_drive_rows.append({
                    'job_title': d.job_title,
                    'applications': apps_this_month,
                    'selected': selected_this_month,
                    'placed': placed_this_drive,
                })

        if not drive_ids:
            continue  # nothing to report for a company with no drives at all

        html = render_company_report_html(month_label, company.company_name, company_stats, per_drive_rows)
        pdf = build_pdf_report(
            'Monthly Placement Report', f'{month_label} — {company.company_name}',
            [
                ('Active Drives', company_stats['active_drives']),
                ('New Applications', company_stats['new_apps']),
                ('Candidates Selected', company_stats['selected']),
                ('Confirmed Placements', company_stats['placements']),
            ],
            table_title='Per-Drive Breakdown' if per_drive_rows else None,
            table_headers=['Drive', 'Applications', 'Selected', 'Placed'] if per_drive_rows else None,
            table_rows=[[r['job_title'], r['applications'], r['selected'], r['placed']] for r in per_drive_rows]
            if per_drive_rows else None,
        )
        pdf_name = f"company_{company.id}_{first_prev.strftime('%Y_%m')}.pdf"
        with open(os.path.join(reports_dir, pdf_name), 'wb') as f:
            f.write(pdf)

        _send_report_email(company.email, f'Your Monthly Placement Report — {month_label}',
                            html, pdf, pdf_name)

        db.session.add(Notification(
            user_type='company',
            user_id=company.id,
            message=(f'Your placement report for {month_label} is ready. '
                     f'Download: /static/reports/{pdf_name}'),
        ))
        companies_reported += 1

    db.session.commit()
    return {
        'month': month_label,
        'admin_report': admin_pdf_name,
        'companies_reported': companies_reported,
    }


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


# ── Task 4 — user-triggered CSV export of a company's applicant/placement
#            history + analytics ─────────────────────────────────────────────

@celery.task(name='tasks.export_company_data_csv')
def export_company_data_csv(company_id):
    """Called by POST /api/company/export. Builds one CSV with three
    sections (applicants across all of this company's drives, confirmed
    placements, and an analytics summary), saves it under static/exports/,
    and creates a Notification with the download link when done."""
    from models import db, Application, Company, Notification, Placement, PlacementDrive, Student

    company = Company.query.get(company_id)
    if not company:
        return {'error': 'Company not found'}

    drives = PlacementDrive.query.filter_by(company_id=company_id).all()
    drive_ids = [d.id for d in drives]

    applications = (
        Application.query.join(PlacementDrive)
        .filter(PlacementDrive.company_id == company_id)
        .order_by(Application.applied_at.desc())
        .all()
    ) if drive_ids else []

    placements = (
        Placement.query.filter_by(company_id=company_id)
        .order_by(Placement.placed_at.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # ── Section 1: Applicants ────────────────────────────────────────────
    writer.writerow(['=== APPLICANTS ==='])
    writer.writerow([
        'Application ID', 'Student Name', 'Student Email', 'Drive', 'Location',
        'Applied On', 'Status', 'Offer Status'
    ])
    for a in applications:
        writer.writerow([
            a.id,
            a.student.full_name if a.student else '',
            a.student.email if a.student else '',
            a.drive.job_title if a.drive else '',
            a.drive.location if a.drive else '',
            a.applied_at.strftime('%Y-%m-%d %H:%M') if a.applied_at else '',
            a.status,
            a.offer_status,
        ])

    # ── Section 2: Placements ────────────────────────────────────────────
    writer.writerow([])
    writer.writerow(['=== PLACEMENTS ==='])
    writer.writerow(['Placement ID', 'Student Name', 'Position', 'Salary', 'Joining Date', 'Placed On'])
    for p in placements:
        student = Student.query.get(p.student_id)
        writer.writerow([
            p.id,
            student.full_name if student else p.student_id,
            p.position or '',
            p.salary or '',
            p.joining_date.isoformat() if p.joining_date else '',
            p.placed_at.strftime('%Y-%m-%d %H:%M') if p.placed_at else '',
        ])

    # ── Section 3: Analytics summary ─────────────────────────────────────
    status_counts = {}
    for a in applications:
        status_counts[a.status] = status_counts.get(a.status, 0) + 1

    total_apps = len(applications)
    total_selected = status_counts.get('Selected', 0)
    selection_rate = f'{(total_selected / total_apps * 100):.1f}%' if total_apps else '0%'
    placement_rate = f'{(len(placements) / total_apps * 100):.1f}%' if total_apps else '0%'

    writer.writerow([])
    writer.writerow(['=== ANALYTICS ==='])
    writer.writerow(['Metric', 'Value'])
    writer.writerow(['Total Drives Posted', len(drives)])
    writer.writerow(['Total Applications', total_apps])
    for status, count in status_counts.items():
        writer.writerow([f'Applications — {status}', count])
    writer.writerow(['Total Confirmed Placements', len(placements)])
    writer.writerow(['Selection Rate (Selected / Applications)', selection_rate])
    writer.writerow(['Placement Rate (Placed / Applications)', placement_rate])

    export_dir = 'static/exports'
    os.makedirs(export_dir, exist_ok=True)
    filename = f'company_{company_id}_export.csv'
    filepath = os.path.join(export_dir, filename)
    with open(filepath, 'w', newline='') as f:
        f.write(output.getvalue())

    db.session.add(Notification(
        user_type='company',
        user_id=company_id,
        message=f'Your applicant, placement & analytics export is ready. Download: /static/exports/{filename}',
    ))
    db.session.commit()
    return {'file': filepath, 'applications': total_apps, 'placements': len(placements)}


# ── Shared email helpers ─────────────────────────────────────────────────────

def _send_report_email(to_addr, subject, html_body, pdf_bytes, pdf_filename):
    """Send an HTML email with a PDF attachment. Silently skips (logging to
    stdout) if MAIL_USERNAME is not configured — in dev, check the saved
    PDF under static/reports/ and/or the Notification record instead."""
    from config import Config

    if not Config.MAIL_USERNAME:
        print(f'[EMAIL SKIPPED — no MAIL_USERNAME] To: {to_addr} | {subject} | attachment: {pdf_filename}')
        return

    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication

    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From'] = Config.MAIL_FROM
    msg['To'] = to_addr

    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText('This report requires an HTML-capable email client. '
                         'A PDF copy is attached.', 'plain'))
    alt.attach(MIMEText(html_body, 'html'))
    msg.attach(alt)

    attachment = MIMEApplication(pdf_bytes, _subtype='pdf')
    attachment.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
    msg.attach(attachment)

    try:
        with smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT) as smtp:
            smtp.starttls()
            smtp.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
            smtp.send_message(msg)
    except Exception as e:
        print(f'[EMAIL ERROR] {e}')


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


# ── Task 5 — AI resume tailoring via Groq API ───────────────────────────────

def _pdf_safe(text):
    """Encode text to Latin-1 safe for fpdf2 core fonts."""
    return str(text).encode('latin-1', errors='replace').decode('latin-1')


@celery.task(name='tasks.generate_tailored_resume')
def generate_tailored_resume(student_id, drive_id, selected_projects=None):
    """Uses Groq AI to generate a tailored 1-page resume PDF aligned to
    the drive's required_skills and job_description. Saves under
    static/resumes/ and creates a Notification with the download link.

    Gracefully degrades if GROQ_API_KEY is not set — generates a
    structured resume from the student's existing data without AI
    tailoring in that case."""
    from models import db, Student, PlacementDrive, Notification
    from config import Config

    student = Student.query.get(student_id)
    drive = PlacementDrive.query.get(drive_id)
    if not student or not drive:
        return {'error': 'Student or Drive not found'}

    selected_projects = selected_projects or []

    # ── Gather context ───────────────────────────────────────────────────
    student_skills = student.skills or 'Not specified'
    student_education = student.education or 'Not specified'
    student_name = student.full_name
    student_email = student.email
    student_phone = student.phone or ''
    student_cgpa = student.cgpa or ''

    job_title = drive.job_title
    job_description = drive.job_description or ''
    required_skills = drive.required_skills or ''
    company_name = drive.company.company_name if drive.company else 'Unknown'

    # ── Call Groq API (or degrade gracefully) ────────────────────────────
    tailored_bullets = []
    summary = ''

    if Config.GROQ_API_KEY:
        try:
            from groq import Groq

            client = Groq(api_key=Config.GROQ_API_KEY)

            projects_text = '\n'.join(f'- {p}' for p in selected_projects) if selected_projects else 'None provided'

            prompt = f"""You are a professional resume writer. Generate a tailored resume for the following student
applying to a specific job position. Output ONLY the content, no markdown formatting.

STUDENT PROFILE:
- Name: {student_name}
- Email: {student_email}
- Phone: {student_phone}
- CGPA: {student_cgpa}
- Skills: {student_skills}
- Education: {student_education}

SELECTED PROJECTS:
{projects_text}

TARGET POSITION:
- Job Title: {job_title} at {company_name}
- Job Description: {job_description}
- Required Skills: {required_skills}

Generate the following sections:
1. PROFESSIONAL SUMMARY (2-3 sentences tailored to this specific role)
2. KEY SKILLS (bullet points — prioritize skills that match the required_skills)
3. PROJECT EXPERIENCE (3-4 bullet points using STAR format, tailored to the job)
4. EDUCATION (formatted nicely)

Keep it concise enough for a single page. Focus on relevance to the target position."""

            response = client.chat.completions.create(
                model=Config.GROQ_MODEL,
                messages=[
                    {'role': 'user', 'content': prompt},
                ],
            )
            ai_text = response.choices[0].message.content or ''

            # Parse sections from AI response
            sections = ai_text.split('\n')
            current_section = ''
            parsed = {'summary': [], 'skills': [], 'projects': [], 'education': []}

            for line in sections:
                line_stripped = line.strip()
                if not line_stripped:
                    continue
                upper = line_stripped.upper()
                if 'PROFESSIONAL SUMMARY' in upper:
                    current_section = 'summary'
                elif 'KEY SKILLS' in upper or 'SKILLS' in upper:
                    current_section = 'skills'
                elif 'PROJECT' in upper or 'EXPERIENCE' in upper:
                    current_section = 'projects'
                elif 'EDUCATION' in upper:
                    current_section = 'education'
                elif current_section:
                    cleaned = line_stripped.lstrip('•-*· ').strip()
                    if cleaned:
                        parsed[current_section].append(cleaned)

            summary = ' '.join(parsed['summary']) if parsed['summary'] else ''
            tailored_bullets = parsed

        except Exception as e:
            print(f'[GROQ ERROR] {e} — falling back to non-AI resume')
            tailored_bullets = []
            summary = ''

    # ── Build PDF ────────────────────────────────────────────────────────
    from fpdf import FPDF

    class ResumePDF(FPDF):
        def header(self):
            pass  # we draw the header manually

        def footer(self):
            self.set_y(-10)
            self.set_font('Helvetica', 'I', 7)
            self.set_text_color(150, 150, 150)
            self.cell(0, 5, 'Generated by Placement Portal AI Resume Tailorer', align='C')

    pdf = ResumePDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Header: Name + Contact ───────────────────────────────────────────
    pdf.set_font('Helvetica', 'B', 18)
    pdf.set_text_color(33, 37, 41)
    pdf.cell(0, 10, _pdf_safe(student_name), ln=True, align='C')

    contact_parts = [student_email]
    if student_phone:
        contact_parts.append(student_phone)
    if student_cgpa:
        contact_parts.append(f'CGPA: {student_cgpa}')
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, _pdf_safe(' | '.join(contact_parts)), ln=True, align='C')

    # Divider
    pdf.ln(3)
    pdf.set_draw_color(52, 73, 94)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    # ── Target role ──────────────────────────────────────────────────────
    pdf.set_font('Helvetica', 'I', 10)
    pdf.set_text_color(52, 73, 94)
    pdf.cell(0, 6, _pdf_safe(f'Tailored for: {job_title} at {company_name}'), ln=True, align='C')
    pdf.ln(4)

    def section_heading(title):
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(44, 62, 80)
        pdf.cell(0, 7, _pdf_safe(title), ln=True)
        pdf.set_draw_color(189, 195, 199)
        pdf.set_line_width(0.3)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(2)

    def bullet_point(text):
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(50, 50, 50)
        x = pdf.get_x()
        pdf.cell(5, 5, _pdf_safe('•'))
        pdf.multi_cell(175, 5, _pdf_safe(text))
        pdf.ln(1)

    if tailored_bullets and isinstance(tailored_bullets, dict):
        # AI-generated content
        if summary:
            section_heading('PROFESSIONAL SUMMARY')
            pdf.set_font('Helvetica', '', 9)
            pdf.set_text_color(50, 50, 50)
            pdf.multi_cell(0, 5, _pdf_safe(summary))
            pdf.ln(3)

        if tailored_bullets.get('skills'):
            section_heading('KEY SKILLS')
            skills_text = ' | '.join(tailored_bullets['skills'][:12])
            pdf.set_font('Helvetica', '', 9)
            pdf.set_text_color(50, 50, 50)
            pdf.multi_cell(0, 5, _pdf_safe(skills_text))
            pdf.ln(3)

        if tailored_bullets.get('projects'):
            section_heading('PROJECT EXPERIENCE')
            for b in tailored_bullets['projects'][:6]:
                bullet_point(b)
            pdf.ln(2)

        if tailored_bullets.get('education'):
            section_heading('EDUCATION')
            for b in tailored_bullets['education'][:4]:
                bullet_point(b)
    else:
        # Fallback: non-AI structured resume
        section_heading('PROFESSIONAL SUMMARY')
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 5, _pdf_safe(
            f'Motivated student with skills in {student_skills}, seeking the '
            f'{job_title} position at {company_name}.'
        ))
        pdf.ln(3)

        section_heading('SKILLS')
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 5, _pdf_safe(student_skills))
        pdf.ln(3)

        if selected_projects:
            section_heading('PROJECTS')
            for proj in selected_projects[:5]:
                bullet_point(proj)
            pdf.ln(2)

        section_heading('EDUCATION')
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 5, _pdf_safe(student_education))

    # ── Save PDF ─────────────────────────────────────────────────────────
    resumes_dir = 'static/resumes'
    os.makedirs(resumes_dir, exist_ok=True)
    filename = f'tailored_student_{student_id}_drive_{drive_id}.pdf'
    filepath = os.path.join(resumes_dir, filename)
    pdf.output(filepath)

    db.session.add(Notification(
        user_type='student',
        user_id=student_id,
        message=f'Your tailored resume for {job_title} at {company_name} is ready. '
                f'Download: /static/resumes/{filename}',
    ))
    db.session.commit()

    return {
        'file': filepath,
        'download_url': f'/static/resumes/{filename}',
        'ai_powered': bool(Config.GROQ_API_KEY and tailored_bullets),
    }
