# Milestone 7 — Celery + Redis Background Jobs

Depends on Milestones 1–6 (all models exist, all three role APIs done, status
log instrumented). Milestone 7 introduces three background tasks that run
outside the request-response cycle: daily interview reminders sent to students,
a monthly placement report emailed to admin, and a per-student CSV export of
their application history triggered on demand. None of these should block an
HTTP response — they are all fire-and-forget or scheduled.

**What's already in place:**
- `Interview`, `Placement`, `Application`, `Notification`, `ApplicationStatusLog`
  models (M1/M6) — tasks query these directly.
- JWT auth on all API endpoints — the CSV export trigger endpoint needs a student
  token like any other student route.
- `extensions.py` — shared Flask extensions; Celery's Flask app context helper
  will follow the same pattern.

**What M7 adds:**
- `config.py` — centralises all config (DB URI, Redis, JWT secret, Celery
  broker, beat schedule, mail settings). `app.py` is updated to import from it.
- `extensions.py` — add `celery` and `cache` instances alongside the existing
  `jwt` and `cors`.
- `celery_worker.py` — Celery app entry point; starts the worker process.
- `tasks.py` — three Celery tasks: `send_interview_reminders`,
  `send_monthly_report`, `export_applications_csv`.
- Two new student API endpoints: `POST /api/student/applications/export` and
  `GET /api/student/applications/export/status/<task_id>`.

---

## Step 1 — Install Dependencies

Add to `requirements.txt` and install:

```
celery==5.3.6
redis==5.0.1
flask-caching==2.1.0
flower==2.0.1        # optional: Celery monitoring UI at localhost:5555
```

```bash
pip install celery==5.3.6 redis==5.0.1 flask-caching==2.1.0 flower==2.0.1
```

Also make sure Redis is running locally:

```bash
# Ubuntu / WSL
sudo apt install redis-server
sudo service redis-server start
redis-cli ping          # should print PONG
```

**Test criteria:**
- `redis-cli ping` returns `PONG`.
- `python -c "import celery, redis, flask_caching"` exits with no error.

---

## Step 2 — `config.py` (new file)

Create `config.py` at the project root. This is the single source of truth for
all configuration — `app.py` will import from here rather than hardcoding
values inline.

```python
# config.py
import os
from celery.schedules import crontab

class Config:
    # Flask / SQLAlchemy
    SECRET_KEY               = os.environ.get('SECRET_KEY', 'mad2-jwt-secret-change-in-prod')
    JWT_SECRET_KEY           = os.environ.get('JWT_SECRET_KEY', 'mad2-jwt-secret-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = False
    SQLALCHEMY_DATABASE_URI  = os.environ.get('DATABASE_URL', 'sqlite:///placement_portal.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER            = 'static/uploads/resumes'

    # Redis
    REDIS_URL                = os.environ.get('REDIS_URL', 'redis://localhost:6379')

    # Celery
    CELERY_BROKER_URL        = REDIS_URL + '/0'
    CELERY_RESULT_BACKEND    = REDIS_URL + '/0'
    CELERY_TASK_SERIALIZER   = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_ACCEPT_CONTENT    = ['json']
    CELERYBEAT_SCHEDULE = {
        'daily-interview-reminders': {
            'task':     'tasks.send_interview_reminders',
            'schedule': crontab(hour=8, minute=0),      # 8 AM daily
        },
        'monthly-placement-report': {
            'task':     'tasks.send_monthly_report',
            'schedule': crontab(day_of_month=1, hour=6, minute=0),  # 1st of month
        },
    }

    # Flask-Caching (M8 — configure here so app.py doesn't change again)
    CACHE_TYPE               = 'redis'
    CACHE_REDIS_URL          = REDIS_URL + '/1'   # DB 1 keeps cache separate from Celery broker
    CACHE_DEFAULT_TIMEOUT    = 300

    # Email (use Mailtrap for dev, Gmail SMTP for prod)
    MAIL_SERVER   = os.environ.get('MAIL_SERVER',   'smtp.mailtrap.io')
    MAIL_PORT     = int(os.environ.get('MAIL_PORT',  '587'))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME',  '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD',  '')
    MAIL_FROM     = os.environ.get('MAIL_FROM',      'noreply@placementportal.local')
    ADMIN_EMAIL   = os.environ.get('ADMIN_EMAIL',    'admin@placementportal.com')
```

