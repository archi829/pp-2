# Combined Engineering Issues & Trade-offs Log

This document centralizes all technical challenges, architectural trade-offs, and debugging sessions encountered during the development of the HireSync AI Placement Portal.

## ISSUES LOG MILESTONE 4


Every issue hit during the Milestone 4 (Company API + Vue UI) session — user-reported bugs,
environment/tooling snags, and things that looked like bugs but turned out not to be. Kept
separate from `CHANGES_SUMMARY_MILESTONE_4.md` (which covers what was *built*) so future
debugging starts here instead of re-discovering the same things.

---

## Application bugs (user-reported, fixed in code)

### 1. Scheduling an interview didn't move the applicant into the "Interview Scheduled" tab
**Symptom:** booked an interview via the "Interview" modal on a drive's applicants page. It
showed up correctly on the combined `/company/interviews` page, but the same drive's
applicants page still showed `0` under the "Interview Scheduled" status tab.

**Root cause:** the combined Interviews page reads straight from the `Interview` table.
The tab counts on the drive-specific page count by `Application.status`. Creating an
`Interview` record never touched `Application.status` — the two were fully decoupled.

**Fix:**
- `routes/company.py`, `create_interview()` — after creating the `Interview` row, auto-advance
  `Application.status` to `'Interview Scheduled'`, unless the application is already
  `Selected`/`Rejected`/`Placed` (guard against undoing a final decision).
- `DriveApplicants.js`, `submitInterview()` — now calls `fetchApplications()` on success so the
  table/tab counts refresh immediately instead of needing a manual reload.

**Verified:** scheduled an interview on a `Shortlisted` applicant → count moved
`Interview Scheduled: 0 → 1`, `Shortlisted: 2 → 1` on the drive page; combined Interviews page
still showed it too. Also confirmed the guard: scheduling an interview for an already-`Rejected`
applicant leaves them at `Rejected`, doesn't move them.

---

### 2. Rejecting a candidate left their scheduled interview stale
**Symptom:** booked an interview, then rejected that same candidate from the drive-specific
applicants page. The `Interview` row on the combined Interviews page kept saying `Scheduled`
forever — no longer reflected reality.

**Root cause:** rejecting an application (`PUT /applications/<id>/status`) never looked at
that application's `Interview` records at all.

**Fix:** `routes/company.py` — added `_cancel_scheduled_interviews(application)`, which flips
any of that application's interviews still in `Scheduled` state to `Cancelled`. Called from
both `update_status` (single) and `bulk_update_status` (bulk) whenever `new_status ==
'Rejected'`. Deliberately guarded to only touch interviews still `Scheduled` — an interview
already manually marked `Completed` is left untouched even if the candidate is rejected
afterward, so real history doesn't get silently erased.

**Verified:**
- Schedule → reject → combined Interviews page flips `Scheduled → Cancelled`. ✅
- Manually mark an interview `Completed` → reject the same candidate anyway → interview stays
  `Completed`, not overwritten. ✅

**Deliberately not done:** no symmetric auto-behavior when a candidate is marked `Selected`
(e.g. auto-completing their interview). Left as a manual action on the Interviews page —
assuming "Selected implies the interview happened" felt like guessing at intent that wasn't
asked for.

---

### 3. Status dropdown could set "Interview Scheduled" without ever creating an Interview
**Symptom:** after Fix 1 shipped, picking "Interview Scheduled" directly from the plain
per-row status `<select>` (instead of using the "Interview" button) still worked — it changed
the label with no real `Interview` record behind it, contradicting Fix 1's whole premise that
`Interview Scheduled` implies a real booked interview exists.

**Root cause:** the plain status-update endpoint (`PUT /applications/<id>/status`) allowed any
of `ApplicationStatus.VALID_TRANSITIONS` except `Selected` — `Interview Scheduled` was still
in that allowed set.

**Fix:**
- `routes/company.py` — `STATUS_TRANSITIONS` now excludes `INTERVIEW_SCHEDULED` as well as
  `SELECTED`. `PUT /applications/<id>/status` and the bulk endpoint both return `400` if you
  try to set it directly, with a message pointing at `POST /interviews` (requires a real
  `scheduled_at`).
