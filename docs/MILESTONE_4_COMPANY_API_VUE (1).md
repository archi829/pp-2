# 📋 Milestone 4 — Company Dashboard API + Vue UI
> **Depends on:** Milestone 3 (done) — JWT auth, Vue SPA scaffold, shared `config.js`/`router.js`,
> `<loading-spinner>`/`<error-alert>` primitives all already exist and should be reused, not rebuilt.
> **Repo:** `archi829/pp-2`

---

## 0. Before you start

**What's already true and you should NOT redo:**
- `templates/index.html` is the Vue SPA entry point. Adding a company page means: create the component file, add a `<script>` tag for it in `index.html` (before `router.js`), and add a route in `router.js`.
- `static/js/config.js` already exports `window.api` (JWT-attached axios instance) and `window.auth` (token/role helpers). Use `window.api.get/post/put/delete('/company/...')` — the `/api` prefix is already baked into the axios `baseURL`.
- `<loading-spinner v-if="loading"></loading-spinner>` and `<error-alert :message="error" @dismiss="error=''"></error-alert>` are globally registered — just use them, don't reinvent the pattern.
- Company login and registration already work (`POST /api/auth/login` with `role: "company"`, `POST /api/auth/register/company`). Nothing to build there.
- `/company/dashboard` currently resolves to a "Coming soon" placeholder route with `meta: { role: 'company' }` already guarding it — you're replacing the placeholder's `component`, not adding the route from scratch.
- `routes/decorators.py`'s `company_required` already checks JWT role, blacklist status, and approval status — a route decorated with it can assume `Company.query.get(int(get_jwt_identity()))` is a real, approved, non-blacklisted company.

