from app import create_app
from models import db, Admin, Company, Student, PlacementDrive, Application, Notification, ApplicationStatusLog
from werkzeug.security import generate_password_hash
from datetime import date, timedelta
import os
import random

app = create_app()

with app.app_context():
    # ── Setup ──────────────────────────────────────────────────────────────
    os.makedirs('static/uploads/resumes', exist_ok=True)
    db.drop_all()
    db.create_all()
    print("Database tables created.")

    default_password = generate_password_hash('password123')

    # ── Admin ───────────────────────────────────────────────────────────────
    admin = Admin(
        username='admin',
        email='admin@placementportal.com',
        password_hash=generate_password_hash('admin123')
    )
    db.session.add(admin)

    # ── Companies ───────────────────────────────────────────────────────────
    companies_data = [
        ("TechNova Solutions",  "hr@technova.com",             "Software", "Approved", False),
        ("Global Finance Inc",  "careers@globalfinance.com",   "Finance",  "Approved", False),
        ("Pending Startup1",    "contact1@startup.com",        "Software", "Pending",  False),
        ("Pending Startup2",    "contact2@startup.com",        "Software", "Pending",  False),
        ("Sketchy Corp",        "admin@sketchy.com",           "Unknown",  "Rejected", False),
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

    # ── Students ────────────────────────────────────────────────────────────
    skills_pool  = ["Python", "Java", "C++", "React", "SQL"]
    demo_resumes = ["resume1.pdf", "resume2.pdf", "resume3.pdf", "resume4.pdf", "resume5.pdf"]
    students     = []

    for i in range(1, 11):
        student = Student(
            full_name=f"Student {i}",
            email=f"student{i}@test.com",
            password_hash=default_password,
            cgpa=round(random.uniform(6.5, 9.5), 2),
            skills=", ".join(random.sample(skills_pool, 3)),
            resume_path=f"uploads/resumes/{random.choice(demo_resumes)}"
        )
        db.session.add(student)
        students.append(student)

    db.session.commit()
    print(f"{len(students)} students created.")

    # ── Placement Drives ────────────────────────────────────────────────────
    today             = date.today()
    approved_companies = [c for c in companies if c.approval_status == 'Approved']
    drives            = []

    drive_specs = [
        ("Software Engineer",       "Python, Django, SQL",    "8-12 LPA", "Bangalore"),
        ("Frontend Developer",      "React, JavaScript, CSS", "6-10 LPA", "Remote"),
        ("Data Analyst",            "Python, SQL, Excel",     "7-11 LPA", "Mumbai"),
        ("DevOps Engineer",         "Linux, Docker, AWS",     "9-14 LPA", "Hyderabad"),
        ("Full Stack Developer",    "React, Node.js, SQL",    "10-15 LPA","Pune"),
    ]

    for i, (title, skills, salary, location) in enumerate(drive_specs):
        drive = PlacementDrive(
            company_id=random.choice(approved_companies).id,
            job_title=title,
            job_description=f"We are looking for a skilled {title} to join our team.",
            required_skills=skills,
            eligibility_criteria="CGPA >= 7.0",
            salary_range=salary,
            location=location,
            application_deadline=today + timedelta(days=10 + i),
            status="Approved"
        )
        db.session.add(drive)
        drives.append(drive)

    db.session.commit()
    print(f"{len(drives)} drives created.")

    # ── Applications + Status Log ───────────────────────────────────────────
    # Fixed: 'Interview Scheduled' (was incorrectly 'Interview' in old seeder)
    statuses = ['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected']

    apps_to_add = []
    for student in students:
        num_drives    = min(len(drives), random.randint(2, 4))
        chosen_drives = random.sample(drives, num_drives)
        for drive in chosen_drives:
            app_entry = Application(
                student_id=student.id,
                drive_id=drive.id,
                status=random.choice(statuses)
            )
            db.session.add(app_entry)
            apps_to_add.append(app_entry)

    # Flush to get IDs before writing FK-dependent log rows
    db.session.flush()

    log_rows = 0
    for app_entry in apps_to_add:
        # Seed a minimal one-entry log (the initial status the app was created with)
        db.session.add(ApplicationStatusLog(
            application_id=app_entry.id,
            from_status=None,
            to_status=app_entry.status,
            changed_by_role='system',
            changed_by_id=None,
        ))
        log_rows += 1

        # Notification for visible progress states
        if app_entry.status in ('Shortlisted', 'Interview Scheduled', 'Selected'):
            db.session.add(Notification(
                user_type='student',
                user_id=app_entry.student_id,
                message=(f"Update: Your application for "
                         f"{app_entry.drive.job_title} is now '{app_entry.status}'.")
            ))

    db.session.commit()
    print(f"{len(apps_to_add)} applications created.")
    print(f"{log_rows} status log rows seeded.")
    print("Seeding completed successfully!")