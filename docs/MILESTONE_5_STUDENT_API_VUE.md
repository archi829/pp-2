# Milestone 5 — Student Dashboard API + Vue UI

Depends on Milestone 1 (Interview + Placement models — done), Milestone 2 (JWT auth — done),
Milestone 3 (Admin API + Vue — done), and Milestone 4 (Company API + Vue — done).

Same job as Milestone 4, one role over: convert `routes/student.py` from Flask-Login +
`render_template` into a pure JSON API under `/api/student`, then build the Vue pages that
replace `templates/student/*.html`. Reuse every convention already established — this doc
assumes you've read `routes/admin.py` and `routes/company.py` as the reference implementations
and won't re-explain things that are just "do it the same way."

**Conventions to reuse, not reinvent:**
- Blueprint `student_bp = Blueprint('student', __name__, url_prefix='/api/student')`
- List endpoints → bare `jsonify([...])`. Detail endpoints → bare `jsonify({...})`.
  Mutation endpoints → serialized object flat-merged with `'msg'`.
- `student_required` decorator (already in `routes/decorators.py`) covers blacklist +
  inactive checks — don't re-check those in the route body.
- `current_student()` helper at the top of the file, same shape as `current_company()` in
  `routes/company.py`.
- Global Vue components (`const X = {...}`, no build step), string-concatenated templates,
  `window.api` / `window.auth` from `config.js`, `<loading-spinner>` / `<error-alert>` on
  every page, query-string-synced filters via `$route.query` + `$router.push` (see
  `AdminDrives.js` / `DriveApplicants.js`), resume blob-download pattern (see
  `AdminStudentDetail.js` / `DriveApplicants.js` — content-type must be read from
  `res.headers['content-type']`, not assumed).
- `router.js` already has `{ path: '/student/dashboard', component: ComingSoon, meta: { role:
  'student' } }` as a placeholder — Step 2 replaces it with a real nested `StudentLayout` block,
  same shape as `/admin` and `/company`.

---

## Step 1 — Backend: `routes/student.py`

Rewrite the whole file. Every existing MAD1 view has a direct JSON equivalent — nothing is
being dropped, just reshaped — plus two new read-only endpoints for the Milestone-1 models
that didn't exist yet when `routes/student.py` was last touched.

```
GET  /api/student/dashboard              → profile summary + recent applications + up to 5
                                            unread notifications + up to 5 available drives
                                            (mirrors old dashboard.html's four panels)
GET  /api/student/profile                → full profile
PUT  /api/student/profile                → edit name/phone/cgpa/skills/education
                                            (email is NOT editable, same rule as company)
POST /api/student/profile/resume         → upload resume (multipart/form-data, single 'resume'
                                            file field) — keep the existing PDF/DOC/DOCX
                                            extension check
GET  /api/student/resume                 → stream the student's own resume (blob), same
                                            send_from_directory pattern as company/admin use

GET  /api/student/drives                 → approved drives, NOT already applied to,
                                            ?q=&skill=&company= search (mirror the ilike
                                            OR-filter pattern from company.list_drives /
                                            student.drives in the old template)
GET  /api/student/drives/<id>            → single drive detail (404 if not Approved, matching
                                            the old "This drive is not available" guard)

POST /api/student/applications           → apply {drive_id, cover_letter}. Keep ALL existing
                                            guards: drive must be Approved, student must not be
                                            blacklisted, and catch the UniqueConstraint via
                                            IntegrityError → 409, not just a pre-check (someone
                                            double-clicking Apply is a real race condition)
GET  /api/student/applications           → all own applications, newest first
GET  /api/student/applications/<id>      → single application detail (404 if not yours)
PUT  /api/student/applications/<id>/note → save personal note (old save_note)
PUT  /api/student/applications/<id>/offer→ accept/reject an offer {action: 'accept'|'reject'},
                                            only valid when status == 'Selected' — same guard
                                            as the old respond_offer

GET  /api/student/notifications          → all notifications, newest first, and mark them
                                            read as a side effect (matches old behavior)

GET  /api/student/interviews             → NEW — this student's interviews, joined through
                                            Application → PlacementDrive, ordered by
                                            scheduled_at. Read-only: students don't reschedule,
                                            only companies do (mirror company's Interview
                                            serializer shape, but from the student's side —
                                            include job_title + company_name, not student_name)

GET  /api/student/placements             → NEW — this student's confirmed Placement records
                                            (position, salary, joining_date, company_name,
                                            job_title)
GET  /api/student/placements/<id>/offer-letter
                                          → NEW — stream offer_letter_path if set, 404 if not
                                            (Placement.offer_letter_path has no upload path yet
                                            anywhere in the codebase — this endpoint exists for
                                            forward-compat with a future admin/company upload
                                            feature; returning a clean 404 today is correct,
                                            don't stub fake data)
```