- `DriveApplicants.js` + `CompanyStudentProfile.js` — removed `'Interview Scheduled'` from
  both components' `statusOptions`. The "Interview" modal is now the only UI path to that
  status.

**Verified:** direct `PUT status: "Interview Scheduled"` → `400` with the redirect message;
normal transitions (`Shortlisted`, etc.) still work; actual `POST /interviews` still correctly
sets `application_status: "Interview Scheduled"` in its response; bulk endpoint blocks the
same way.

**Known minor gap, not fixed:** `CompanyStudentProfile.js` has no scheduling modal of its own
(only the drive-specific applicants page does). An application already sitting at "Interview
Scheduled" shows its status dropdown there with no matching option pre-selected — cosmetic
only, doesn't let you break anything. Flagged, not resolved — open question is whether that
page should instead show a read-only note for that status, like it already does for
Selected/Placed.

---

## Non-issues (investigated, confirmed not a bug)

### 4. Cross-company student-profile check returned 200 instead of the expected 404
While testing `GET /api/company/student/<id>/profile`'s ownership scoping, logged in as
Global Finance and hit a student ID expected to 404 (never applied to Global Finance).
Got `200` instead.

**Investigated:** queried the seed data directly. That student *had* actually applied to a
Global Finance-owned drive too — `init_db.py` randomly assigns each student to 2–4 drives out
of 5 total, split across 2 approved companies, so cross-company overlap is common by design of
the seed data, not a security hole. Re-ran the applications list for that student under the
Global Finance token and confirmed it was correctly scoped to only the one drive that actually
belonged to them (not a leaked full list). Tried to construct a genuine zero-overlap
student/company pair from the seed data and couldn't — every student had applied to at least
one drive from each company, purely from the random seeding.

**Conclusion:** the `_has_applied_to_company()` ownership check is correct; the seed data just
doesn't produce a clean negative test case. Not touched.

---

## Environment / tooling issues (sandbox-specific, not app bugs)

### 5. `instance/` folder — wrong SQLite file
Flask-SQLAlchemy resolves the relative URI `sqlite:///placement_portal.db` against the `instance/`
folder, not the app/repo root. The live database is `instance/placement_portal.db`. Querying
`placement_portal.db` at the repo root (a stale/empty file) gave `no such table: placement`
errors that looked like the app had silently failed to write data, when actually the write had
succeeded — I was just reading the wrong file.

**Fix:** always query `instance/placement_portal.db` when inspecting data directly.

### 6. Background server processes don't survive across separate tool calls
Starting `python app.py &` in one shell command and then trying to `curl` it in a *separate*
tool call failed with `Connection refused` — the background process didn't persist between
calls in this sandbox.

**Fix:** every verification run in this session started the server and ran its `curl` tests in
one combined shell command (`(python app.py &) && sleep 3 && curl ...`), never split across
calls.

### 7. `sqlite3` CLI not installed
Tried `sqlite3 placement_portal.db "select ..."` to inspect data directly — command not found.

**Fix:** used Python's built-in `sqlite3` module instead (`python3 -c "import sqlite3; ..."`).

### 8. `/bin/sh` doesn't support bash-only syntax
Used `${TOKEN:0:20}` (bash substring syntax) in a test script — failed with `Bad substitution`
because the sandbox's shell is dash (`/bin/sh`), not bash.

**Fix:** avoided bash-specific syntax in test scripts; stuck to POSIX-compatible shell.

### 9. `python3` not recognized in the user's local Windows/Git Bash environment
User ran a `curl | python3 -c "..."` token-extraction pipeline locally (Windows, Git Bash,
inside an activated `venv`) and got Windows' "Python was not found... Microsoft Store" message
instead of output — `python3` isn't aliased on their system, only `python` is (standard for
Windows Python installs). The pipeline failed silently, `TOKEN` ended up empty, and the
follow-up `curl` sent `Authorization: Bearer ` with nothing after it, producing an unrelated-
looking "Bad Authorization header" error.

**Fix:** use `python` instead of `python3` in any local (non-sandbox) command shared with this
user going forward — or skip the JSON-parsing pipeline entirely and have them read the raw
`access_token` field off the login response by eye.

