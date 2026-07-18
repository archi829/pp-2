# 🛠️ Milestone 3 — Admin Dashboard API + Vue 2 UI
> Prereqs done: Milestone 1 (models: Interview, Placement) ✅ · Milestone 2 (JWT auth) ✅
> Stack for this milestone: Flask JSON API (`/api/admin/*`) + Vue 2 (CDN, no build step) + vue-router 3 + axios

This file breaks Milestone 3 into **5 chunky steps**. Each step is sized to be doable by Claude
in a single message within free-tier limits. Paste each step's "Prompt for Claude" block into a
**new-ish** conversation (or continue the same one) one at a time, in order. Don't skip the test
after each step — if a step's test fails, fix it before moving to the next step, since later
steps depend on earlier ones working.

---

## Step 0 — Before you start (do this yourself, 2 minutes)

- Make sure `python init_db.py` has been run recently so you have seed data (pending companies/drives to approve, etc.)
- Keep the Flask server running on `http://127.0.0.1:5000` while testing each step.
- Have Postman / `curl` / browser devtools ready for API-only steps (Step 1).

---

## Step 1 — Backend: Convert `routes/admin.py` into a pure JSON API

### Goal
Replace every `render_template(...)` admin route with a JSON-returning route under
`/api/admin/*`. No HTML rendering left in this file at all.

### Prompt for Claude
```
Rewrite routes/admin.py so it is a pure JSON REST API blueprint (no render_template,
no flash, no redirect). Requirements:

- Change the blueprint prefix to url_prefix='/api/admin'.
- Keep the @admin_required decorator on every route (already JWT-based in routes/decorators.py).
- Implement these endpoints, returning jsonify(...) with sensible HTTP status codes
  (200 success, 400 bad input, 404 not found):

  GET    /api/admin/dashboard
    -> { total_students, total_companies, total_drives, total_apps,
         pending_companies: [...5 most recent...], pending_drives: [...5 most recent...],
         pending_companies_count, pending_drives_count }

  GET    /api/admin/companies?q=&status=
    -> list of companies (id, company_name, email, industry, approval_status,
       is_blacklisted, created_at) filtered like the old Jinja route did

  PUT    /api/admin/companies/<id>/approve
  PUT    /api/admin/companies/<id>/reject
  PUT    /api/admin/companies/<id>/blacklist   (toggles is_blacklisted)
  DELETE /api/admin/companies/<id>
  POST   /api/admin/companies/bulk-status      (body: {company_ids: [...], action: 'approve'|'reject'})

  GET    /api/admin/drives?status=&company_id=
    -> list of drives (id, job_title, company_name, application_deadline, applications_count, status, created_at)
  PUT    /api/admin/drives/<id>/approve
  PUT    /api/admin/drives/<id>/reject
  DELETE /api/admin/drives/<id>
  POST   /api/admin/drives/bulk-status         (body: {drive_ids: [...], action: 'approve'|'reject'})

  GET    /api/admin/students?q=
    -> list of students (id, full_name, email, phone, cgpa, is_blacklisted)
  GET    /api/admin/students/<id>
    -> student profile + its applications (with drive job_title, company_name, status, applied_at)
  PUT    /api/admin/students/<id>/blacklist    (toggles is_blacklisted)
  DELETE /api/admin/students/<id>
  GET    /api/admin/students/<id>/resume       (keep send_from_directory file response, unchanged behavior)

  GET    /api/admin/applications
    -> all applications (id, student_name, drive_job_title, company_name, applied_at, status)

  GET    /api/admin/search?q=&type=company|student
    -> reuse the same filter logic as the companies/students list endpoints

Every mutating endpoint (approve/reject/blacklist/delete/bulk) must return the updated
resource or a small confirmation payload like {"msg": "...", "id": ..., "new_status": "..."}
so the Vue frontend can update its local state without a full page refetch if it wants to.

Then:
- Delete these now-unused files: templates/admin/dashboard.html, templates/admin/companies.html,
  templates/admin/drives.html, templates/admin/applications.html, templates/admin/students.html,
  templates/admin/student_detail.html (whole templates/admin/ folder if nothing else is in it).
- Do NOT touch app.py's blueprint registration line for admin_bp — the prefix already comes
  from the Blueprint() call inside routes/admin.py.
- Double check constants.py's ApplicationStatus / DriveStatus / ApprovalStatus values are
  used instead of hardcoded strings anywhere new you write.
```

### Files added/changed
- **Modified:** `routes/admin.py`
- **Deleted:** entire `templates/admin/` folder