**Test criteria:**
- Applying twice to the same drive returns `409`, not a `500` from an unhandled
  `IntegrityError`.
- Applying to a `Pending`/`Closed`/`Rejected` drive is blocked server-side even if the Vue
  route guard is somehow bypassed.
- A blacklisted student's `student_required` 403 fires on every one of these routes, not just
  login (same mid-session-blacklist test pattern used for company in Milestone 4 Step 5).
- `/api/student/drives?q=python` matches on job title, required skills, location, **and**
  company name (join required) — check all four independently.
- Resume upload rejects a `.exe` with the same 400 message as before; accepts `.pdf/.doc/.docx`.
- `/api/student/interviews` and `/api/student/placements` return `[]` cleanly for a student
  with none — don't let the join throw on an empty result.

---

## Step 2 — Frontend: Layout, Dashboard, Profile

**Files added:**
- `static/js/components/StudentLayout.js` — navbar: Dashboard / Browse Drives / My
  Applications / Interviews / Placements / Profile / Logout. Same shell pattern as
  `AdminLayout.js` / `CompanyLayout.js`.
- `static/js/components/student/StudentDashboard.js` — the four dashboard panels: profile
  card, stat cards (Open Drives / Applied / Shortlisted / Selected), a 5-row "Available
  Drives" table with an inline Apply button, and a 5-row "My Applications" table. Also
  surface pending offers here (`status === 'Selected' && offer_status === 'Pending'`) with
  Accept/Decline buttons — this was inline in the old `dashboard.html` and is genuinely
  time-sensitive, don't bury it on a sub-page.
- `static/js/components/student/StudentProfile.js` — same edit-form pattern as
  `CompanyProfile.js`, plus a resume upload control. Resume upload is `multipart/form-data`,
  which means **don't** send it through the shared JSON `window.api` instance's default
  headers — build a `FormData` object and let axios set the boundary itself (don't manually
  set `Content-Type`).

**Test criteria:**
- Nav links all resolve to real routes once Step 3/4 land (temporarily point the not-yet-built
  ones at `ComingSoon`, same incremental approach as Milestone 4).