### 10. Misleading browser console errors: `adblock360.com`, `in-browser-notifications`
User saw a wall of red console errors on `localhost:5000` — CORS failures, failed fetches,
`sharebx.js`, `cssjs` — and asked if it was from the Milestone 4 changes.

**Investigated:** grepped the entire repo for `adblock360`, `in-browser-notifications`, and
`sharebx` — zero matches anywhere in the codebase.

**Conclusion:** a browser extension (ad-blocker/notification-injector type) auto-injecting
into every page including localhost, unrelated to this app. Not a code issue. Confirmed by
having the user check in an Incognito window (extensions off by default).

---

## Pre-existing data/fixture gaps (flagged, deliberately not "fixed" as a side effect)

- `init_db.py` seeds some applications with the legacy status string `'Interview'` instead of
  `'Interview Scheduled'` (predates `constants.py`'s rename). These rows don't match any tab
  filter except "All" — not a regression from this session's work, just old seed data that
  was never updated when the constant was renamed.
- `Student.resume_path` values in seed data point at `resume1.pdf`...`resume5.pdf`, but none of
  those files actually exist under `static/uploads/resumes/` (only `.gitkeep` is there). Every
  resume-view endpoint (admin, company, student's own) correctly returns a clean `404` for
  these — verified this doesn't crash — but there's nothing real to view in a demo until actual
  PDF files are added to that folder.

Neither of these was touched, since fixing them wasn't asked for and doing so silently as a
side effect of an unrelated bug fix would be the kind of "helpful" surprise that's actually not
helpful.


---

## ISSUES LOG M5 M6


Chronological log of bugs and unexpected behaviour hit during development,
what caused them, and how they were fixed.

---

## M5 Issues

---

### Issue 1 — `base.html` still referenced old student URL routes after deletion

**Where:** `templates/base.html`

**What happened:** After deleting all six `templates/student/*.html` files,
`grep` found that `base.html` still contained `url_for('student.dashboard')`,
`url_for('student.drives')`, `url_for('student.history')`, and
`url_for('student.profile')` inside the navbar's `{% elif current_user.__class__.__name__ == 'Student' %}` block.

**Why it mattered:** Flask would throw a `BuildError` at startup if those
`url_for` calls were evaluated (they reference blueprints whose routes no
longer existed as Jinja2 endpoints). Even if the app didn't crash immediately,
any Jinja2 template rendering that hit that block would fail.

**Resolution:** Confirmed that nothing extended `base.html` anymore (all three
roles had moved to Vue). Deleted `base.html` entirely.
`templates/` now contains only `index.html`.

---

### Issue 2 — `ComingSoon` student placeholder caused infinite redirect loop

**Where:** `static/js/router.js`

**What happened:** Before M5, the student block was a single placeholder route:
```js
{ path: '/student/dashboard', component: ComingSoon, meta: { role: 'student' } }
```
After login, the router's `beforeEach` guard checked the role, found `student`,
and pushed to `/student/dashboard`. The route existed, so it rendered ComingSoon.
Fine in M4. But once the real student routes were added as nested children under
`/student`, the old placeholder line had to be removed entirely — leaving it
alongside the new nested block caused Vue Router to match two routes for
`/student/dashboard` and behave unpredictably.

**Resolution:** Removed the ComingSoon placeholder line and replaced the entire
student block with the real nested `StudentLayout` structure including all 8
child routes.

---

### Issue 3 — Resume upload broke the shared axios `Content-Type`

**Where:** `static/js/components/student/StudentProfile.js`

**What happened:** The first attempt at the resume upload used `window.api.post`
with a `FormData` object but let the shared axios instance keep its default
`Content-Type: application/json` header. The server received the file field as
an empty string because the body was not parsed as multipart.

**Why it happened:** `window.api` (axios instance) has `Content-Type:
application/json` set globally. Passing `FormData` to axios normally causes it
to auto-set `multipart/form-data` with the correct boundary — but only if you
don't override `Content-Type` manually. The shared instance's default header was
interfering.

**Resolution:** Explicitly passed `{ headers: { 'Content-Type': undefined } }`
in the per-request config so axios cleared the default and set the multipart
boundary itself:
```js
window.api.post('/student/profile/resume', formData, {
  headers: { 'Content-Type': undefined }
})
```

---

### Issue 4 — Resume stream opened as blank tab (wrong content-type assumed)

**Where:** `static/js/components/student/StudentProfile.js` — `viewResume()`

**What happened:** An early version of `viewResume` created the blob with a
hardcoded `type: 'application/pdf'`. For `.doc`/`.docx` resumes the browser
opened a blank or garbled tab.

**Resolution:** Read the actual content-type from the response header instead
of assuming:
```js
var contentType = (res.headers && res.headers['content-type'])
  || 'application/octet-stream';
var blob = new Blob([res.data], { type: contentType });
```

---

### Issue 5 — `apply()` duplicate check used pre-check instead of catching `IntegrityError`

**Where:** `routes/student.py` — `apply()`

**What happened:** The first implementation queried `Application.query.filter_by()`
before inserting to check for a duplicate. This is a TOCTOU race — two
simultaneous clicks could both pass the check and then both try to insert,
causing an unhandled `500` from SQLAlchemy's `IntegrityError`.

**Resolution:** Removed the pre-check. Let the `UniqueConstraint` do its job,
wrap `db.session.commit()` in a `try/except IntegrityError`, rollback, and
return `409`:
```python
try:
    db.session.commit()
except IntegrityError:
    db.session.rollback()
    return jsonify({'msg': 'You have already applied for this drive.'}), 409
```

---

### Issue 6 — `$set` grep returned false negative

**Where:** Verification script during polish pass

**What happened:** The check for Vue 2's `this.$set(...)` calls used a regex
with `\$set` which Python's `re.search` treats as a literal backslash + `$set`.
The grep returned `MISSING` even though both files had the calls.

**Resolution:** Used `grep -c '\$set'` in bash instead. Confirmed 3 calls in
`DriveApplicants.js` and 5 calls in `StudentApplications.js`. The Python regex
was the problem, not the files.

---

## M6 Issues

---

### Issue 7 — `application.id` was `None` when writing the first status log row

**Where:** `routes/student.py` — `apply()`

**What happened:** After adding `ApplicationStatusLog`, the initial `Applied`
log row was written immediately after `db.session.add(application)`:
```python
db.session.add(application)
_log_status(application.id, None, ApplicationStatus.APPLIED, ...)  # application.id = None here!
db.session.commit()
```
SQLAlchemy does not populate `id` (auto-increment PK) until the row is flushed
to the database. The `application_status_log.application_id` FK column received
`None`, violating the `nullable=False` constraint and throwing an `IntegrityError`.

**Resolution:** Added `db.session.flush()` between the add and the log call.
`flush()` sends the INSERT to the DB (within the current transaction) and
populates `application.id` without committing. The existing `IntegrityError`
catch on `db.session.commit()` still handles the duplicate-application race
condition correctly:
```python
db.session.add(application)
try:
    db.session.flush()   # populates application.id
    _log_status(application.id, None, ApplicationStatus.APPLIED, 'student', student.id)
    db.session.commit()
except IntegrityError:
    db.session.rollback()
    return jsonify({'msg': 'You have already applied for this drive.'}), 409
```
The same `flush()` pattern was applied in `init_db.py` when seeding log rows
for all seeded applications.

---

### Issue 8 — Same-status update returned `400` instead of `200` no-op

**Where:** `routes/company.py` — `update_status()`

**What happened:** After replacing `STATUS_TRANSITIONS` with `FORWARD_TRANSITIONS`,
a company saving the same status (e.g. `Applied → Applied`, no change) hit the
transition check:
```python
allowed = FORWARD_TRANSITIONS.get('Applied', set())  # = {'Shortlisted', 'Rejected'}
if 'Applied' not in allowed:   # True — 'Applied' is not in that set
    return 400
```
The old code had `if application.status != new_status:` which silently no-oped.
The new code checked the transition before that guard.

**Resolution:** Added an early-return short-circuit before the `FORWARD_TRANSITIONS`
check:
```python
if application.status == new_status:
    payload = serialize_application(application)
    payload['msg'] = 'Status unchanged (already set to this value).'
    return jsonify(payload), 200
```
The Vue layer also prevents this with `if (app._newStatus === app.status) return;`
but the server-side guard is necessary for API callers that bypass the UI.

---

### Issue 9 — `ApplicationStatusLog` imported in `admin.py` but unused

**Where:** `routes/admin.py`

**What happened:** `ApplicationStatusLog` was added to the import line in
`admin.py` because the history endpoints use `application.status_log` (the
relationship). But accessing a SQLAlchemy relationship does not require
importing the related model's class directly into the calling file — SQLAlchemy
resolves it at query time from `models.py`. `pyflakes` flagged it as an unused
import.

**Resolution:** Removed `ApplicationStatusLog` from the import in `admin.py`.
The `status_log` relationship on `Application` works without it being imported
in the route file.

---

### Issue 10 — `init_db.py` seeded `'Interview'` instead of `'Interview Scheduled'`

**Where:** `init_db.py`

**What happened:** The original seeder had:
```python
statuses = ['Applied', 'Shortlisted', 'Interview', 'Selected', 'Rejected']
```
But `constants.py` defines `ApplicationStatus.INTERVIEW_SCHEDULED = 'Interview Scheduled'`.
The mismatch meant:
- The "Interview Scheduled" count card in `StudentApplications.js` always showed 0.
- The `FORWARD_TRANSITIONS` check failed silently on seeded data (no valid
  forward path from the non-standard `'Interview'` string).
- `GET /api/student/interviews` never matched seeded applications because it
  joins through `Interview` records, not the status string — but the display
  inconsistency was still confusing during testing.

**Resolution:** Fixed the seeder list:
```python
statuses = ['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected']
```
Also fixed the matching `Notification` filter which had the same hardcoded
`'Interview'` string.

---

### Issue 11 — `<tbody>` needed `<template v-for>` not `<tr v-for>` for history expansion rows

**Where:** `StudentApplications.js` and `DriveApplicants.js`

**What happened:** History expansion requires two sibling `<tr>` elements per
application: the main data row and the expandable history row below it. Vue 2
does not allow `v-for` directly on a `<tr>` when you need multiple sibling
elements. The first attempt used:
```html
<tr v-for="a in applications" :key="a.id"> ... </tr>
<tr v-if="isExpanded(a.id)"> ... </tr>  <!-- 'a' not in scope here -->
```
Vue threw a compile warning and `a` was undefined in the second row.

**Resolution:** Wrapped both rows inside `<template v-for>`, which Vue 2 renders
as an invisible wrapper (no DOM element), allowing multiple sibling elements
per iteration:
```html
<template v-for="(a, idx) in applications">
  <tr :key="a.id"> ... </tr>
  <tr v-if="isExpanded(a.id)" :key="'h-' + a.id"> ... </tr>
</template>
```
Each `<tr>` must have its own unique `:key` — using `a.id` for the main row
and `'h-' + a.id` for the history row.

---

### Issue 12 — Bulk update on a terminal-status application caused silent data corruption

**Where:** `routes/company.py` — `bulk_update_status()`

**What happened:** Before `FORWARD_TRANSITIONS` enforcement, bulk-marking
a set of applications as `Shortlisted` would also update any `Rejected` or
`Selected` applications in that batch. A `Selected` application re-marked as
`Shortlisted` left an orphaned `Placement` row (the Placement still existed
but the Application status said `Shortlisted`).

**Resolution:** Added per-application transition validation inside the bulk
loop. Applications whose current status is not in `FORWARD_TRANSITIONS` for
the target status are skipped and their IDs are returned in a `skipped_ids`
list:
```python
allowed = FORWARD_TRANSITIONS.get(app.status, set())
if new_status not in allowed:
    skipped_ids.append(app.id)
    continue
```
The response body now always includes both `updated_ids` and `skipped_ids`
so the caller can surface a partial-success message.

---

## Summary Table

| # | Milestone | File | Root Cause | Fix |
|---|-----------|------|------------|-----|
| 1 | M5 | `templates/base.html` | Still had `url_for('student.*')` refs after deletion | Deleted `base.html` |
| 2 | M5 | `router.js` | Old ComingSoon placeholder conflicted with new nested block | Removed placeholder, added real nested block |
| 3 | M5 | `StudentProfile.js` | Shared axios `Content-Type` overrode multipart boundary | Pass `{ headers: { 'Content-Type': undefined } }` per-request |
| 4 | M5 | `StudentProfile.js` | Hardcoded `application/pdf` for blob creation | Read `content-type` from response header |
| 5 | M5 | `student.py` `apply()` | TOCTOU race on duplicate check | Remove pre-check; catch `IntegrityError` → `409` |
| 6 | M5 | Verification script | Python `re.search` escaped `$` incorrectly | Used `grep -c '\$set'` in bash |
| 7 | M6 | `student.py` `apply()` | `application.id` is `None` before flush | Added `db.session.flush()` before `_log_status()` |
| 8 | M6 | `company.py` `update_status()` | `FORWARD_TRANSITIONS` check fired before same-status guard | Added same-status early `200` return before transition check |
| 9 | M6 | `admin.py` | Unused `ApplicationStatusLog` import flagged by pyflakes | Removed import; relationship resolves without it |
| 10 | M6 | `init_db.py` | Seeded `'Interview'` instead of `'Interview Scheduled'` | Fixed string in statuses list |
| 11 | M6 | `StudentApplications.js`, `DriveApplicants.js` | `v-for` on `<tr>` can't produce sibling rows | Wrapped both rows in `<template v-for>` |
| 12 | M6 | `company.py` `bulk_update_status()` | No transition check left orphaned `Placement` rows | Skip invalid transitions, return `skipped_ids` in response |


---

## ISSUES LOG M7 M8


Chronological log of real issues hit while building and testing Celery/Redis background
jobs (M7) and Redis caching (M8), plus the gap-analysis findings against the official
grading rubrics. Excludes cosmetic/style notes already covered inline in the milestone
docs — this file is bugs, crashes, and scope gaps only.

---

## Milestone 7 — Celery + Redis Background Jobs

### Issue 1 — `celery_worker.py` would have started with zero tasks registered
**Found:** during initial implementation, before ever reaching the user.
**Symptom (if shipped unfixed):** `celery -A celery_worker.celery worker` would start
successfully but show an empty `[tasks]` block, and any `.delay()` call would fail with
"received unregistered task."

**Root cause:** the original design had both `tasks.py` and `celery_worker.py`
independently call `create_app()`. Each call builds a brand-new `Flask` app and, via
`make_celery(app)`, a brand-new `Celery` instance. The `@celery.task` decorators in
`tasks.py` bind explicitly to *that* file's own `Celery` object — a second,
independently-created `Celery` object in `celery_worker.py` has an empty task registry,
since Celery doesn't share task registration across separate instances by default.

**Resolution:** `celery_worker.py` was changed to import the already-built instance
directly from `tasks.py` (`from tasks import celery, flask_app`) instead of calling
`create_app()` a second time. Verified by listing `celery_worker.celery.tasks` and
confirming all task names appear.

**Status:** ✅ Fixed before first delivery. No user impact.

---

### Issue 2 — `fpdf2` crashed on an em-dash in the report title
**Found:** first real test run of `send_monthly_report()` against seeded data.

```
FPDFUnicodeEncodingException: Character "—" at index ... in text is outside the range
of characters supported by the font used
```

**Root cause:** `fpdf2`'s built-in core fonts (Helvetica, etc.) only support the
Latin-1 character set. The PDF subtitle string used an em-dash (`—`, U+2014), which
isn't in Latin-1.

**Resolution:** added a `_pdf_safe()` helper in `reports.py` that encodes any text
headed into the PDF as Latin-1 with `errors='replace'` before it reaches `pdf.cell()`.
Applied to every text value passed into `build_pdf_report()` — not just the two strings
that happened to crash first — because company names, student names, and job titles are
real user input and could contain curly quotes, emoji, or non-Latin scripts, any of
which would crash the same way in production. The HTML email body (not subject to this
font limitation) always keeps the original, unmodified text — only the PDF degrades.

**Status:** ✅ Fixed and verified — re-ran both `send_monthly_report()` and
`export_company_data_csv()` successfully afterward, PDF confirmed valid via `file`.

---

### Issue 3 — Company CSV export tried to read a `Placement.student` relationship that doesn't exist
**Found:** writing the "Placements" section of `export_company_data_csv()`.

**Root cause:** `models.py`'s `Placement` model has a `student_id` foreign key but no
`db.relationship('Student', ...)` back-reference — unlike `Application`, which does have
a `student` relationship via its own model. First draft used
`p.student if hasattr(p, 'student') else None`, which would silently fall back to
printing the raw numeric ID instead of the student's name in every single row (a
`hasattr` check on a nonexistent attribute is always `False`, so this never actually
looked up anything).

**Resolution:** changed to an explicit `Student.query.get(p.student_id)` lookup per row.

**Status:** ✅ Fixed before delivery, verified in the actual generated CSV output
(names appeared correctly, not raw IDs).

---

### Issue 4 — `reports.py` never made it into the user's actual repo
**Found:** user ran `send_monthly_report.delay()` and hit:
```
ModuleNotFoundError: No module named 'reports'
```

**Root cause:** `reports.py` was built and delivered as part of a separate
`milestone7_gaps_closed.zip` (the follow-up work that added per-company reports and the
company CSV export), not the original `milestone7_files.zip`. The user had applied the
first zip but not yet copied `reports.py` out of the second one into the live repo.

**Resolution:** copy `reports.py` into the repo root (same level as `app.py`), confirm
`fpdf2` is installed, and — important — **restart the Celery worker process**. A running
worker had already imported `tasks.py` once at startup (and cached the failed import);
simply fixing the file on disk doesn't make an already-running worker re-import it.

**Status:** ✅ Resolution given to user; awaiting confirmation of successful re-run.

---

### Issue 5 (environment/testing artifact, not an app bug) — Background Flask/Redis processes died between separate sandbox tool calls
**Found:** while smoke-testing the export endpoints against a running Flask server in
this development sandbox.

**Root cause:** the sandbox's tool-call boundary doesn't preserve background (`&`)
processes started in one shell invocation into the next — a `python app.py &` from one
command was gone by the next command. This is specific to the Claude sandbox execution
model, not the actual application or the user's own machine (confirmed the user's own
WSL terminal setup worked fine with long-running `celery worker` / `python app.py`
processes in separate terminals, as instructed).