### Test before moving on
No frontend yet — test with curl/Postman:
```powershell
# 1. Log in as admin, grab the token
response = Invoke-RestMethod `
>>     -Uri "http://127.0.0.1:5000/api/auth/login" `
>>     -Method POST `
>>     -ContentType "application/json" `
>>     -Body (@{
>>         email="admin@placementportal.com"
>>         password="admin123"
>>         role="admin"
>>     } | ConvertTo-Json)
>> 
>> $response.access_token

# 2. Use the access_token from the response below
$env:TOKEN = "paste_your_access_token_here"

curl.exe http://127.0.0.1:5000/api/admin/dashboard `
  -H "Authorization: Bearer $env:TOKEN"

curl.exe http://127.0.0.1:5000/api/admin/companies `
  -H "Authorization: Bearer $env:TOKEN"

curl.exe -X PUT http://127.0.0.1:5000/api/admin/companies/3/approve `
  -H "Authorization: Bearer $env:TOKEN"

curl.exe http://127.0.0.1:5000/api/admin/students `
  -H "Authorization: Bearer $env:TOKEN"

curl.exe http://127.0.0.1:5000/api/admin/applications `
  -H "Authorization: Bearer $env:TOKEN"
  
```
✅ Pass if: every call returns JSON (not HTML), 200 status, and data matches what's in the DB.
Visiting `/admin/dashboard` in the browser should now 404 (that route no longer exists).

---

## Step 2 — Frontend scaffold + Login + Admin Dashboard page

### Goal
Stand up the whole Vue 2 SPA skeleton (CDN-based, no npm/build step) — entry HTML, axios
config with JWT interceptor, router, a shared login page for all 3 roles, and the first real
admin screen: the Dashboard.

### Prompt for Claude
```
Set up a Vue 2 (CDN-based, no build tool) SPA for the Placement Portal and build the login
flow + Admin Dashboard page.

1. Create templates/index.html — the single Jinja2 entry point. It should:
   - Load Vue 2, Vue Router 3, and Axios from CDN (jsdelivr).
   - Load Bootstrap 5 CSS + Bootstrap Icons from CDN (reuse the same links as the old
     templates/base.html for visual consistency).
   - Have <div id="app"><router-view></router-view></div>.
   - Load static/js/config.js, static/js/router.js, then static/js/app.js as plain
     (non-module) <script> tags, in that order, at the end of <body>.

2. Create static/js/config.js:
   - Create a global `axios` instance (window.api) with baseURL '/api'.
   - Add a request interceptor that attaches `Authorization: Bearer <token>` from
     localStorage('token') if present.
   - Add a response interceptor: on 401, clear localStorage and redirect to '/login'.
   - Expose small helpers on window.auth: getToken(), getRole(), getUser(), login(data), logout().
     login(data) stores token/role/user_id/email in localStorage. logout() clears localStorage.

3. Create static/js/components/Login.js (global Vue component, works for all 3 roles):
   - Role selector (admin/company/student), email, password fields — mirror the old
     templates/auth/login.html fields and look (Bootstrap card, same icon classes).
   - On submit, POST /api/auth/login, call window.auth.login(response.data), then
     router.push based on role: admin -> /admin/dashboard, company -> /company/dashboard,
     student -> /student/dashboard. Show an error alert on failure (use response msg).

4. Create static/js/components/admin/AdminDashboard.js (global Vue component):
   - On mounted(), GET /api/admin/dashboard.
   - Render 4 stat cards (students/companies/drives/applications) matching the old
     templates/admin/dashboard.html Bootstrap layout, each stat card a router-link to
     its list page (/admin/companies, /admin/students, /admin/drives, /admin/applications).
   - Render "Pending Company Approvals" and "Pending Drive Approvals" tables with
     Approve/Reject buttons that call the corresponding PUT endpoint, then re-fetch
     the dashboard data on success.
   - Keep it visually close to the old dashboard.html (badges, table-hover, card headers).

5. Create static/js/components/AdminLayout.js — a simple layout component with a Bootstrap
   navbar (Dashboard / Manage dropdown with Students, Companies, Drives, Applications /
   Logout button calling window.auth.logout() + router.push('/login')), and a
   <router-view></router-view> below it for the nested admin pages.

6. Create static/js/router.js:
   - Routes: '/login' -> Login, '/admin' (component: AdminLayout) with nested children:
     'dashboard' -> AdminDashboard (path '/admin/dashboard').
     Leave placeholders for '/admin/companies', '/admin/students', '/admin/drives',
     '/admin/applications', '/admin/students/:id' as simple "Coming soon" components for now
     (Step 3 and 4 will replace these).
   - Add a global beforeEach navigation guard: if route requires admin/company/student role
     (use route.meta.role) and localStorage token/role don't match, redirect to '/login'.
     If already logged in and visiting '/login' or '/', redirect to the right dashboard.

7. Create static/js/app.js: instantiate `new Vue({ router, el: '#app' })`.

