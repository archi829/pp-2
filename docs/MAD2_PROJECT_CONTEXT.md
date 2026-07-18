# 📋 Placement Portal V2 — MAD2 Project Context
> **Repo:** https://github.com/archi829/pp-2  
> **Tech Stack:** Flask (API) + Vue.js (UI) + SQLite + Redis + Celery  
> **Milestone-0 Deadline:** 14 July 2026  
> **Last Updated:** 07 July 2026

---

## 🗂️ Table of Contents
1. [What's Already Done (MAD1 Baseline)](#1-whats-already-done-mad1-baseline)
2. [The Big Change: MAD1 → MAD2 Architecture Shift](#2-the-big-change-mad1--mad2-architecture-shift)
3. [Target Folder Structure (MAD2)](#3-target-folder-structure-mad2)
4. [MAD2 Milestone Breakdown — What Needs to Be Done](#4-mad2-milestone-breakdown--what-needs-to-be-done)
5. [Optional Enhancements — Bundle with Core](#5-optional-enhancements--bundle-with-core)
6. [New Dependencies to Add](#6-new-dependencies-to-add)
7. [Implementation Notes & Gotchas](#7-implementation-notes--gotchas)
8. [Commit Message Reference](#8-commit-message-reference)

---

## 1. What's Already Done (MAD1 Baseline)

### ✅ Repository Setup (Milestone 0 — DONE)
- Public GitHub repo at `archi829/pp-2`
- `README.md` with setup instructions and default credentials
- `.gitignore` for Python/Flask/SQLite files
- `requirements.txt` present

### ✅ Database Models (models.py — MOSTLY DONE)
All core models exist and are well-structured:

| Model | Fields | Status |
|-------|--------|--------|
| `Admin` | id, username, email, password_hash, created_at | ✅ Done |
| `Company` | id, company_name, email, password_hash, hr_contact, website, industry, description, approval_status, is_blacklisted, created_at → relationship: drives | ✅ Done |
| `Student` | id, full_name, email, password_hash, phone, cgpa, skills, education, resume_path, is_blacklisted, is_active, created_at → relationship: applications | ✅ Done |
| `PlacementDrive` | id, company_id, job_title, job_description, eligibility_criteria, required_skills, salary_range, application_deadline, location, status, created_at → relationship: applications | ✅ Done |
| `Application` | id, student_id, drive_id, applied_at, status, offer_status, cover_letter, student_notes + UniqueConstraint(student_id, drive_id) | ✅ Done |
| `Notification` | id, user_type, user_id, message, is_read, created_at + Index(user_type, user_id) | ✅ Done |
| `Interview` | — | ❌ Missing |
| `Placement` | — | ❌ Missing |

### ✅ Authentication (routes/auth.py — DONE, needs JWT conversion)
- Login for all 3 roles (Admin, Company, Student)
- Student self-registration
- Company registration (pending admin approval)
- No admin registration (admin pre-seeded)
- Role-based redirect after login
- **Currently uses Flask-Login (session-based) → must switch to JWT**

### ✅ App Entry Point (app.py — DONE, needs restructuring)
- Factory pattern (`create_app()`)
- All 5 blueprints registered: `auth_bp`, `admin_bp`, `company_bp`, `student_bp`, `api_bp`
- Custom `user_loader` supporting prefixed IDs (`admin-1`, `company-2`, `student-3`)
- 403 error handler
- Upload folder for resumes configured

### ✅ Database Seeding (init_db.py — DONE)
- Creates all tables
- Pre-seeds Admin user programmatically
- Seeds sample Companies, Students, and Drives with dummy data

### ✅ Routes / Business Logic (routes/ — DONE for MAD1)
Five blueprints with Jinja2-rendered views:

| Blueprint | What's implemented |
|-----------|--------------------|
| `auth.py` | Login, register, logout for all roles |
| `admin.py` | Dashboard stats, approve/reject companies & drives, search, blacklist |
| `company.py` | Dashboard, create/manage drives, view applicants, shortlist/reject |
| `student.py` | Dashboard, browse drives, apply, view status, profile edit, resume upload |
| `api.py` | REST endpoints via Flask-RESTful (partial — MAD1 scope) |

### ✅ Frontend (templates/ — DONE for MAD1, to be REPLACED)
- Jinja2 HTML templates with Bootstrap styling
- Server-rendered pages for all 3 roles
- **These will be replaced by Vue.js components in MAD2**

### ✅ Current Stack (MAD1)
```
Flask 3.1.3
Flask-Login 0.6.3        ← session-based auth (will be replaced with JWT)
Flask-RESTful 0.3.10
Flask-SQLAlchemy 3.1.1
SQLAlchemy 2.0.48
Werkzeug 3.1.7
Jinja2 3.1.6             ← template engine (only for entry point in MAD2)
SQLite (placement_portal.db)
```

---

## 2. The Big Change: MAD1 → MAD2 Architecture Shift

```
MAD1 (done):
Browser ──HTTP──► Flask (renders Jinja2 templates) ──► SQLite

MAD2 (target):
Browser ──HTTP──► Vue.js SPA ──fetch/axios──► Flask REST API ──► SQLite
                                                     │
                                              Redis (cache + broker)
                                                     │
                                              Celery Workers (background jobs)
```

### Key changes required:
1. **Auth:** Flask-Login sessions → JWT tokens (`flask-jwt-extended`)
2. **Frontend:** Jinja2 templates → Vue.js SPA (CDN-based, no build tool needed)
3. **Background jobs:** Add Celery + Redis (interview reminders, monthly reports, CSV export)
4. **Caching:** Add Redis cache layer on top of frequently-hit API endpoints
5. **New models:** `Interview`, `Placement`
6. **All API routes** must return JSON; no `render_template()` for main views (only `index.html` entry point is Jinja2)

---

## 3. Target Folder Structure (MAD2)

```
pp-2/
├── app.py                    ← MODIFY: remove Flask-Login, add JWT, CORS
├── models.py                 ← MODIFY: add Interview + Placement models
├── init_db.py                ← keep as-is (or minor update for new models)
├── config.py                 ← NEW: centralize all config (DB URI, Redis, JWT secret, Celery)
├── tasks.py                  ← NEW: all Celery tasks (reminders, reports, CSV export)
├── celery_worker.py          ← NEW: Celery app instance (entry point for worker)
├── extensions.py             ← NEW: shared Flask extensions (db, jwt, cache, celery)
│
├── routes/
│   ├── __init__.py
│   ├── auth.py               ← MODIFY: JWT login/register, return tokens
│   ├── admin.py              ← MODIFY: pure JSON API (remove render_template)
│   ├── company.py            ← MODIFY: pure JSON API
│   ├── student.py            ← MODIFY: pure JSON API
│   └── api.py                ← EXPAND: add all missing REST endpoints
│
├── requirements.txt          ← MODIFY: add new packages
│
├── static/
│   └── uploads/
│       └── resumes/          ← already exists
│
├── templates/
│   └── index.html            ← SINGLE entry point (serves Vue app via Jinja2)
│
└── frontend/                 ← NEW: entire Vue.js app (CDN-based, no CLI needed)
    └── (all .vue-style logic inside index.html or separate JS files)
```

> **Note on Vue setup:** The milestones say "VueJS Advanced with CLI only if required, not necessary." The simplest approach is CDN-based Vue (no `npm`, no build step) — just `<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js">`. All Vue components go into `static/js/` as plain `.js` files, and `templates/index.html` is the single Jinja2 entry point that loads them. Use Vue2 explicitly. 

---

## 4. MAD2 Milestone Breakdown — What Needs to Be Done

### 🔧 Milestone 0 — GitHub Setup ✅ (DONE)
Repo exists, README and .gitignore are there. Just add collaborator `MADII-cs2006` by 14 July 2026.

---

### 🔧 Milestone 1 — Database Models (MOSTLY DONE → needs 2 additions)

**What's done:** All 6 core models exist (Admin, Company, Student, PlacementDrive, Application, Notification).

**What's missing — add to `models.py`:**

```python
# ADD: Interview model
class Interview(db.Model):
    __tablename__ = 'interview'
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('application.id'), nullable=False)
    scheduled_at = db.Column(db.DateTime, nullable=False)
    mode = db.Column(db.String(50))          # Online / In-person
    location_or_link = db.Column(db.String(300))
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), default='Scheduled')  # Scheduled / Completed / Cancelled
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

# ADD: Placement model (tracks final confirmed placements)
class Placement(db.Model):
    __tablename__ = 'placement'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    drive_id = db.Column(db.Integer, db.ForeignKey('placement_drive.id'), nullable=False)
    position = db.Column(db.String(150))
    salary = db.Column(db.String(100))
    joining_date = db.Column(db.Date)
    offer_letter_path = db.Column(db.String(300))
    placed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
```

Also update `Application.status` to include all MAD2 states:  
`Applied → Shortlisted → Interview Scheduled → Selected → Rejected → Placed`

**Commit:** `feat(models): add Interview and Placement models for MAD2`

---

### 🔧 Milestone 2 — Auth & Role-Based Access (JWT) ← BIG CHANGE

**What to do:**
- Remove Flask-Login (`login_user`, `logout_user`, `@login_required`)
- Install `flask-jwt-extended` and `flask-cors`
- New auth flow:
  - `POST /api/auth/login` → returns `access_token` (JWT)
  - `POST /api/auth/register/student` → student self-register
  - `POST /api/auth/register/company` → company register (pending)
  - `POST /api/auth/logout` → client-side token removal (optional blocklist)
- JWT payload must include `role` field: `{ "sub": user_id, "role": "admin"|"company"|"student" }`
- Create role decorators:
  ```python
  from functools import wraps
  from flask_jwt_extended import get_jwt

  def admin_required(fn):
      @wraps(fn)
      @jwt_required()
      def wrapper(*args, **kwargs):
          if get_jwt().get("role") != "admin":
              return {"msg": "Admins only"}, 403
          return fn(*args, **kwargs)
      return wrapper
  # similar for company_required, student_required
  ```
- In `app.py`: remove `login_manager`, add `JWTManager(app)`, `CORS(app)`
- Vue frontend stores JWT in `localStorage`, sends as `Authorization: Bearer <token>` header

**Note:** The `user_loader` with prefixed IDs (`admin-1`) can be dropped since JWT carries role in its payload.

**Commit:** `feat(auth): replace Flask-Login sessions with JWT-based authentication`

---

### 🔧 Milestone 3 — Admin Dashboard API + Vue UI

**Backend (routes/admin.py) — convert to pure JSON API:**

```
GET  /api/admin/dashboard         → stats: total students, companies, drives, applications
GET  /api/admin/companies         → list all companies (with filter: pending/approved/blacklisted)
PUT  /api/admin/companies/<id>/approve
PUT  /api/admin/companies/<id>/reject
PUT  /api/admin/companies/<id>/blacklist
DELETE /api/admin/companies/<id>

GET  /api/admin/drives            → list all drives (with status filter)
PUT  /api/admin/drives/<id>/approve
PUT  /api/admin/drives/<id>/reject
DELETE /api/admin/drives/<id>

GET  /api/admin/students          → list all students
GET  /api/admin/students/<id>     → student detail + applications
PUT  /api/admin/students/<id>/blacklist
DELETE /api/admin/students/<id>

GET  /api/admin/search?q=&type=company|student  → search
GET  /api/admin/applications      → all applications across all drives
```

**Frontend (Vue) — Admin views:**
- `AdminDashboard.vue` — stats cards (total students, companies, drives)
- `AdminCompanies.vue` — table with approve/reject/blacklist actions
- `AdminDrives.vue` — table with approve/reject actions
- `AdminStudents.vue` — table with search, view, blacklist actions
- `AdminApplications.vue` — all applications overview

**Commit:** `feat(admin): admin dashboard API + Vue UI with company/drive/student management`

---

### 🔧 Milestone 4 — Company Dashboard API + Vue UI

**Backend (routes/company.py):**

```
GET  /api/company/dashboard       → company info + drive stats + applicant counts
GET  /api/company/profile         → company profile
PUT  /api/company/profile         → update company profile

POST /api/company/drives          → create new drive (only if approved)
GET  /api/company/drives          → list own drives
GET  /api/company/drives/<id>     → drive detail
PUT  /api/company/drives/<id>     → edit drive
PUT  /api/company/drives/<id>/status  → toggle Active/Closed
DELETE /api/company/drives/<id>

GET  /api/company/drives/<id>/applications   → applicants for a drive
PUT  /api/company/applications/<id>/status   → Shortlist / Reject + feedback
PUT  /api/company/applications/<id>/select   → mark Selected (triggers Placement creation)

POST /api/company/interviews      → schedule interview for an application
GET  /api/company/interviews      → list all scheduled interviews
PUT  /api/company/interviews/<id> → update interview
```

**Frontend (Vue) — Company views:**
- `CompanyDashboard.vue` — stats cards, recent drives
- `CompanyDrives.vue` — CRUD for placement drives
- `DriveApplicants.vue` — applicant list per drive, shortlist/reject with feedback
- `CompanyInterviews.vue` — schedule and manage interviews
- `CompanyProfile.vue` — edit company profile

**Commit:** `feat(company): company dashboard API + Vue UI with drive and applicant management`

---

### 🔧 Milestone 5 — Student Dashboard API + Vue UI

**Backend (routes/student.py):**

```
GET  /api/student/dashboard       → profile summary + recent applications + upcoming interviews
GET  /api/student/profile         → full profile
PUT  /api/student/profile         → edit profile (name, phone, cgpa, skills, education)
POST /api/student/profile/resume  → upload resume (multipart/form-data)

GET  /api/student/drives          → all approved drives (with search: ?q=&skill=&company=)
GET  /api/student/drives/<id>     → drive detail

POST /api/student/applications    → apply to a drive (body: {drive_id, cover_letter})
GET  /api/student/applications    → all own applications with status
GET  /api/student/applications/<id> → application detail

GET  /api/student/interviews      → upcoming interview schedule + feedback
GET  /api/student/placements      → confirmed placements / offer letters
GET  /api/student/placements/<id>/offer-letter  → download offer letter
```

**Frontend (Vue) — Student views:**
- `StudentDashboard.vue` — applied jobs summary, notifications, upcoming interviews
- `BrowseDrives.vue` — search/filter drives by company, skill, title
- `StudentApplications.vue` — application history with status badges
- `StudentInterviews.vue` — interview schedule view
- `StudentProfile.vue` — edit profile + resume upload
- `PlacementHistory.vue` — confirmed placements + offer letter download

**Commit:** `feat(student): student dashboard API + Vue UI with application and profile management`

---

### 🔧 Milestone 6 — Application History & Status Tracking

Most of this is enforced by the existing `UniqueConstraint` on `Application` and proper status flow.

**What to ensure:**
- `POST /api/student/applications` checks `UniqueConstraint` and returns 409 if duplicate
- `Application.status` state machine: `Applied → Shortlisted → Interview Scheduled → Selected / Rejected`
- When company marks `Selected` → auto-create `Placement` record
- Only students whose `is_blacklisted=False` and `is_active=True` can apply
- Only drives with `status='Approved'` are visible to students
- API responses include full history including timestamps per status change (consider adding `ApplicationStatusLog` model or store as JSON string in `Application.status_history` if full audit trail needed)
- Role-based data visibility:
  - Admin → all records
  - Company → only their drives' applications + student profiles (read-only)
  - Student → only their own applications

**Commit:** `feat(tracking): application history, status flow, and duplicate prevention`

---

### 🔧 Milestone 7 — Celery Background Jobs (NEW — doesn't exist yet)

**Setup files to create:**

**`config.py`:**
```python
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
CELERYBEAT_SCHEDULE = {
    'daily-interview-reminders': {
        'task': 'tasks.send_interview_reminders',
        'schedule': crontab(hour=8, minute=0),   # 8 AM daily
    },
    'monthly-placement-report': {
        'task': 'tasks.send_monthly_report',
        'schedule': crontab(day_of_month=1, hour=6, minute=0),  # 1st of month
    },
}
```

**`tasks.py`:**
```python
from celery import Celery
import smtplib, csv, io
from email.mime.text import MIMEText

celery = Celery(__name__)

@celery.task
def send_interview_reminders():
    # Query interviews scheduled for next 24-48 hours
    # Send email (or webhook) to each student
    pass

@celery.task
def send_monthly_report():
    # Aggregate: drives conducted, students applied/selected this month
    # Generate HTML report, email to admin
    pass

@celery.task
def export_applications_csv(student_id):
    # Query all applications for this student
    # Build CSV: Student ID, Company Name, Drive Title, Status, Dates
    # Save to static/exports/<student_id>_applications.csv
    # Create Notification record for student: "Your CSV is ready"
    pass
```

**New API endpoint for user-triggered export:**
```
POST /api/student/applications/export  → triggers export_applications_csv.delay(student_id)
                                         returns: { "task_id": "...", "msg": "Export started" }
GET  /api/student/applications/export/status/<task_id>  → check task status
```

**To run locally:**
```bash
redis-server                                          # Terminal 1
celery -A celery_worker.celery worker --loglevel=info # Terminal 2
celery -A celery_worker.celery beat --loglevel=info   # Terminal 3 (for scheduled jobs)
python app.py                                          # Terminal 4
```

**For email:** Use Gmail SMTP or Mailtrap (dev). Store `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` in `config.py` or `.env`.

**Commit:** `feat(celery): Celery+Redis background jobs for reminders, monthly report, CSV export`

---

### 🔧 Milestone 8 — Redis Caching (NEW — doesn't exist yet)

**Setup:**
```python
# extensions.py
from flask_caching import Cache
cache = Cache()

# app.py
from extensions import cache
cache.init_app(app, config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': 'redis://localhost:6379/1',  # use DB 1 (DB 0 = Celery broker)
    'CACHE_DEFAULT_TIMEOUT': 300                    # 5 minutes default
})
```

**Cache these endpoints (high read, low write):**

| Endpoint | TTL | Invalidate when |
|----------|-----|-----------------|
| `GET /api/student/drives` | 5 min | New drive approved |
| `GET /api/admin/dashboard` | 2 min | Any data change |
| `GET /api/admin/companies` | 5 min | Company approved/rejected/added |
| `GET /api/admin/students` | 5 min | Student added/blacklisted |
| `GET /api/company/drives/<id>/applications` | 2 min | New application submitted |

**Usage pattern:**
```python
@company_bp.route('/api/company/drives')
@cache.cached(timeout=300, key_prefix='company_drives_%s')
@jwt_required()
def get_company_drives():
    ...

# Cache invalidation (call after writes):
cache.delete('company_drives_<company_id>')
```

**Commit:** `feat(cache): Redis caching for job listings, company search, and student search endpoints`

---

## 5. Optional Enhancements — Bundle with Core

These are not graded but easy to add alongside the core work:

### ✅ UI/UX + Mobile Responsive (bundle with Milestones 3–5)
Since you're building Vue anyway, add these for free:
- Use Bootstrap 5 CDN (`<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5/...">`)
- All layouts use Bootstrap grid (`container`, `row`, `col-md-*`) → auto responsive
- Navbar collapses on mobile with `navbar-toggler`
- Status badges: `badge bg-success`, `badge bg-danger`, etc.

### ✅ Frontend Validation (bundle with every form in Milestones 3–5)
Add to every form in Vue:
```js
// Simple pattern in every form component
const errors = reactive({})

function validate() {
  errors.email = !form.email.includes('@') ? 'Invalid email' : ''
  errors.cgpa = (form.cgpa < 0 || form.cgpa > 10) ? 'CGPA must be 0–10' : ''
  return !Object.values(errors).some(Boolean)
}
```
Backend validation: use `marshmallow` or simple `request.json` checks with meaningful 400 responses.

### ✅ Add to Home Screen / PWA (add after frontend is done — 1 hour effort)
Add to `templates/index.html`:
```html
<link rel="manifest" href="/static/manifest.json">
```
Create `static/manifest.json`:
```json
{
  "name": "Placement Portal",
  "short_name": "PPA",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0d6efd",
  "icons": [{ "src": "/static/icon.png", "sizes": "192x192", "type": "image/png" }]
}
```

### ⚠️ Chart.js + ATS Resume Checker (bundle with Admin/Company dashboards — ~2 days extra)
- **Charts:** Add Chart.js via CDN. In `AdminDashboard.vue`, render:
  - Line chart: monthly placements trend
  - Bar chart: top skills in demand
  - Doughnut: application status distribution
- **ATS Resume Checker:** Simple keyword matching (compare student skills vs drive required_skills). Add `GET /api/drives/<id>/ats-score?student_id=X` endpoint.

---

## 6. New Dependencies to Add

Update `requirements.txt`:

```txt
# Existing (keep all)
Flask==3.1.3
Flask-RESTful==0.3.10
Flask-SQLAlchemy==3.1.1
SQLAlchemy==2.0.48
Werkzeug==3.1.7
Jinja2==3.1.6

# REMOVE (no longer needed)
# Flask-Login==0.6.3

# ADD — Auth
flask-jwt-extended==4.6.0
flask-cors==4.0.0

# ADD — Celery + Redis
celery==5.3.6
redis==5.0.1
flower==2.0.1          # optional: Celery monitoring UI at localhost:5555

# ADD — Caching
flask-caching==2.1.0

# ADD — Email
# (use smtplib from stdlib OR add:)
# flask-mail==0.10.0

# ADD — CSV export (stdlib)
# csv module is built-in — no install needed

# ADD — Marshmallow (optional, for cleaner validation)
marshmallow==3.21.1
```

---

## 7. Implementation Notes & Gotchas

### JWT vs Session — key differences to handle in Vue
- Store token: `localStorage.setItem('token', data.access_token)`
- Read token: `const token = localStorage.getItem('token')`
- Send with every request: `headers: { 'Authorization': 'Bearer ' + token }`
- On 401 response → redirect to login page, clear localStorage
- Decode role from JWT payload client-side: `JSON.parse(atob(token.split('.')[1])).role`

### CORS
Add `CORS(app, origins=["http://localhost:5000"])` (same origin since Vue is served by Flask). If running Vue dev server separately (port 5173), add that origin too.

### Serving Vue from Flask
The simplest MAD2 setup (no build step):
```python
# app.py
@app.route('/')
@app.route('/<path:path>')
def serve_vue(path=''):
    return render_template('index.html')  # index.html loads Vue via CDN
```
`templates/index.html` has `<div id="app">` and `<script type="module" src="/static/js/app.js">`. All Vue component files live in `static/js/`.

### Redis — Running locally
```bash
# Ubuntu/WSL
sudo apt install redis-server
sudo service redis-server start
redis-cli ping   # should return PONG
```

### Application Status Flow (enforce this order)
```
Applied ──► Shortlisted ──► Interview Scheduled ──► Selected ──► Placed
    └──────────────────────────────────────────► Rejected
```
Only Companies can move status forward. Once `Rejected` or `Placed`, status is final.

### Prevent duplicate applications
Already handled by `UniqueConstraint('student_id', 'drive_id')` in `Application` model. Catch `IntegrityError` in the API route and return HTTP 409.

### File uploads (resume)
Keep the existing resume upload logic. Just expose it via `PUT /api/student/profile/resume` (multipart form). Return the file path. Vue sends `FormData` object.

### Celery in Flask app context
Celery tasks need Flask app context to use SQLAlchemy:
```python
# tasks.py
from app import create_app
flask_app = create_app()

@celery.task
def export_applications_csv(student_id):
    with flask_app.app_context():
        apps = Application.query.filter_by(student_id=student_id).all()
        ...
```

---

## 8. Commit Message Reference

| Milestone | Commit Message |
|-----------|---------------|
| Milestone 0 | `Milestone-0 PPA-V2 Setup` ✅ done |
| Database Models | `feat(models): add Interview and Placement models for MAD2` |
| Auth & RBAC | `feat(auth): JWT-based authentication with role-based access control` |
| Admin Dashboard | `feat(admin): admin dashboard and management API + Vue components` |
| Company Dashboard | `feat(company): company dashboard, drive management and applicant API + Vue` |
| Student Dashboard | `feat(student): student dashboard, drive search, application API + Vue` |
| Status Tracking | `feat(tracking): application status flow, history, and duplicate prevention` |
| Celery Jobs | `feat(celery): background jobs for reminders, monthly reports, and CSV export` |
| Redis Caching | `feat(cache): Redis API caching for performance optimization` |
| UI/UX + PWA | `feat(ui): responsive Bootstrap UI, frontend validation, PWA manifest` |
| Charts + ATS | `feat(analytics): Chart.js dashboards and ATS resume screener` |
| Final Submission | `Milestone-PPA-V2 Final-Submission` |

---

## 9. Recommended Build Order

```
Phase 1 — Foundation (do these first, everything depends on them)
  [1] Add Interview + Placement to models.py
  [2] Switch auth to JWT (routes/auth.py + app.py + extensions.py)
  [3] Set up Flask to serve Vue entry point (index.html)

Phase 2 — Core Dashboards (any order within phase)
  [4] Admin Dashboard API + Vue UI              ← bundle Bootstrap responsive + frontend validation here
  [5] Company Dashboard API + Vue UI
  [6] Student Dashboard API + Vue UI

Phase 3 — Data & Tracking
  [7] Application status tracking + history API ← bundle Chart.js here if doing it

Phase 4 — Infrastructure
  [8] Celery + Redis setup (tasks.py, celery_worker.py)
  [9] Redis caching on endpoints              ← bundle Add-to-Home-Screen / PWA here

Phase 5 — Polish & Submit
  [10] Testing, edge cases, final cleanup
  [11] Demo video + project report (PDF)
  [12] Final submission commit + ZIP
```

---

*Context file generated from: `mad2_milestones.md` + GitHub repo `archi829/pp-2` analysis*  
*Repo languages: Python 35.6% | HTML 64.4%*
