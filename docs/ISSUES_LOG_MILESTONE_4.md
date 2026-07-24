# Milestone 4 — Issues Log

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