8. In app.py, the existing catch-all serve_vue() route already serves templates/index.html
   for non-api/static paths — leave it as is, just confirm it still works.
```

### Files added
- `templates/index.html`
- `static/js/config.js`
- `static/js/router.js`
- `static/js/app.js`
- `static/js/components/Login.js`
- `static/js/components/AdminLayout.js`
- `static/js/components/admin/AdminDashboard.js`

### Files to delete
- `templates/auth/login.html` (replaced by the Vue Login component) — **only delete once you confirm the new login page works**, since company/student login also depends on it until Milestones 4/5 are done. If you'd rather be safe, leave it for now and just stop linking to it.

### Test before moving on
1. Visit `http://127.0.0.1:5000/` → should redirect to `/login` and render the Vue login page (not a blank page or 404).
2. Log in as admin (`admin@placementportal.com` / `admin123`) → should land on `/admin/dashboard`.
3. Dashboard should show real counts and the pending companies/drives tables.
4. Click Approve/Reject on a pending company → row should disappear/update and counts refresh.
5. Click Logout → should clear token and bounce back to `/login`.
6. Manually visit `/admin/dashboard` in a fresh incognito tab (no token) → should redirect to `/login`, not show the dashboard.

---

## Step 3 — Admin Companies + Students (+ Student Detail) pages

### Goal
Build the remaining "people management" screens: Companies list and Students list/detail.

### Prompt for Claude
```
Build the Admin Companies and Admin Students (+ detail) pages for the Vue 2 SPA, replacing
the placeholder routes from Step 2.

1. Create static/js/components/admin/AdminCompanies.js:
   - Mirror templates/admin/companies.html: search box (q), status filter dropdown,
     select-all checkbox + per-row checkbox (only for Pending rows), bulk Approve/Reject
     buttons, per-row Blacklist/Unblacklist and Delete buttons (with a confirm() before delete).
   - Wire to GET /api/admin/companies?q=&status=, PUT approve/reject/blacklist,
     DELETE, and POST bulk-status. Re-fetch (or splice locally) after each action.
   - Use route query params for q/status so the URL reflects filters (like the old page).

2. Create static/js/components/admin/AdminStudents.js:
   - Mirror templates/admin/students.html: search box, table with Blacklist/Unblacklist,
     Delete (with confirm()), and a "View" link/router-link to /admin/students/:id.
   - Wire to GET /api/admin/students?q=, PUT blacklist, DELETE.

3. Create static/js/components/admin/AdminStudentDetail.js:
   - Mirror templates/admin/student_detail.html: profile card (name, email, phone,
     education, CGPA, skills, blacklist badge, Blacklist/Unblacklist button, "View Resume"
     link if resume_path exists pointing at GET /api/admin/students/:id/resume), and an
     application history table below (job title, company, location, applied date, status badge).
   - Wire to GET /api/admin/students/:id (student + applications combined) and PUT blacklist.

4. Update static/js/router.js: replace the '/admin/companies', '/admin/students', and
   '/admin/students/:id' placeholder routes with these real components (keep the
   role: 'admin' meta and nested-under-AdminLayout structure from Step 2).

5. Update AdminLayout.js's nav dropdown links if any pointed at placeholder text —
   they should already router-link correctly since paths didn't change.
```

### Files added
- `static/js/components/admin/AdminCompanies.js`
- `static/js/components/admin/AdminStudents.js`
- `static/js/components/admin/AdminStudentDetail.js`

### Files changed
- `static/js/router.js`
- `templates/index.html` (add the 3 new `<script>` tags for the files above, before `app.js`)

