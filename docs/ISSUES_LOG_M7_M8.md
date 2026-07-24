# Issues Log — Milestones 7 & 8 (Placement Portal)

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
