# Milestone 8 — Redis Caching

Depends on Milestones 1–7 (all APIs done, Celery + Redis wired up in M7).
Milestone 8 adds a read-through cache in front of five high-traffic,
low-write GET endpoints, using the `cache` object `extensions.py` already
exports and `app.py` already calls `cache.init_app(app)` on — **no new
extension wiring is needed**, this milestone only touches route files.

**What's already in place (from M7 — don't redo):**
- `extensions.py` → `cache = Cache()`
- `config.py` → `CACHE_TYPE = 'redis'`, `CACHE_REDIS_URL = REDIS_URL + '/1'`
  (DB 1, separate from Celery's broker on DB 0), `CACHE_DEFAULT_TIMEOUT = 300`
- `app.py` → `cache.init_app(app)` already called inside `create_app()`

**What M8 adds:**
- `@cache.cached(...)` on 5 specific GET endpoints (see table below)
- Explicit `cache.delete(...)` calls at every write site that can make one
  of those 5 endpoints' cached response stale
- A tiny `cache_keys.py` helper module so the key-naming convention used by
  `@cache.cached(key_prefix=...)` and `cache.delete(...)` can't drift apart
  between files

---

## Which endpoints get cached, and their invalidation triggers

| Endpoint | TTL | Cache key | Invalidate when |
|---|---|---|---|
| `GET /api/student/drives` | 5 min | `student_drives_{q}` (per search query) | a drive is approved/rejected/closed/reopened/deleted, or a new one is created |
| `GET /api/admin/dashboard` | 2 min | `admin_dashboard` | literally any write anywhere (company/drive/student/application mutation) |
| `GET /api/admin/companies` | 5 min | `admin_companies_{q}_{status}` | a company is approved/rejected/blacklisted/deleted/bulk-updated, or a new one registers |
| `GET /api/admin/students` | 5 min | `admin_students_{q}` | a student is blacklisted/deleted, or a new one registers |
| `GET /api/company/drives/<id>/applications` | 2 min | `company_drive_apps_{drive_id}_{tab}_{sort}` | a new application arrives for that drive, or any application on that drive changes status/gets an interview/gets selected |

Two of these (`student_drives`, `admin_companies`, `admin_students`) vary
their response by query string, so **the cache key must include the query
params** — caching a single key across all searches would return student
A's search results to student B searching for something completely
different.

---

## Step 1 — `cache_keys.py` (new file)

A single place that builds cache keys, so route files and their
invalidation call sites can't drift out of sync on the naming convention.

```python
# cache_keys.py
"""
cache_keys.py — centralizes cache key naming so a route's @cache.cached
key_prefix and the cache.delete() calls that invalidate it can never drift
apart. Import the *_key() functions everywhere a cached endpoint is defined
or invalidated — never hand-write a cache key string outside this file.
"""


def student_drives_key(q=''):
    return f'student_drives_{q or "all"}'


def admin_dashboard_key():
    return 'admin_dashboard'


def admin_companies_key(q='', status=''):
    return f'admin_companies_{q or "all"}_{status or "all"}'


def admin_students_key(q=''):
    return f'admin_students_{q or "all"}'


def company_drive_apps_key(drive_id, tab='all', sort='date'):
    return f'company_drive_apps_{drive_id}_{tab}_{sort}'
```

**Test criteria:**
- `python -c "from cache_keys import student_drives_key; print(student_drives_key('python'))"`
  prints `student_drives_python`.

---

## Step 2 — Cache `GET /api/student/drives`

**File:** `routes/student.py`

```python
from cache_keys import student_drives_key
from extensions import cache

@student_bp.route('/drives')
@student_required
@cache.cached(timeout=300, query_string=True,
              key_prefix=lambda: student_drives_key(request.args.get('q', '')))
def list_drives():
    ...   # body unchanged
```

> `flask_caching`'s `@cache.cached` accepts either a static `key_prefix`
> string or a callable. Use the callable form here (not `query_string=True`
> alone) so the key stays human-readable and matches exactly what
> `cache_keys.student_drives_key()` produces elsewhere — `query_string=True`
> alone would hash the full query string into an opaque key that
> `cache.delete()` can't reconstruct without also hashing.

**Invalidation.** Any admin action that changes which drives are
`Approved` must clear this cache. Since the cache key varies per search
term, and a single write can't predict every `q` a student might have
searched with, the pragmatic approach is `cache.delete_memoized` is not
usable here (this isn't a memoized function) — instead, **clear the whole
`student_drives_*` namespace** on any drive status change. `flask_caching`'s
Redis backend supports pattern-based clears via `cache.cache._write_client`
only if you reach into the raw client, which couples route code to a
specific backend. Simpler and backend-agnostic: track the last-approved
drives with a single un-parameterized cache **only for the no-search-term
case** (`q=''`, the common case — a student who just opened Browse Drives),
and skip caching for actual search queries, which are cheap one-off
`ilike` queries anyway and don't need the cache.

Adjust Step 2's decorator accordingly:

```python
from flask import request

def _drives_cache_key():
    q = request.args.get('q', '').strip()
    return student_drives_key(q) if not q else None  # None -> caching skipped for this request


@student_bp.route('/drives')
@student_required
@cache.cached(timeout=300, key_prefix=_drives_cache_key, unless=lambda: bool(request.args.get('q', '').strip()))
def list_drives():
    ...
```

`unless=` is the flask_caching kwarg for "skip caching for this request
entirely" — using it here means only the unfiltered "all approved drives"
view is ever cached, which is also the single most-hit request pattern
(every student landing on Browse Drives with no query yet typed).

**File:** `routes/admin.py` — add invalidation to every route that changes
a drive's approval status:

```python
from extensions import cache
from cache_keys import student_drives_key, admin_dashboard_key

# inside approve_drive, reject_drive, bulk_drive_status, delete_drive:
cache.delete(student_drives_key(''))
cache.delete(admin_dashboard_key())
```

**File:** `routes/company.py` — same two lines inside `update_drive_status`
(close/reopen) and `create_drive` (a newly Pending drive doesn't affect the
student-visible cache, but a re-opened Approved one does — add the
invalidation call at the point `drive.status` actually flips to `Approved`
or away from it, not on every write).

**Test criteria:**
- Hit `GET /api/student/drives` twice in a row (no `q`) — second call
  should be noticeably faster (served from cache; check with
  `time curl ...` or Flask debug logs showing no SQL executed).
- Approve a new drive as admin, then hit `GET /api/student/drives` again —
  the newly approved drive must appear immediately, not after 5 minutes.
- `GET /api/student/drives?q=python` is never cached (verify by adding a
  temporary `print()` inside `list_drives` and confirming it runs on every
  call, not just the first).

---

## Step 3 — Cache `GET /api/admin/dashboard`

**File:** `routes/admin.py`

```python
from extensions import cache
from cache_keys import admin_dashboard_key

@admin_bp.route('/dashboard')
@admin_required
@cache.cached(timeout=120, key_prefix=admin_dashboard_key)
def dashboard():
    ...   # body unchanged
```

**Invalidation.** This is the broadest cache in the milestone — the
dashboard's counts touch students, companies, drives, and applications, so
almost every mutating endpoint across `admin.py`, `company.py`, and
`student.py` needs one line added. Rather than hunting down every call
site individually, add a single helper and call it from each blueprint's
existing serializer-adjacent imports:

```python
# cache_keys.py — add:
def invalidate_admin_dashboard():
    from extensions import cache
    cache.delete(admin_dashboard_key())
```

Then call `invalidate_admin_dashboard()` at the end of (i.e. right before
the `return jsonify(...)` in) every route that creates/deletes/updates a
`Company`, `PlacementDrive`, `Student`, or `Application` row:

- `routes/admin.py`: `approve_company`, `reject_company`, `blacklist_company`,
  `delete_company`, `bulk_company_status`, `approve_drive`, `reject_drive`,
  `delete_drive`, `bulk_drive_status`, `blacklist_student`, `delete_student`
- `routes/company.py`: `create_drive`, `update_drive_status`, `delete_drive`,
  `select_application` (new Placement), `create_interview`
- `routes/student.py`: `apply` (new Application), `register_student` in
  `routes/auth.py` (new Student, changes the total count)
- `routes/auth.py`: `register_company` (new Company, changes the total count)

**Test criteria:**
- Hit `/api/admin/dashboard`, note `total_students`.
- Register a new student via `POST /api/auth/register/student`.
- Hit `/api/admin/dashboard` again immediately — `total_students` must be
  incremented, not stale for up to 2 minutes.

---

## Step 4 — Cache `GET /api/admin/companies` and `GET /api/admin/students`

**File:** `routes/admin.py`

```python
from cache_keys import admin_companies_key, admin_students_key

def _companies_cache_key():
    return admin_companies_key(request.args.get('q', ''), request.args.get('status', ''))

def _students_cache_key():
    return admin_students_key(request.args.get('q', ''))


@admin_bp.route('/companies')
@admin_required
@cache.cached(timeout=300, key_prefix=_companies_cache_key)
def companies():
    ...

@admin_bp.route('/students')
@admin_required
@cache.cached(timeout=300, key_prefix=_students_cache_key)
def students():
    ...
```

Unlike Step 2, these two are cached **for every query string**, not just
the empty one — admin search terms are far less varied than student search
terms in practice (a handful of admins re-searching the same few pending
companies), so the cache hit rate justifies it, and staleness on a rare
new search term for up to 5 minutes is an acceptable trade here (unlike
the drives list, which gates whether a student *can apply at all*).

**Invalidation.** Same broad-clear approach as Step 3 — a query-string
cache can't be selectively cleared for "the query strings that matched
this one company" without a much larger key-tracking system than this
milestone calls for, so clear the whole namespace on any write.
`flask_caching`'s `RedisCache` backend supports `cache.clear()` for the
whole cache, which is too broad (would also evict the drives/dashboard
caches). Instead, track keys explicitly with a small in-Redis set:

```python
# cache_keys.py — add:
def remember_key(namespace, key):
    """Track a generated cache key under its namespace so invalidate_namespace
    can clear every variant later, even though flask_caching itself has no
    'clear by prefix' primitive for RedisCache."""
    from extensions import cache
    tracked = cache.get(f'_tracked_{namespace}') or []
    if key not in tracked:
        tracked.append(key)
        cache.set(f'_tracked_{namespace}', tracked, timeout=600)


def invalidate_namespace(namespace):
    from extensions import cache
    tracked = cache.get(f'_tracked_{namespace}') or []
    for key in tracked:
        cache.delete(key)
    cache.delete(f'_tracked_{namespace}')
```

Call `remember_key('admin_companies', _companies_cache_key())` /
`remember_key('admin_students', _students_cache_key())` at the top of each
cached view (before the `@cache.cached` short-circuits on a hit — so put
the `remember_key` call in a lightweight `before_request`-style wrapper, or
simplest: call it manually right inside the view body, since
`flask_caching` still executes the wrapped function once per unique key
even on a cache miss and skips it on a hit; recording on the *miss* path is
sufficient because a namespace can only have new keys added when a query
that hasn't been cached yet runs).

Then in every mutation route:
```python
from cache_keys import invalidate_namespace
invalidate_namespace('admin_companies')   # in company approve/reject/blacklist/delete/bulk, and company self-registration
invalidate_namespace('admin_students')    # in student blacklist/delete, and student self-registration
```

**Test criteria:**
- Search `/api/admin/companies?q=tech`, get a result, blacklist that
  company, search the same `q=tech` again — blacklist status must show
  updated immediately.
- Search `/api/admin/companies?q=finance` (a different, previously
  uncached query) after the above — must also reflect current data (proves
  the whole namespace was cleared, not just the one key that was written to).

---

## Step 5 — Cache `GET /api/company/drives/<id>/applications`

**File:** `routes/company.py`

```python
from cache_keys import company_drive_apps_key, remember_key, invalidate_namespace

def _drive_apps_cache_key(drive_id):
    return company_drive_apps_key(drive_id, request.args.get('tab', 'all'), request.args.get('sort', 'date'))


@company_bp.route('/drives/<int:drive_id>/applications')
@company_required
@cache.cached(timeout=120, key_prefix=lambda: _drive_apps_cache_key(request.view_args['drive_id']))
def drive_applications(drive_id):
    remember_key(f'company_drive_apps_{drive_id}', _drive_apps_cache_key(drive_id))
    ...   # body unchanged
```

**Invalidation** — call `invalidate_namespace(f'company_drive_apps_{drive_id}')`
at the end of:
- `student.apply()` in `routes/student.py` — a new application on that
  drive changes the counts/list (needs the `drive_id` from the request body)
- `update_status`, `bulk_update_status`, `select_application`,
  `create_interview` in `routes/company.py` — all change an application's
  status or add an interview for a specific `drive_id`, obtainable via
  `application.drive_id`

**Test criteria:**
- Open a drive's applicants page as the company, note the "Applied" tab
  count.
- As a student (separate session), apply to that drive.
- Refresh the company's applicants page within the 2-minute TTL — the new
  applicant and updated count must appear immediately, not after the cache
  expires.
- Shortlist a candidate, switch tabs, switch back — counts must reflect
  the move immediately.

---

## Step 6 — Polish pass

1. **`pyflakes cache_keys.py`** on every modified route file — expect zero
   unused-import output (some files will now import `cache`, `request`,
   and the relevant `cache_keys` functions that weren't there before).

2. **Verify DB isolation** — confirm the cache actually lives on Redis DB 1,
   not DB 0 (which Celery's broker/result-backend use in M7):
   ```bash
   redis-cli -n 1 keys '*'     # should show admin_dashboard, student_drives_all, etc. after some traffic
   redis-cli -n 0 keys '*'     # should show Celery's own internal keys, not app cache keys
   ```

3. **Cold-cache correctness sweep** — for each of the 5 cached endpoints,
   restart the Flask process (clears nothing, since cache lives in Redis,
   but confirms cold-start behavior), hit the endpoint once (cache miss,
   populates), hit it again (cache hit), then perform the matching write
   action and hit it a third time (must show fresh data, not the cached
   miss-then-hit value from steps one/two).

4. **Confirm no endpoint outside the 5-row table gained a `@cache.cached`
   decorator** — anything else (individual drive/company/student detail
   views, all POST/PUT/DELETE routes) must remain uncached; caching a
   detail-by-id view is lower value here since IDs are far more varied than
   the 5 chosen list/dashboard endpoints, and caching a mutation response
   would be a correctness bug, not a performance win.

5. **`redis-cli -n 1 flushdb`** as a manual "nuke the cache" escape hatch —
   confirm the app still works correctly with a cold cache (i.e. nothing
   assumes a key already exists).

**Commit:** `feat(cache): Redis API caching for performance optimization`

---

## Notes specific to Milestone 8

**Why not `flask_caching`'s built-in `delete_memoized`?** That decorator
family (`@cache.memoize`) is for caching a Python function's return value
keyed by its arguments, and is designed for internal helper functions, not
Flask view functions serving different query strings to different users.
`@cache.cached` (view-level) plus the explicit `cache.delete(...)` /
`invalidate_namespace(...)` pattern above is the more predictable choice
for HTTP endpoints where the invalidation trigger (a specific write) is far
away in the code from the read (a different blueprint, even) — memoization
hides that relationship, explicit key names make it greppable.

**Why track keys manually instead of a wildcard `cache.delete_many` by
pattern?** `flask_caching`'s abstraction over Redis doesn't expose
`SCAN`/`KEYS` pattern deletion portably (the underlying cache backend could
be swapped to something without pattern support), so the `_tracked_*`
list-in-Redis approach in Step 4 keeps invalidation working regardless of
backend, at the cost of a small amount of bookkeeping code.

**TTLs are a backstop, not the primary invalidation mechanism.** Every
cached endpoint here has explicit `cache.delete()`/`invalidate_namespace()`
calls at its write sites — the 2–5 minute TTLs in the table exist so that a
write site someone forgets to instrument (or a write made directly via
`flask shell`/`sqlite3` outside the API) can't leave stale data cached
forever, not so staleness is "expected" during normal API-only usage.

**Order relative to Milestone 7.** This milestone assumes Celery/Redis (M7)
is already running, since `CACHE_REDIS_URL` and `CELERY_BROKER_URL` share
the same Redis server (different DB indexes). If M7 hasn't been deployed
yet in a given environment, `cache.init_app(app)` will still succeed at
import time, but every `@cache.cached` call will raise a connection error
at request time — same class of failure as M7's `.delay()` calls, so reuse
the same graceful-degradation instinct: a cache backend being down should
degrade to "always compute fresh" (`flask_caching` does this automatically
by default — cache set/get failures are logged, not raised, unlike
Celery's `.delay()` which does raise). No extra try/except needed here,
unlike the M7 export endpoint.

**Don't cache anything role-sensitive by accident.** All 5 chosen endpoints
happen to return either fully public-within-role data (any admin sees the
same admin dashboard/company list) or ownership-scoped-by-URL data (a
company's own drive's applicants, keyed by `drive_id` which is already
part of the cache key). Be careful if extending this pattern to a
student-specific endpoint like `/api/student/dashboard` — caching that
naively with a shared key would leak one student's data to the next
student who hits the (differently-scoped-by-JWT-but-not-by-cache-key)
endpoint. None of the 5 endpoints in this milestone have that risk, but
it's the reason `/api/student/dashboard` and `/api/student/applications`
were deliberately left off the cache list.