**Resolution:** combined server-start + curl-test sequences into single shell
invocations (`server & sleep 2; curl ...; kill %1`) for sandbox testing purposes only.

**Status:** ℹ️ No code change — testing methodology adjustment only.

---

### Gap 1 — Initial M7 implementation only satisfied about half the official rubric
**Found:** user supplied the actual grading rubric text after the first M7 delivery.

**Details:**
| Rubric requirement | Initial state |
|---|---|
| Celery + Beat + Redis setup | ✅ done |
| Interview reminders (Email) | ✅ done |
| Placement report — HTML/PDF, sent to companies, with analytics | ❌ was plain-text, admin-only, basic counts |
| CSV export — students **and companies** | ❌ company side didn't exist at all |

**Resolution:** rewrote `send_monthly_report()` to produce a styled HTML email body +
PDF attachment (via `fpdf2`), sent to both the admin (platform-wide) and every
`Approved` company (scoped to their own drives, with a per-drive breakdown table); added
a new `export_company_data_csv()` task covering applicants, placements, and an analytics
summary section (status breakdown, selection rate, placement rate); added
`POST /api/company/export`, `GET /api/company/export/status/<id>`, and
`GET /api/company/notifications` to `routes/company.py`; added a `CompanyNotifications.js`
page and wired an Export button into `CompanyDashboard.js`.