**What this milestone deletes:** `templates/company/*.html` (once Step 2 confirms the Vue dashboard works end-to-end — don't delete on Step 1).

**Models already in place, not yet used anywhere:** `Interview` (fields: `application_id`, `scheduled_at`, `mode`, `location_or_link`, `notes`, `status`) and `Placement` (fields: `student_id`, `company_id`, `drive_id`, `position`, `salary`, `joining_date`, `offer_letter_path`, `placed_at`). This milestone is where both get wired up.

---

## Step 1 — Backend: `routes/company.py` → pure JSON API

**Goal:** Convert every route in `routes/company.py` from `render_template`/`flash`/`redirect` to `jsonify`, under a `/api/company` prefix, following the exact same pattern Milestone 3 used for `routes/admin.py`.

**Prompt for Claude:**
```
Rewrite routes/company.py as a pure JSON API blueprint, mirroring how routes/admin.py
was converted in Milestone 3 (Blueprint(..., url_prefix='/api/company'), jsonify
everywhere, no render_template/flash/redirect, serializer helper functions at the
top of the file).

Required endpoints:

GET    /dashboard                          → company profile + drive stats + applicant counts
GET    /profile                            → full company profile
PUT    /profile                            → update company profile (hr_contact, industry,
                                              website, description — NOT company_name or email)

POST   /drives                             → create drive (403 if approval_status != 'Approved',
                                              reuse the existing validation: title/desc/deadline
                                              required, deadline must be a future date)
GET    /drives                             → list this company's own drives (optional ?status=)
GET    /drives/<id>                        → single drive detail (404 if not owned by this company)
PUT    /drives/<id>                        → edit drive (ownership check)
PUT    /drives/<id>/status                 → body: {"action": "close"|"reopen"} — same rules as
                                              the old close_drive/reopen_drive (only Approved can
                                              close, only Closed can reopen)
DELETE /drives/<id>                        → delete (ownership check)

GET    /drives/<id>/applications           → applicants for one drive. Keep the existing
                                              ?tab=<status>&sort=cgpa_desc|cgpa_asc|date query
                                              params and the counts-per-tab response shape.
PUT    /applications/<id>/status           → body: {"status": "..."}. Only accept
                                              ApplicationStatus.VALID_TRANSITIONS MINUS 'Selected'
                                              (Selected goes through the dedicated /select endpoint
                                              below). Ownership check via application.drive.company_id.
                                              Creates a Notification exactly like the old
                                              update_status did.
POST   /applications/bulk-status           → body: {"app_ids": [...], "status": "..."} — same
                                              restriction (no 'Selected' here either).
PUT    /applications/<id>/select           → body: {"position": "...", "salary": "...",
                                              "joining_date": "YYYY-MM-DD" (optional)}.
                                              Sets application.status = 'Selected'. If no
                                              Placement row exists yet for this
                                              (student_id, drive_id), create one using the
                                              company_id from the drive and the fields from the
                                              request body. Creates a Notification. Return the
                                              created/existing placement id in the response.

POST   /interviews                         → body: {"application_id", "scheduled_at" (ISO
                                              datetime string), "mode", "location_or_link",
                                              "notes"}. Ownership check: the application's drive
                                              must belong to this company. Create a Notification
                                              for the student.
GET    /interviews                         → list all interviews across this company's drives
                                              (join Interview -> Application -> PlacementDrive,
                                              filter by company_id). Include student name, drive
                                              job title in the serialized response.
PUT    /interviews/<id>                    → update scheduled_at/mode/location_or_link/notes/status
                                              (ownership check through the same join)

GET    /student/<id>/profile               → same ownership-scoped student view as the old
                                              view_student_profile (404 unless this student has
                                              applied to one of this company's drives)
GET    /student/<id>/resume                → same as before, just jsonify-friendly error paths
                                              (this one still uses send_from_directory for the
                                              actual file — that part doesn't change)

Reuse ApplicationStatus, DriveStatus, ApprovalStatus, OfferStatus from constants.py — don't
hardcode status strings. Keep every ownership check that existed in the old file (company_id
must match get_jwt_identity() on every drive/application/interview lookup) — these are
security-critical, not just correctness.
```

**Files changed:** `routes/company.py`

**Test before moving on** (curl, same pattern as Milestone 3 Step 1):
```bash
curl -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hr@technova.com","password":"password123","role":"company"}'
# copy access_token, then:
export TOKEN="..."
curl http://127.0.0.1:5000/api/company/dashboard -H "Authorization: Bearer $TOKEN"
curl http://127.0.0.1:5000/api/company/drives -H "Authorization: Bearer $TOKEN"
```
✅ JSON back, 200s, drive/applicant counts match what's in the DB. Visiting `/company/dashboard` directly in a browser should still show the Vue "Coming soon" placeholder (Step 2 replaces that).

---

## Step 2 — Frontend scaffold: `CompanyLayout` + `CompanyDashboard` + `CompanyProfile`

**Goal:** Get the company shell wired up and the dashboard showing real data — same shape as Milestone 3 Step 2, minus rebuilding the auth pieces.

**Prompt for Claude:**
```
Build the company section of the Vue SPA:

1. static/js/components/CompanyLayout.js — navbar shell like AdminLayout.js: brand link to
   /company/dashboard, nav links for Dashboard / Post Drive / Profile, Logout button. Wraps a
   <router-view>.

2. static/js/components/company/CompanyDashboard.js — GET /api/company/dashboard on mount,
   loading-spinner + error-alert per the established pattern. Stat cards for total drives /
   active drives / pending-approval drives / total applicants (mirror the old
   templates/company/dashboard.html layout: click a stat card to filter the drives table below
   by status). Drives table with Edit / Close / Re-open / Delete actions, row click navigates to
   /company/drives/:id/applications.

3. static/js/components/company/CompanyProfile.js — GET /api/company/profile on mount, form to
   edit hr_contact/industry/website/description (company_name and email read-only, same as the
   old edit forms), PUT on submit, success feedback via a toast or inline banner.

4. Update static/js/router.js: replace the /company/dashboard placeholder's component with
   CompanyLayout wrapping CompanyDashboard as a child (same nested-route pattern used for
   /admin), plus children for 'profile' (CompanyProfile) and keep 'drives'/'drives/:id/...' as
   ComingSoon for now (Step 3 fills those in). Keep meta: { role: 'company' } on the parent.

5. Update templates/index.html: add <script> tags for CompanyLayout.js and
   CompanyDashboard.js and CompanyProfile.js, loaded after the shared/common components and
   before router.js — same ordering rule as the admin components.

Reuse <loading-spinner> and <error-alert> — do not re-inline that markup.
```

**Files added:** `static/js/components/CompanyLayout.js`, `static/js/components/company/CompanyDashboard.js`, `static/js/components/company/CompanyProfile.js`
**Files changed:** `static/js/router.js`, `templates/index.html`

**Test before moving on:**
1. Log in as `hr@technova.com` / `password123` (role: Company) → lands on `/company/dashboard` with real stats, not "Coming soon."
2. Stat cards filter the drives table.
3. `/company/profile` loads current values, saves changes, they persist on reload.
4. Log out, hit `/company/dashboard` directly while unauthenticated → redirected to `/login` (same guard behavior as admin).

---

## Step 3 — Company Drives (create / edit / list / close / reopen / delete)

**Goal:** Full drive CRUD from the company side.

**Prompt for Claude:**
```
Build static/js/components/company/CompanyDrives.js — a single component handling both create
and edit via a route param (mirrors the old create_drive.html / edit_drive.html but unified):
route 'drives/new' → create mode (empty form, POST /api/company/drives on submit); route
'drives/:id/edit' → edit mode (GET /api/company/drives/:id to prefill, PUT on submit). Fields:
job_title, job_description, eligibility_criteria, required_skills, salary_range, location,
application_deadline (date input, must be a future date — validate client-side too, not just
rely on the 400 from the backend). Show the "Submit for Admin Approval" vs "Save Changes" button
label depending on mode.

Also update CompanyDashboard.js's drives table actions (Edit/Close/Reopen/Delete) to actually
call the corresponding endpoints (PUT .../status with action close|reopen, DELETE) instead of
being inert, with confirm() dialogs on Close and Delete matching the old onsubmit="return
confirm(...)" behavior.

Update router.js: add 'drives/new' and 'drives/:id/edit' as children under the /company route,
both using CompanyDrives.js. Add the corresponding <script> tag to templates/index.html.
```

**Files added:** `static/js/components/company/CompanyDrives.js`
**Files changed:** `static/js/components/company/CompanyDashboard.js`, `static/js/router.js`, `templates/index.html`

**Test before moving on:**
1. Post a new drive → shows up in the dashboard table as Pending.
2. Log in as admin (separate tab), approve it — refresh the company dashboard, status flips to Approved.
3. Edit an existing drive, save, changes persist.
4. Close an Approved drive → status becomes Closed, Re-open button appears and works.
5. Delete a drive → removed from the table, confirm dialog fires first.

---

## Step 4 — Drive Applicants, Selection, and Interviews

**Goal:** The core hiring workflow — view applicants per drive, move them through the status pipeline, mark someone Selected (creating a Placement), and schedule interviews.

**Prompt for Claude:**
```
Build two components:

1. static/js/components/company/DriveApplicants.js — route 'drives/:id/applications'. GET
   /api/company/drives/:id/applications with the existing ?tab=&sort= query params (mirror the
   old templates/company/applications.html: status tabs with counts, CGPA sort buttons, a table
   with student name/CGPA/skills/applied date/status, a "Resume" button using the same
   blob-download pattern as AdminStudentDetail.js's viewResume (this endpoint is JWT-protected
   too), a per-row status <select> + Save button, select-all + bulk status update toolbar.
   Clicking a student's name navigates to a student profile view (reuse or adapt the pattern
   from AdminStudentDetail.js, scoped to GET /api/company/student/:id/profile instead).

   For moving an application to 'Selected': don't just set the status dropdown — open a small
   modal or inline form asking for position / salary / joining_date (optional), then PUT
   /api/company/applications/:id/select with that payload. This is a materially different action
   from the other status transitions (it creates a Placement record server-side), so it should
   look different in the UI, not just be another dropdown option.

2. static/js/components/company/CompanyInterviews.js — route 'interviews'. GET
   /api/company/interviews on mount, table of scheduled interviews (student, drive, scheduled_at,
   mode, location_or_link, status). A "Schedule Interview" action should be reachable from
   DriveApplicants.js per-row (not just from this standalone page) — add a button/icon there that
   opens a small form (scheduled_at datetime-local input, mode select Online/In-person,
   location_or_link, notes) posting to /api/company/interviews. This page itself is the read/
   manage-all view: allow updating status (Scheduled/Completed/Cancelled) inline via PUT
   /api/company/interviews/:id.

Add both to CompanyLayout.js's nav (an "Interviews" link; Applicants is reached via the
dashboard's drive rows, not a standalone nav item, same as how admin's Applications differs from
per-drive views). Add router.js entries ('drives/:id/applications', 'interviews') and
templates/index.html script tags.
```

**Files added:** `static/js/components/company/DriveApplicants.js`, `static/js/components/company/CompanyInterviews.js`
**Files changed:** `static/js/components/CompanyLayout.js`, `static/js/router.js`, `templates/index.html`

**Test before moving on:**
1. Open a drive's applicants list, filter by tab, sort by CGPA, both work and the URL reflects the filters (same query-string-sync pattern as `AdminCompanies`/`AdminDrives`).
2. Move an applicant to Shortlisted → Interview Scheduled via the status dropdown.
3. Schedule an interview for a shortlisted applicant — appears on `/company/interviews`.
4. Mark an applicant Selected via the dedicated flow (position/salary form) — confirm a `Placement` row was actually created (`sqlite3 placement_portal.db "select * from placement;"` or just trust the response payload's returned id).
5. Resume download from this view opens as a real PDF, not raw bytes (same blob-with-content-type fix from Milestone 3 — don't reintroduce that bug here).
6. Bulk status update on 2+ selected applicants works.

---

## Step 5 — Polish pass

**Goal:** Same category of cleanup as Milestone 3 Step 5, applied to the company section.

**Prompt for Claude:**
```
1. Confirm every company component uses <loading-spinner>/<error-alert> consistently (no
   one-off inline spinner/alert markup slipped in during Steps 2-4).

2. Sweep routes/company.py for unused imports the same way admin.py was cleaned up in
   Milestone 3 (check for render_template/flash/redirect/url_for/get_jwt_identity-if-unused
   leftovers).

3. Delete templates/company/*.html now that the Vue pages are confirmed working end-to-end.
   Grep for 'company\.' in templates/ afterward — should only turn up inside files that no
   longer exist (i.e., no hits at all, since templates/base.html's Company nav branch should
   also be removed now, the same way the Admin branch was removed in Milestone 3 — company no
   longer uses base.html/Jinja rendering for anything).

4. Confirm the 403 toast (from config.js, already built) fires correctly for company-specific
   cases: an unapproved or blacklisted company hitting any /api/company/* endpoint should show
   the toast with the server's real message ("Your account is pending admin approval." etc.),
   not a generic failure.

5. Do a final pass on CompanyDashboard's stat cards and nav links — confirm every link resolves
   to a real, working page (no more ComingSoon placeholders left anywhere under /company).
```

**Files changed:** `routes/company.py`, various `static/js/components/company/*.js`, `templates/base.html`
**Files deleted:** `templates/company/*.html`

---

## Milestone 4 sign-off checklist

- [ ] Company login → real dashboard with correct stats
- [ ] Post a new drive → Pending → admin approves → status updates
- [ ] Edit / Close / Re-open / Delete a drive
- [ ] View applicants per drive, filter/sort, bulk + single status updates
- [ ] Resume opens correctly from the applicants view
- [ ] Mark an applicant Selected → Placement record created
- [ ] Schedule and manage interviews
- [ ] Company profile edits persist
- [ ] Logged-out access to any `/company/*` route redirects to `/login`
- [ ] `templates/company/` deleted, no dangling `url_for('company.xxx')` left in `templates/`

```
git add .
git commit -m "feat(company): company dashboard, drive management and applicant API + Vue"
```

---

## Quick reference — files this milestone touches

```
routes/company.py                                    (rewritten → JSON API)
templates/company/*.html                              (deleted in Step 5)
templates/base.html                                    (Company nav branch removed in Step 5)
templates/index.html                                   (script tags added across Steps 2-4)
static/js/router.js                                    (routes added across Steps 2-4)
static/js/components/CompanyLayout.js                  (new, Step 2)
static/js/components/company/CompanyDashboard.js       (new, Step 2)
static/js/components/company/CompanyProfile.js         (new, Step 2)
static/js/components/company/CompanyDrives.js          (new, Step 3)
static/js/components/company/DriveApplicants.js        (new, Step 4)
static/js/components/company/CompanyInterviews.js      (new, Step 4)
```

Nothing in `static/js/config.js`, `Login.js`, `Register.js`, or the shared `common/` components
should need to change for this milestone — if you find yourself editing those, stop and check
whether you actually need a company-specific variant instead.
