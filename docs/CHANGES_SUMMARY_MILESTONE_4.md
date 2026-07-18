# Milestone 4 (Company API + Vue UI) — Full Change Log

Covers everything done in this session: the 5-step build-out of Milestone 4 against the
`archi829/pp-2` repo, plus three follow-up bug fixes found during manual testing after the
milestone was marked done. Written for a future conversation/session to pick up context
without re-reading the whole thread.

---

## Step 1 — Backend: `routes/company.py`

**Rewrote the entire file** from Flask-Login + `render_template` (MAD1) to a pure JSON API
under `/api/company`, matching the conventions already established in `routes/admin.py`
(Milestone 3): bare-array list responses, flat mutation responses (`{...serialized_object,
'msg': ...}`), serializer helper functions at the top of the file, `current_company()` helper.

Endpoints implemented (18 total): dashboard, profile get/update, drives full CRUD + status
toggle, drive applications list (tab/sort/counts), application status update (single + bulk),
select-to-Placement flow, interviews create/list/update, company-scoped student profile +
resume view.

Key design decisions:
- `STATUS_TRANSITIONS` = `VALID_TRANSITIONS` minus `SELECTED` (later also minus
  `INTERVIEW_SCHEDULED` — see Fix 3 below) — those two statuses require creating a real
  record (Placement / Interview) and can't be set as a bare label via the plain status
  endpoint.
- `select_application` creates a `Placement` row, is idempotent (checking for an existing
  Placement by `student_id`+`drive_id` before inserting, so double-submitting doesn't create
  duplicates).
- Ownership checks (`company_id == get_jwt_identity()`) on every drive/application/interview/
  student lookup.

---

## Step 2 — Frontend: Layout, Dashboard, Profile

**New files:**
- `static/js/components/CompanyLayout.js` — navbar shell (Dashboard / Post Drive / Profile
  at this point; Interviews link added in Step 4).
- `static/js/components/company/CompanyDashboard.js` — stat cards (Total/Active/Pending
  drives, Total Applicants) that filter the drives table client-side on click; drive table
  with Edit/Close/Re-open/Delete wired to real endpoints, `confirm()` on Close/Delete.
- `static/js/components/company/CompanyProfile.js` — edit form for
  `hr_contact`/`industry`/`website`/`description` (name/email locked), inline success banner.

**Modified:** `static/js/router.js` (nested `/company` route block, same shape as `/admin`),
`templates/index.html` (script tags).

---

## Step 3 — Frontend: Drive CRUD

**New file:** `static/js/components/company/CompanyDrives.js` — single component handling
both `drives/new` (create) and `drives/:id/edit` (edit, prefilled via GET), with client-side
future-date validation on top of the backend's.

**Modified:** `router.js`, `index.html` (wired the two routes that were `ComingSoon`).

---

## Step 4 — Frontend: Applicants, Interviews, Student Profile

**New files:**
- `static/js/components/company/DriveApplicants.js` — status tabs + CGPA/date sort
  (query-string-synced), select-all + bulk status update, per-row status dropdown, resume
  blob download (content-type read from response headers, not assumed), a modal for marking
  someone Selected (position/salary/joining_date → creates Placement), and a "Schedule
  Interview" modal per row.
- `static/js/components/company/CompanyStudentProfile.js` — company-scoped student view
  (adapted from `AdminStudentDetail.js`), resume download, per-application status update.
  **Not explicitly listed in the original milestone doc's "Files added"** but required by the
  spec's "clicking a student name navigates to a profile view" behavior — added it anyway.
- `static/js/components/company/CompanyInterviews.js` — read/manage-all interview list
  across all of the company's drives, inline status update (Scheduled/Completed/Cancelled).

**Modified:** `CompanyLayout.js` (added Interviews nav link), `router.js`, `index.html`.

---

## Step 5 — Polish pass

- Audited all 6 company components — all use `<loading-spinner>`/`<error-alert>` consistently.
- Ran `pyflakes` + an AST-based check on `routes/company.py` — no unused imports.
- **Deleted** `templates/company/*.html` (all 5 files: `applications.html`, `create_drive.html`,
  `dashboard.html`, `edit_drive.html`, `student_profile.html`).
- **Modified** `templates/base.html` — removed the `{% elif ... == 'Company' %}` nav branch.
- Confirmed zero `url_for('company...` references left anywhere in `templates/`.
- Live-tested a mid-session blacklist (admin blacklists a company while its JWT is still
  valid) → confirmed clean `403` with the exact message `config.js`'s toast interceptor
  expects.
- Full regression pass: fresh `init_db.py`, fresh server, every company `.js` file 200s, SPA
  fallback still serves `index.html` for `/company/*` deep links even with the Jinja templates
  gone.

---

## Post-milestone bug fixes (found via manual testing, not part of the original 5 steps)

### Fix 1 — Scheduling an interview didn't update the application's status
**Symptom:** the combined `/interviews` page showed a scheduled interview correctly, but the
drive-specific applicants page still showed `0` under the "Interview Scheduled" tab, because
that tab counts by `Application.status`, and creating an `Interview` record never touched it.