**Status:** ✅ Closed — re-verified against the rubric line-by-line after the rewrite.

---

### Flagged, not fixed — `init_db.py` doesn't seed any `Placement` rows
**Found:** while testing `send_monthly_report()` / `export_company_data_csv()` against a
freshly-seeded DB — both correctly returned zero placements, because none exist in the
seed data even for applications already marked `Selected`.

**Decision:** flagged to the user rather than silently modified, per the project's own
established convention (`docs/CHANGES_SUMMARY_MILESTONE_4.md` explicitly calls out the
same "flag it, don't silently fix `init_db.py` as a side effect" policy for a different
pre-existing seed-data gap). A manual test `Placement` row was created directly via a
throwaway script for verification purposes only — not committed to `init_db.py`.

**Status:** ⚠️ Open / by design — will show real data as soon as any company runs the
Select flow at least once through the actual UI or API.

---

## Milestone 8 — Redis Caching

### Design risk caught before it became a bug — naive `@cache.cached` decorator would have leaked per-student data
**Found:** while reviewing the original planning doc's Step 2 design
(`@cache.cached` directly on `GET /api/student/drives`) against the actual response
shape of that endpoint.

**Root cause:** `GET /api/student/drives` returns both the shared drive list (identical
for every student who hasn't searched) *and* that specific student's own
`applied_drive_ids`. A `@cache.cached` decorator caches the entire rendered JSON
response keyed by the cache key — if the key doesn't vary per student, the **first**
student to hit the endpoint would have their personal "already applied to these drives"
list served to every subsequent student hitting the same cached key.

**Resolution:** implemented manual caching instead of the decorator — cache only the
shared, non-personal `serialized` drive list (via `safe_get`/`safe_set` helpers in
`cache_keys.py`), and merge in each student's own `applied_drive_ids` freshly on every
request, outside the cached portion.

**Status:** ✅ Avoided — no data leak ever shipped. Verified by design review, not by
reproducing the leak.

---

### No other bugs — verified working against real Redis
Unlike Milestone 7, the Milestone 8 implementation was tested successfully against a
live `redis-server` instance in the sandbox on the first attempt:
- Cache hit/miss timing difference confirmed (`0.011s` → `0.003s` on repeat calls)
- Invalidation confirmed end-to-end: approving a pending company immediately corrected a
  previously-cached search result (`2 pending` → `1 pending`, not stale for the full TTL)
- Drive approve/reject/re-approve round-trip confirmed the student-facing drives cache
  updates immediately each time (`5 → 4 → 5` drives)
- Confirmed Redis DB 0 (Celery broker) and DB 1 (cache) stay isolated from each other

**Status:** ✅ No open issues.

---

### Pre-existing, unrelated — `routes/decorators.py` has an unused `Admin` import
**Found:** during the M8 final `pyflakes` sweep.

**Decision:** not part of Milestone 7 or 8's scope (that file wasn't touched by either
milestone) — flagged rather than fixed, to keep this milestone's diff limited to what it
actually claims to change.