### Test before moving on
1. `/admin/companies` — search works, status filter works, approve/reject/blacklist/delete each work and update the table without a full page reload.
2. Select 2+ pending companies → bulk Approve → both flip to Approved.
3. `/admin/students` — search works, blacklist toggles, delete removes the row (with confirm prompt).
4. Click a student's "View" → lands on `/admin/students/<id>` showing correct profile + application history.
5. If that student has a resume, "View Resume" opens/downloads the file correctly (test the JWT-protected file route works from a plain link — if it 401s because the browser doesn't send the Authorization header on a plain `<a href>` click, note it and use `axios` + blob download instead, or a short-lived query-param token).

---

## Step 4 — Admin Drives + Applications pages

### Goal
Finish the remaining two admin list pages.

### Prompt for Claude
```
Build the Admin Drives and Admin Applications pages for the Vue 2 SPA, replacing the
remaining placeholder routes.

1. Create static/js/components/admin/AdminDrives.js:
   - Mirror templates/admin/drives.html: status filter dropdown, company filter dropdown
     (populate from a simple GET /api/admin/companies call, or add a lightweight
     GET /api/admin/companies?minimal=1 if you'd rather not fetch full company objects),
     select-all + per-row checkboxes, bulk Approve/Reject buttons, table showing job title,
     company, deadline, applicant count, status badge.
   - Wire to GET /api/admin/drives?status=&company_id=, POST bulk-status.
   - (Individual approve/reject buttons per row are optional here since bulk exists, but
     add them if it's quick — match the old page's spirit of quick actions.)

2. Create static/js/components/admin/AdminApplications.js:
   - Mirror templates/admin/applications.html: simple table (#, student name linking to
     /admin/students/:id, job title, company, applied date, status badge). No filters needed
     unless trivial to add.
   - Wire to GET /api/admin/applications.

3. Update static/js/router.js: replace the '/admin/drives' and '/admin/applications'
   placeholder routes with these real components.

4. Update templates/index.html: add the 2 new <script> tags before app.js.

5. Do a final pass on static/js/components/admin/AdminDashboard.js to make sure its
   stat-card links (/admin/students, /admin/companies, /admin/drives, /admin/applications)
   all now resolve to real pages instead of placeholders.
```

### Files added
- `static/js/components/admin/AdminDrives.js`
- `static/js/components/admin/AdminApplications.js`

### Files changed
- `static/js/router.js`
- `templates/index.html`

### Test before moving on
1. `/admin/drives` — status + company filters work, bulk approve/reject works, applicant counts are correct.
2. `/admin/applications` — full list loads, student name links to the correct student detail page.
3. From `/admin/dashboard`, click each of the 4 stat cards → each lands on the correct, working page.

---

## Step 5 — Polish, error handling, and final Milestone 3 sign-off

### Goal
Tie loose ends: consistent loading/error UX, 401/403 handling, remove now-dead code, and a
final checklist pass against the milestone spec.

### Prompt for Claude
```
Do a final polish pass on the Admin section of the Vue 2 SPA:

1. Add a small reusable loading spinner and error alert pattern used consistently across
   AdminDashboard, AdminCompanies, AdminStudents, AdminStudentDetail, AdminDrives,
   AdminApplications — each should show a spinner while its initial GET is in flight, and
   a dismissible Bootstrap alert-danger if a request fails, instead of a blank/broken page.

2. Confirm static/js/config.js's axios response interceptor correctly handles:
   - 401 (invalid/expired token) -> clear localStorage, router.push('/login')
   - 403 (wrong role / blacklisted / not approved) -> show a Bootstrap toast or alert with
     the server's "msg" instead of a silent failure.

3. Sweep routes/admin.py once more and remove any leftover unused imports
   (render_template, flash, redirect, url_for) now that everything returns jsonify.

4. Confirm templates/admin/ folder is fully deleted and there are no dangling
   url_for('admin.xxx') references anywhere left in the codebase (grep for "admin\." in
   templates/ — should only be inside files that no longer exist).

5. Give me a short markdown checklist confirming, for each of these, that it works end to end:
   - Admin login -> dashboard
   - Approve/reject a company (single + bulk)
   - Blacklist/unblacklist + delete a company
   - Approve/reject a drive (single + bulk)
   - Delete a drive
   - Search/filter/blacklist/delete a student
   - View a student's detail page + resume
   - View all applications
   - Logout, then confirm all /admin/* routes redirect to /login when logged out
```

### Files changed
- `static/js/config.js`
- `static/js/components/admin/*.js` (minor edits only — loading/error states)
- `routes/admin.py` (cleanup only)

### Files to delete (if not already)
- `templates/admin/` folder, if any file in it survived earlier steps

### Test before moving on
Run through the checklist Claude gives you at the end of this step manually in the browser.
Once every item passes, Milestone 3 is done.

```
git add .
git commit -m "feat(admin): admin dashboard and management API + Vue components"
```

---

## Quick reference: full file map after Milestone 3

```
routes/
  admin.py                          ← MODIFIED (pure JSON API, /api/admin/*)

templates/
  index.html                        ← NEW (Vue SPA entry point)
  admin/                             ← DELETED (all 6 files)

static/js/
  config.js                         ← NEW (axios instance, interceptors, auth helpers)
  router.js                         ← NEW (vue-router routes + nav guard)
  app.js                            ← NEW (Vue instance bootstrap)
  components/
    Login.js                        ← NEW
    AdminLayout.js                  ← NEW
    admin/
      AdminDashboard.js             ← NEW
      AdminCompanies.js             ← NEW
      AdminStudents.js              ← NEW
      AdminStudentDetail.js         ← NEW
      AdminDrives.js                ← NEW
      AdminApplications.js          ← NEW
```

Company (Milestone 4) and Student (Milestone 5) sections still use their old Jinja2 templates
and `routes/company.py` / `routes/student.py` until you tackle those milestones — don't delete
`templates/company/`, `templates/student/`, or `templates/base.html` yet.