**Update `app.py`** to load from `Config` instead of hardcoding:

```python
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    ...
```

Remove the six hardcoded `app.config[...]` lines that are now in `Config`.

**Test criteria:**
- `python -c "from config import Config; print(Config.CELERY_BROKER_URL)"` prints
  `redis://localhost:6379/0`.
- `python app.py` still starts on port 5000 and all existing routes work.
- `python init_db.py` still seeds cleanly (no config regressions).

---

## Step 3 — `extensions.py` (update)

Add `Celery` and `Cache` instances alongside the existing `jwt` and `cors`.
Keep everything import-safe — no app object at module level.

```python
# extensions.py
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_caching import Cache
from celery import Celery

jwt   = JWTManager()
cors  = CORS()
cache = Cache()

def make_celery(app):
    """Create a Celery instance bound to the Flask app context.
    Tasks decorated with @celery.task can call db queries safely because
    every task execution pushes an app context before running."""
    celery = Celery(app.import_name)
    celery.conf.update(
        broker_url          = app.config['CELERY_BROKER_URL'],
        result_backend      = app.config['CELERY_RESULT_BACKEND'],
        task_serializer     = app.config['CELERY_TASK_SERIALIZER'],
        result_serializer   = app.config['CELERY_RESULT_SERIALIZER'],
        accept_content      = app.config['CELERY_ACCEPT_CONTENT'],
        beat_schedule       = app.config.get('CELERYBEAT_SCHEDULE', {}),
    )

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return super().__call__(*args, **kwargs)

    celery.Task = ContextTask
    return celery
```

**Update `app.py`** to init `cache` and store the Celery instance on the app:

```python
from extensions import jwt, cors, cache, make_celery

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, origins=["http://localhost:5000"])
    cache.init_app(app)

    app.celery = make_celery(app)   # stored on app so tasks.py can import it
    ...
```

**Test criteria:**
- `python -c "from app import create_app; app = create_app(); print(app.celery)"` prints
  a Celery object without error.
- `cache` object exists and is not `None`.

---

## Step 4 — `celery_worker.py` (new file)

This is the entry point for the Celery worker process. It imports the Flask app,
which triggers `make_celery`, and then imports `tasks` so Celery discovers all
decorated task functions.

```python
# celery_worker.py
from app import create_app
import tasks   # registers all @celery.task functions with the Celery instance

flask_app = create_app()
celery    = flask_app.celery
```

The worker is started with:

```bash
celery -A celery_worker.celery worker --loglevel=info
```

And the beat scheduler (for cron jobs) with:

```bash
celery -A celery_worker.celery beat --loglevel=info
```

**Test criteria:**
- `python celery_worker.py` exits cleanly (no import errors).
- `celery -A celery_worker.celery worker --loglevel=info` starts and prints
  `[tasks]` with `tasks.send_interview_reminders`, `tasks.send_monthly_report`,
  and `tasks.export_applications_csv` listed.

---

## Step 5 — `tasks.py` (new file): three tasks

### Task 1 — `send_interview_reminders`

Runs daily at 8 AM (via Celery Beat). Queries interviews scheduled in the next
24–48 hours that are still `Scheduled`, and sends each affected student either
an email or a `Notification` record (or both — decide based on whether SMTP is
configured).

```python
from app import create_app
from celery import shared_task
from datetime import datetime, timezone, timedelta

flask_app = create_app()
celery    = flask_app.celery

@celery.task(name='tasks.send_interview_reminders')
def send_interview_reminders():
    from models import db, Interview, Notification
    from constants import InterviewStatus

    now    = datetime.now(timezone.utc)
    window = now + timedelta(hours=48)

    interviews = Interview.query.filter(
        Interview.status == InterviewStatus.SCHEDULED,
        Interview.scheduled_at >= now,
        Interview.scheduled_at <= window,
    ).all()

    sent = 0
    for iv in interviews:
        app_obj  = iv.application
        student  = app_obj.student if app_obj else None
        drive    = app_obj.drive   if app_obj else None
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
```

