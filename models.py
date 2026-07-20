from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from constants import ApplicationStatus, DriveStatus, ApprovalStatus, InterviewStatus, OfferStatus

db = SQLAlchemy()


class Admin(db.Model):
    __tablename__ = 'admin'
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Company(db.Model):
    __tablename__ = 'company'
    id              = db.Column(db.Integer, primary_key=True)
    company_name    = db.Column(db.String(150), nullable=False)
    email           = db.Column(db.String(120), unique=True, nullable=False)
    password_hash   = db.Column(db.String(256), nullable=False)
    hr_contact      = db.Column(db.String(100))
    website         = db.Column(db.String(200))
    industry        = db.Column(db.String(100))
    description     = db.Column(db.Text)
    approval_status = db.Column(db.String(20), default=ApprovalStatus.PENDING)
    is_blacklisted  = db.Column(db.Boolean, default=False)
    created_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    drives = db.relationship('PlacementDrive', backref='company', lazy=True, cascade='all, delete-orphan')


class Student(db.Model):
    __tablename__ = 'student'
    id             = db.Column(db.Integer, primary_key=True)
    full_name      = db.Column(db.String(150), nullable=False)
    email          = db.Column(db.String(120), unique=True, nullable=False)
    password_hash  = db.Column(db.String(256), nullable=False)
    phone          = db.Column(db.String(20))
    cgpa           = db.Column(db.Float)
    skills         = db.Column(db.Text)
    education      = db.Column(db.Text)
    resume_path    = db.Column(db.String(300))
    is_blacklisted = db.Column(db.Boolean, default=False)
    is_active      = db.Column(db.Boolean, default=True)
    created_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    applications = db.relationship('Application', backref='student', lazy=True, cascade='all, delete-orphan')


class Notification(db.Model):
    __tablename__ = 'notification'
    id         = db.Column(db.Integer, primary_key=True)
    user_type  = db.Column(db.String(20), nullable=False)
    user_id    = db.Column(db.Integer, nullable=False)
    message    = db.Column(db.Text, nullable=False)
    is_read    = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (db.Index('idx_user_lookup', 'user_type', 'user_id'),)


class PlacementDrive(db.Model):
    __tablename__ = 'placement_drive'
    id                   = db.Column(db.Integer, primary_key=True)
    company_id           = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    job_title            = db.Column(db.String(150), nullable=False)
    job_description      = db.Column(db.Text, nullable=False)
    eligibility_criteria = db.Column(db.Text)
    required_skills      = db.Column(db.Text)
    salary_range         = db.Column(db.String(100))
    application_deadline = db.Column(db.Date, nullable=False)
    location             = db.Column(db.String(150))
    status               = db.Column(db.String(20), default=DriveStatus.PENDING)
    created_at           = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    applications = db.relationship('Application', backref='drive', lazy=True, cascade='all, delete-orphan')


class Application(db.Model):
    __tablename__ = 'application'
    id            = db.Column(db.Integer, primary_key=True)
    student_id    = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    drive_id      = db.Column(db.Integer, db.ForeignKey('placement_drive.id'), nullable=False)
    applied_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    status        = db.Column(db.String(30), default=ApplicationStatus.APPLIED)
    offer_status  = db.Column(db.String(20), default=OfferStatus.PENDING)
    cover_letter  = db.Column(db.Text)
    student_notes = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'drive_id', name='unique_student_drive'),
    )

    interviews = db.relationship('Interview', backref='application', lazy=True, cascade='all, delete-orphan')
    status_log = db.relationship(
        'ApplicationStatusLog',
        backref='application',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ApplicationStatusLog.changed_at'
    )


class ApplicationStatusLog(db.Model):
    """One row per Application.status transition. Immutable audit trail."""
    __tablename__ = 'application_status_log'
    id              = db.Column(db.Integer, primary_key=True)
    application_id  = db.Column(db.Integer, db.ForeignKey('application.id'), nullable=False)
    from_status     = db.Column(db.String(30))          # null for the initial Applied entry
    to_status       = db.Column(db.String(30), nullable=False)
    changed_by_role = db.Column(db.String(20))          # 'student' | 'company' | 'system'
    changed_by_id   = db.Column(db.Integer)             # FK-less; role determines which table
    note            = db.Column(db.Text)                # optional rejection reason etc.
    changed_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Interview(db.Model):
    __tablename__ = 'interview'
    id               = db.Column(db.Integer, primary_key=True)
    application_id   = db.Column(db.Integer, db.ForeignKey('application.id'), nullable=False)
    scheduled_at     = db.Column(db.DateTime, nullable=False)
    mode             = db.Column(db.String(50))
    location_or_link = db.Column(db.String(300))
    notes            = db.Column(db.Text)
    status           = db.Column(db.String(20), default=InterviewStatus.SCHEDULED)
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Placement(db.Model):
    __tablename__ = 'placement'
    id                = db.Column(db.Integer, primary_key=True)
    student_id        = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    company_id        = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    drive_id          = db.Column(db.Integer, db.ForeignKey('placement_drive.id'), nullable=False)
    position          = db.Column(db.String(150))
    salary            = db.Column(db.String(100))
    joining_date      = db.Column(db.Date)
    offer_letter_path = db.Column(db.String(300))
    placed_at         = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))