- Accepting/declining an offer from the dashboard updates the badge without a full page
  reload (refetch dashboard data, don't `location.reload()`).
- Resume re-upload replaces the file and the "Current resume" link updates immediately.

---

## Step 3 — Frontend: Browse Drives + Apply

**Files added:**
- `static/js/components/student/BrowseDrives.js` — query-string-synced search (`?q=`) over
  `GET /api/student/drives`, same pattern as `AdminCompanies.js`'s `$route.query` sync. Each
  card/row shows Applied-badge vs Apply button based on whether the drive is already in the
  student's application list — fetch both drives and applications on mount so this doesn't
  require an extra round-trip per row.
- `static/js/components/student/DriveDetail.js` — single-drive view with the cover-letter
  form, same shape as the old `drive_detail.html`. Show the existing application's status
  inline instead of the form if `already_applied` comes back non-null.

**Test criteria:**
- Applying from `BrowseDrives.js` and from `DriveDetail.js` both land you on
  `/student/applications` afterward (or wherever Step 4 puts the history page) with a success
  toast — pick one destination and use it consistently, don't diverge between the two entry
  points.
- Trying to re-apply to something you already applied to (e.g., two tabs open) surfaces the
  `409` as a readable message, not a raw Axios error.

---

## Step 4 — Frontend: Applications, Interviews, Placements, Notifications

**Files added:**
- `static/js/components/student/StudentApplications.js` — full history table (old
  `history.html`'s status-count cards + table), per-row cover-letter modal (same lightweight
  overlay-modal pattern as `DriveApplicants.js`'s Select/Interview modals, not a Bootstrap JS
  instance), and the inline personal-note save-on-blur-or-button pattern from the old template.
- `static/js/components/student/StudentInterviews.js` — read-only table: job title, company,
  scheduled time, mode, location/link, status badge. No inline editing — students don't own
  this data, they just see it. (Same "read/manage-all" framing as `CompanyInterviews.js`, minus
  the manage part.)
- `static/js/components/student/StudentPlacements.js` — confirmed placements list with an
  "Offer Letter" download button that hits `/api/student/placements/<id>/offer-letter` and
  gracefully shows "Not available yet" on a 404 instead of a broken download.
- `static/js/components/student/StudentNotifications.js` — straight list, newest first, same
  as old `notifications.html`. Since `GET /api/student/notifications` marks them read as a
  side effect, make sure `StudentDashboard.js`'s unread-count badge (if you add one to the nav)
  refetches after this page is visited, or it'll show a stale count.

**Test criteria:**
- Cover-letter modal renders `white-space: pre-wrap` (long letters had line breaks in the old
  template — don't lose that).
- An application with no scheduled interview yet just doesn't appear in
  `StudentInterviews.js` — don't render an empty-state row per application.
- Placements page correctly shows nothing for a student who's never been Selected, and shows
  a real row immediately after a company runs the Select flow from Milestone 4 (cross-check
  against `PUT /api/company/applications/<id>/select` — same underlying `Placement` row, two
  different read paths).

---

## Step 5 — Polish pass

Same checklist as Milestone 4 Step 5, applied to the student surface:

1. **`<loading-spinner>` / `<error-alert>` consistency** — audit all 7 new student components.
2. **Unused imports in `routes/student.py`** — run `pyflakes` after the rewrite, same as was
   done for `routes/company.py`.
3. **Dead template cleanup** — delete `templates/student/*.html` (`dashboard.html`,
   `drives.html`, `drive_detail.html`, `history.html`, `notifications.html`, `profile.html`),
   remove the `{% elif current_user.__class__.__name__ == 'Student' %}` nav branch from
   `templates/base.html` (this is the **last** role branch left in that file — once it's gone,
   `templates/base.html` itself is dead code, since `templates/index.html` is now the only
   template ever rendered; confirm nothing else extends `base.html` before deleting it too).
   Grep the whole `templates/` tree afterward for `url_for('student` — should be zero hits.
4. **403 mid-session test** — same pattern as company: log in as a student, admin-blacklist
   them mid-session, confirm the still-valid JWT gets a clean `403` with the exact
   `student_required` message on a previously-working endpoint.
5. **Full regression pass** — fresh `init_db.py`, fresh server, every new `.js` file 200s,
   the SPA fallback still serves `index.html` for `/student/*` deep links, `/` still loads.
6. **This is the last role.** Once this is done, `templates/company/` and `templates/student/`
   are both gone, `templates/base.html` is unused, and `templates/index.html` is the sole
   Jinja2 entry point — exactly the MAD2 target architecture described in
   `MAD2_PROJECT_CONTEXT.md` §3. Worth a final end-to-end walk of all three roles
   (admin/company/student) back-to-back before calling Milestone 5 done.

---

## Notes specific to Milestone 5 (things that bit Milestone 4 and will bite here too if skipped)

- **`instance/` folder gotcha**: the live SQLite file is `instance/placement_portal.db`, not
  the one at repo root — don't debug against the wrong file (this cost real time in M4).
- **Legacy seed data**: `init_db.py` still seeds the string `'Interview'` instead of
  `'Interview Scheduled'` for some applications, and references resume filenames that don't
  exist on disk under `static/uploads/resumes/` (only `.gitkeep` is there). Neither is a bug
  in your new code — flag it, don't silently "fix" `init_db.py` as a side effect of this
  milestone unless asked.
- **Resume upload is the one multipart endpoint in this whole milestone** — every other POST/
  PUT is JSON. Don't let that leak into the axios instance's default `Content-Type` for
  everything else.
- **Notifications-mark-as-read-on-GET is a side effect on a GET request**, which is unusual
  REST-wise but matches existing behavior exactly — keep it, don't "fix" it into a separate
  `PUT /read` endpoint unless you also update the dashboard's unread-badge logic to match.