### Task 2 — `send_monthly_report`

Runs on the 1st of each month at 6 AM. Aggregates the previous month's stats
and emails the admin.

```python
@celery.task(name='tasks.send_monthly_report')
def send_monthly_report():
    from models import db, Application, Placement, PlacementDrive, Student
    from constants import ApplicationStatus
    from sqlalchemy import func
    from datetime import date

    today      = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)

    # Count this month's activity
    new_apps = Application.query.filter(
        Application.applied_at >= first_prev,
        Application.applied_at <  first_this,
    ).count()

    new_placements = Placement.query.filter(
        Placement.placed_at >= first_prev,
        Placement.placed_at <  first_this,
    ).count()

    selected = Application.query.filter(
        Application.status == ApplicationStatus.SELECTED,
        Application.applied_at >= first_prev,
        Application.applied_at <  first_this,
    ).count()

    month_label = first_prev.strftime('%B %Y')
    body = (
        f"Monthly Placement Report — {month_label}\n\n"
        f"New Applications:  {new_apps}\n"
        f"Candidates Selected: {selected}\n"
        f"Confirmed Placements: {new_placements}\n\n"
        f"Total Students: {Student.query.count()}\n"
        f"Total Drives:   {PlacementDrive.query.count()}\n"
    )

    from config import Config
    _send_email(Config.ADMIN_EMAIL, f'Monthly Report — {month_label}', body)
    return {'month': month_label, 'applications': new_apps, 'placements': new_placements}
```

### Task 3 — `export_applications_csv` (user-triggered)

Called by `POST /api/student/applications/export`. Builds a CSV, saves it to
`static/exports/`, and creates a `Notification` for the student when done.

```python
import csv, io, os

@celery.task(name='tasks.export_applications_csv')
def export_applications_csv(student_id):
    from models import db, Application, Student, Notification

    student = Student.query.get(student_id)
    if not student:
        return {'error': 'Student not found'}

    apps = Application.query.filter_by(student_id=student_id)\
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
            a.drive.job_title        if a.drive else '',
            a.drive.company.company_name if a.drive and a.drive.company else '',
            a.drive.location         if a.drive else '',
            a.drive.salary_range     if a.drive else '',
            a.applied_at.strftime('%Y-%m-%d %H:%M') if a.applied_at else '',
            a.status,
            a.offer_status,
            (a.cover_letter or '').replace('\n', ' '),
        ])

    export_dir  = 'static/exports'
    os.makedirs(export_dir, exist_ok=True)
    filename    = f'applications_student_{student_id}.csv'
    filepath    = os.path.join(export_dir, filename)
    with open(filepath, 'w', newline='') as f:
        f.write(output.getvalue())

    db.session.add(Notification(
        user_type='student',
        user_id=student_id,
        message=f'Your application history CSV is ready. Download: /static/exports/{filename}',
    ))
    db.session.commit()
    return {'file': filepath, 'rows': len(apps)}
```

### Shared email helper (bottom of `tasks.py`)

```python
def _send_email(to_addr, subject, body):
    """Send a plain-text email. Silently skips if MAIL_USERNAME is not set
    (dev mode — check the Notification record instead)."""
    from config import Config
    import smtplib
    from email.mime.text import MIMEText

    if not Config.MAIL_USERNAME:
        print(f'[EMAIL SKIPPED — no MAIL_USERNAME] To: {to_addr} | {subject}')
        return

    msg              = MIMEText(body)
    msg['Subject']   = subject
    msg['From']      = Config.MAIL_FROM
    msg['To']        = to_addr

    try:
        with smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT) as smtp:
            smtp.starttls()
            smtp.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
            smtp.send_message(msg)
    except Exception as e:
        print(f'[EMAIL ERROR] {e}')
```