**Status:** ⚠️ Open, cosmetic, no functional impact.


---

## RECENT PRODUCTION UPGRADE ISSUES (Docker, CI/CD, Groq AI)

### 1. Redis Cache Leak on Student Dashboard
**Found:** During the implementation of Redis caching for student drives.
**Issue:** If the `/api/student/drives` endpoint was naively decorated with `@cache.cached`, the first student to log in would cache their personal `applied_drive_ids` list. Subsequent students would receive the first student's personalized list.
**Resolution:** Implemented layered caching. The shared list of drives is serialized and cached in Redis. The endpoint retrieves this shared list, and then makes a separate, fast database query to fetch the specific student's `applied_drive_ids` to merge at runtime, preventing PII leaks.

### 2. Celery Worker Database Context Crashing
**Found:** When moving email notifications and PDF generation to background workers.
**Issue:** Celery tasks failed with `RuntimeError: Working outside of application context` when attempting to query the SQLite database.
**Resolution:** Implemented a custom `ContextTask` class inheriting from `celery.Task` that automatically pushes a Flask app context (`with app.app_context():`) before executing `self.run()`.

### 3. PDF Font Limitations with fpdf2
**Found:** Generating the AI resume PDFs in the background worker.
**Issue:** `fpdf2` core fonts only support Latin-1 characters. User-provided data (e.g., job titles with em-dashes) crashed the Celery task with a Unicode encoding exception.
**Resolution:** Created a `_pdf_safe()` sanitation pipeline that intercepts all user strings and safely encodes them to Latin-1 with `errors='replace'` before sending them to the PDF generator.

### 4. Pytest Mocking and Empty Databases
**Found:** Creating the automated CI test suite.
**Issue:** `test_public_stats_returns_200` failed because the in-memory SQLite database was completely empty, causing `total_students` to assert 0 instead of 1.
**Resolution:** Passed the `seed_data` pytest fixture directly into the test arguments, which automatically sets up a baseline admin, company, student, and drive in the in-memory database before the test runs.
