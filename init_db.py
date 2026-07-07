from app import create_app
from models import db, Admin, Company, Student, PlacementDrive, Application, Notification
from werkzeug.security import generate_password_hash
from datetime import date, timedelta
import os
import random

app = create_app()

with app.app_context():
    # ── Setup ─────────────────────────────────────────────
    os.makedirs('static/uploads/resumes', exist_ok=True)
    db.drop_all()
    db.create_all()
    print("Database tables created.")

    default_password = generate_password_hash('password123')

    # ── Admin ─────────────────────────────────────────────
    admin = Admin(
        username='admin',
        email='admin@placementportal.com',
        password_hash=generate_password_hash('admin123')
    )
    db.session.add(admin)

    # ── Companies ─────────────────────────────────────────
    companies_data = [
        ("TechNova Solutions", "hr@technova.com", "Software", "Approved", False),
        ("Global Finance Inc", "careers@globalfinance.com", "Finance", "Approved", False),
        ("Pending Startup1", "contact1@startup.com", "Software", "Pending", False),
        ("Pending Startup2", "contact2@startup.com", "Software", "Pending", False),
        ("Sketchy Corp", "admin@sketchy.com", "Unknown", "Rejected", False),
    ]

    companies = []
    for name, email, industry, status, blacklisted in companies_data:
        company = Company(
            company_name=name,
            email=email,
            password_hash=default_password,
            industry=industry,
            approval_status=status,
            is_blacklisted=blacklisted
        )
        db.session.add(company)
        companies.append(company)

    db.session.commit()

    skills_pool = ["Python", "Java", "C++", "React", "SQL"]
    students = []

    demo_resumes = [
        "resume1.pdf",
        "resume2.pdf",
        "resume3.pdf",
        "resume4.pdf",
        "resume5.pdf"
    ]

    for i in range(1, 11):
        resume_file = random.choice(demo_resumes)

        student = Student(
            full_name=f"Student {i}",
            email=f"student{i}@test.com",
            password_hash=default_password,
            cgpa=round(random.uniform(6.5, 9.5), 2),
            skills=", ".join(random.sample(skills_pool, 3)),
            resume_path=f"uploads/resumes/{resume_file}" 
        )

        db.session.add(student)      
        students.append(student)

    db.session.commit()
    print(f"{len(students)} students created.")

    # ── Placement Drives ──────────────────────────────────
    today = date.today()
    approved_companies = [c for c in companies if c.approval_status == 'Approved']

    drives = []
    for i in range(5):
        drive = PlacementDrive(
            company_id=random.choice(approved_companies).id,
            job_title=f"Role {i+1}",
            job_description="Sample job description",
            salary_range="6-10 LPA",
            application_deadline=today + timedelta(days=10 + i),
            status="Approved"
        )
        db.session.add(drive)
        drives.append(drive)

    db.session.commit()
    print(f"{len(drives)} drives created.")

    # ── Applications (BETTER LOGIC) ───────────────────────
    statuses = ['Applied', 'Shortlisted', 'Interview', 'Selected', 'Rejected']

    applications_created = 0

    for student in students:
        num_drives = min(len(drives), random.randint(2, 4))
        selected_drives = random.sample(drives, num_drives)

        for drive in selected_drives:
            app_entry = Application(
                student_id=student.id,
                drive_id=drive.id,
                status=random.choice(statuses)
            )
            db.session.add(app_entry)
            applications_created += 1

            # Optional notification (nice touch)
            if app_entry.status in ['Shortlisted', 'Interview', 'Selected']:
                notif = Notification(
                    user_type='student',
                    user_id=student.id,
                    message=f"Update: Your application for {drive.job_title} is now '{app_entry.status}'."
                )
                db.session.add(notif)

    db.session.commit()

    print(f"{applications_created} applications created.")
    print("Seeding completed successfully!")