**Test criteria:**
- `python -c "from tasks import send_interview_reminders, send_monthly_report, export_applications_csv"` imports cleanly.
- Calling `send_interview_reminders.delay()` from a Python shell (with worker running) returns a `AsyncResult` without raising.
- Calling `export_applications_csv.delay(1)` with a running worker creates `static/exports/applications_student_1.csv` and a `Notification` row.

---

## Step 6 — Two New Student API Endpoints

Add to `routes/student.py`. These are the only HTTP-facing additions in M7.

```python
from celery.result import AsyncResult

@student_bp.route('/applications/export', methods=['POST'])
@student_required
def trigger_export():
    student = current_student()
    from tasks import export_applications_csv
    result = export_applications_csv.delay(student.id)
    return jsonify({
        'msg':     'Export started. You will receive a notification when your CSV is ready.',
        'task_id': result.id,
    }), 202


@student_bp.route('/applications/export/status/<task_id>')
@student_required
def export_status(task_id):
    from tasks import export_applications_csv
    result = AsyncResult(task_id, app=export_applications_csv.app)
    return jsonify({
        'task_id': task_id,
        'status':  result.status,          # PENDING / STARTED / SUCCESS / FAILURE
        'result':  result.result if result.ready() and not result.failed() else None,
    }), 200
```

**Important:** `POST /api/student/applications/export` must be declared **before**
`GET /api/student/applications` in the file, or Flask's routing will try to match
`export` as an `app_id` integer and raise a 404. Alternatively, keep the same
order and prefix the route: the `/export` segment is distinct enough from
`/<int:app_id>` that Flask will not confuse them — integer converter rejects a
non-numeric segment, so routing is unambiguous regardless of declaration order.

**Update Vue** (`StudentApplications.js`): add an Export button that calls
`POST /api/student/applications/export` and then polls
`GET /api/student/applications/export/status/<task_id>` every 3 seconds until
status is `SUCCESS` or `FAILURE`, then shows the download link from the
notification (or an error toast).

```js
// In methods:
exportCSV: function () {
  var self = this;
  self.exporting = true;
  window.api.post('/student/applications/export')
    .then(function (res) {
      var taskId = res.data.task_id;
      window.showToast('Export started — you will be notified when ready.');
      self._pollExport(taskId);
    })
    .catch(function (err) {
      window.showToast((err.response && err.response.data && err.response.data.msg)
        || 'Export failed.');
      self.exporting = false;
    });
},
_pollExport: function (taskId) {
  var self = this;
  var interval = setInterval(function () {
    window.api.get('/student/applications/export/status/' + taskId)
      .then(function (res) {
        if (res.data.status === 'SUCCESS') {
          clearInterval(interval);
          self.exporting = false;
          window.showToast('CSV ready! Check your notifications for the download link.');
        } else if (res.data.status === 'FAILURE') {
          clearInterval(interval);
          self.exporting = false;
          window.showToast('Export failed. Please try again.');
        }
      })
      .catch(function () { clearInterval(interval); self.exporting = false; });
  }, 3000);
}
```

Add `exporting: false` to `data()` and an Export button in the template:

```html
<button class="btn btn-sm btn-outline-secondary" :disabled="exporting" @click="exportCSV">
  <i class="bi bi-download me-1"></i>{{ exporting ? 'Exporting…' : 'Export CSV' }}
</button>
```

**Test criteria:**
- `POST /api/student/applications/export` with a student token returns `202` with
  a `task_id` string (not null, not empty).
- `GET /api/student/applications/export/status/<task_id>` returns `status: "SUCCESS"`
  once the worker finishes.
- `static/exports/applications_student_<id>.csv` exists and has the correct headers
  and one row per application.
- A `Notification` row exists for the student with a message containing the filename.
- Calling the export endpoint without a token returns `401`.
- Student A cannot poll Student B's task ID and get Student B's result (task IDs
  are opaque UUIDs — there's no student-scoping needed on the status endpoint
  because a random UUID is not guessable, but add a note in code comments).

---

## Step 7 — Run Locally (4 terminals)

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — Celery worker
celery -A celery_worker.celery worker --loglevel=info

# Terminal 3 — Celery beat (cron scheduler)
celery -A celery_worker.celery beat --loglevel=info