**Fix (`routes/company.py`, `create_interview`):** after creating the `Interview` row, if the
application's current status isn't already `Selected`/`Rejected`/`Placed`, auto-advance it to
`'Interview Scheduled'`. Response payload now includes `application_status` so the frontend
knows the new value.

**Fix (`DriveApplicants.js`):** `submitInterview()` now calls `fetchApplications()` after a
successful schedule, so the table/tab counts update immediately instead of needing a refresh.

### Fix 2 — Rejecting a candidate left their scheduled interview stale
**Symptom:** book an interview, then reject the candidate from the drive page → the
`Interview` row still said `Scheduled` on the combined Interviews page forever.

**Fix (`routes/company.py`):** added `_cancel_scheduled_interviews(application)` helper —
walks the application's interviews and flips any still `Scheduled` to `Cancelled`. Called
from both `update_status` and `bulk_update_status` whenever `new_status == 'Rejected'`.
**Deliberately only touches interviews still in `Scheduled` state** — if a company already
manually marked one `Completed`, a later rejection won't overwrite that.

Not done (by choice, not oversight): no symmetric auto-behavior for marking someone
`Selected` (e.g. auto-completing their interview) — left as a manual action on the
Interviews page since assuming "Selected implies interview happened" felt like guessing at
intent that wasn't asked for.

### Fix 3 — Status dropdown could set "Interview Scheduled" without ever creating an Interview
**Symptom:** picking "Interview Scheduled" from the plain per-row status dropdown (instead of
using the "Interview" button) changed the label with no `Interview` record behind it —
inconsistent with Fix 1's assumption that status `Interview Scheduled` implies a real booked
interview exists.

**Fix (`routes/company.py`):** `STATUS_TRANSITIONS` now excludes `INTERVIEW_SCHEDULED` as well
as `SELECTED` — `PUT /applications/<id>/status` and the bulk endpoint both return `400` if you
try to set it directly. The only legitimate path to that status is `POST /interviews` (which
requires a real `scheduled_at`). Error messages updated to point at the right endpoint.

**Fix (`DriveApplicants.js` + `CompanyStudentProfile.js`):** removed `'Interview Scheduled'`
from both components' `statusOptions` — the dropdown (single-row and bulk) can no longer offer
it. The "Interview" button/modal is the only UI path left.

**Known minor gap, not fixed:** `CompanyStudentProfile.js` has no scheduling modal of its own
(only the drive-specific applicants page does), so an application already at "Interview
Scheduled" shows its dropdown there without that value pre-selected — cosmetic only, can't be
used to break anything. Flagged to the user, left as-is pending a decision on whether that page
should instead show a read-only note for that status (like it already does for
Selected/Placed).

---

## Files touched this session (cumulative)

**Backend:**
- `routes/company.py` — full rewrite (Step 1) + 3 follow-up edits (Fixes 1–3)

**Frontend — new:**
- `static/js/components/CompanyLayout.js`
- `static/js/components/company/CompanyDashboard.js`
- `static/js/components/company/CompanyProfile.js`
- `static/js/components/company/CompanyDrives.js`
- `static/js/components/company/DriveApplicants.js` (+ Fix 1 edit)
- `static/js/components/company/CompanyStudentProfile.js` (+ Fix 3 edit)
- `static/js/components/company/CompanyInterviews.js`

**Frontend — modified:**
- `static/js/router.js` (Steps 2–4, cumulative)
- `templates/index.html` (Steps 2–4, cumulative)
- `templates/base.html` (Step 5 — Company nav branch removed)

**Deleted:**
- `templates/company/` (entire directory, 5 files) — Step 5

**Also produced (not code):**
- `MILESTONE_5_STUDENT_API_VUE.md` — a Milestone 5 (student) planning doc in the same 5-step
  format as this one, written before any Milestone 5 code was started. Front-loads two gotchas
  discovered during Milestone 4 testing: the `instance/` folder SQLite path resolution, and
  `init_db.py`'s legacy `'Interview'` status string / missing demo resume files.

---

## Environment notes worth carrying forward

- **`instance/` folder gotcha:** Flask-SQLAlchemy resolves `sqlite:///placement_portal.db`
  relative to `instance/`, not the repo root. The live DB is
  `instance/placement_portal.db`. Cost real debugging time before this was caught.
- **`init_db.py` seed data quirks (pre-existing, not touched):** some seeded applications use
  the legacy string `'Interview'` instead of `'Interview Scheduled'` (predates
  `constants.py`'s rename). Demo resume filenames (`resume1.pdf`...`resume5.pdf`) referenced
  in `Student.resume_path` don't actually exist under `static/uploads/resumes/` (only
  `.gitkeep` is there) — resume-view endpoints correctly 404 rather than crash, but there's
  nothing to actually view until real files are added.
- **Dev workflow gotcha in this sandbox:** background server processes (`python app.py &`)
  don't survive between separate tool calls — every verification run in this session started
  the server and ran its curl tests in a single combined shell command.
