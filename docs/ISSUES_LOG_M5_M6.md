# Issues Log — Milestones 5 & 6

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