# Terminal 4 — Flask
python app.py
```

To manually trigger a scheduled task without waiting for the cron:

```python
# In a Python shell (with all terminals running):
from tasks import send_interview_reminders, send_monthly_report
send_interview_reminders.delay()
send_monthly_report.delay()
```

**Flower** (optional monitoring UI):

```bash
celery -A celery_worker.celery flower   # open http://localhost:5555
```

---

## Step 8 — Polish Pass

1. **`pyflakes tasks.py celery_worker.py config.py`** — expect zero output.

2. **`static/exports/` in `.gitignore`** — add:
   ```
   static/exports/
   !static/exports/.gitkeep
   ```
   Create `static/exports/.gitkeep` so the directory exists in the repo but
   generated CSV files are not committed.

3. **Flask app context in tasks** — the `ContextTask` base class in
   `extensions.make_celery()` pushes an app context before every task call, so
   SQLAlchemy queries inside tasks work without manual `with app.app_context():`
   wrappers. Verify this by confirming `db.session` is accessible inside
   `export_applications_csv` without any explicit context management.

4. **`MAIL_USERNAME` guard** — `_send_email` already skips silently when
   `MAIL_USERNAME` is empty. In dev, check `Notification` records instead of
   looking for actual emails. Set up Mailtrap (free tier) to test real SMTP
   flow: set `MAIL_SERVER=sandbox.smtp.mailtrap.io`, `MAIL_PORT=587`, and
   `MAIL_USERNAME` / `MAIL_PASSWORD` from your Mailtrap inbox credentials.

5. **`celerybeat-schedule` file** — Celery Beat writes a persistent schedule file
   named `celerybeat-schedule` in the current directory. Confirm it's already in
   `.gitignore` (it is — added in M0 setup). Don't commit it.

6. **Graceful degradation** — if Redis is not running, `export_applications_csv.delay()`
   raises `kombu.exceptions.OperationalError`. Wrap the `.delay()` call in a
   try/except in the Flask route and return `503 Service Unavailable` with a
   helpful message rather than a 500.

   ```python
   try:
       result = export_applications_csv.delay(student.id)
   except Exception:
       return jsonify({'msg': 'Export service is currently unavailable. Try again later.'}), 503
   ```

**Commit:** `feat(celery): Celery+Redis background jobs for reminders, monthly report, and CSV export`

---

## Notes Specific to Milestone 7

**`tasks.py` imports `create_app()` at module level.** This means importing
`tasks` anywhere triggers the Flask app factory. That's intentional —
`celery_worker.py` does it explicitly, and the `make_celery` / `ContextTask`
pattern ensures every task runs inside a valid app context. Don't try to import
`tasks` in `routes/student.py` at module level; import inside the route function
instead (as shown in Step 6) to avoid a circular import.

**`shared_task` vs `celery.task`.** The tasks above use `celery.task` directly
(bound to the instance from `make_celery`). If you refactor to `shared_task`
(which is app-agnostic), you need `bind=True` and to call
`self.app.push_context()` manually. Stick with the direct `celery.task` pattern
shown — it's simpler and the `ContextTask` base class handles the context for you.

**CSV overwrites on re-export.** The filename is `applications_student_<id>.csv`
— re-triggering export overwrites the previous file. This is intentional: the
student always gets the latest snapshot, and there's no per-run filename
pollution. If you want per-run files, append a timestamp:
`f'applications_student_{student_id}_{int(datetime.now().timestamp())}.csv'` and
update the notification message.

**Windows users.** Celery's default pool (`prefork`) does not work on Windows.
Start the worker with `--pool=solo` or `--pool=threads` on Windows/WSL1:
```bash
celery -A celery_worker.celery worker --pool=solo --loglevel=info
```

**`static/exports/` must be web-accessible.** Flask serves `static/` by default,
so `/static/exports/applications_student_1.csv` is downloadable from the browser
without any additional route. The notification message includes the full path —
the student clicks it from `StudentNotifications.js` which already renders
messages as plain text. If you want a proper download button, add a route:
`GET /api/student/applications/export/download` that reads the file and streams
it with `send_from_directory`. This is optional since the static path already works.
