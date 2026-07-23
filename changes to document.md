# 1. 
-  Interview model : Tracks a scheduled interview linked to a specific Application.
- Placement  Records a confirmed final placement. Created when a company marks an Application 'Selected' and the student accepts the offer.
    Password hashing — where does it actually live in your repo?
In auth.py:
pythonfrom werkzeug.security import generate_password_hash, check_password_hash
# line 120:  password_hash = generate_password_hash(password)   ← Student creation
# line 155:  password_hash = generate_password_hash(password)   ← Company creation
# line 67:   check_password_hash(user.password_hash, password)  ← Login
In api.py:
pythonfrom werkzeug.security import generate_password_hash
# line 63:  password_hash=generate_password_hash(args['password'])  ← Student POST
So it's already in two files — and in MAD2 you'll be writing new JWT auth routes which will be a third. That's the problem with keeping hashing in the routes.

Which is the better place — model or auth?
Model is better, and here's the concrete reason for your codebase specifically:
Your api.py already duplicates the hashing that auth.py does. The moment you add JWT routes in Milestone 2, you'd have three separate places calling generate_password_hash. If you ever need to change (e.g. add a pepper, switch algorithm, add validation before hashing), you'd have to find every call site.
set_password() / check_password() on the model is the right pattern because:

DRY — one place to change if the hashing logic ever changes
Encapsulation — the model owns its own data, including how passwords are stored and verified
Readable callsites — student.set_password(raw) is clearer than student.password_hash = generate_password_hash(raw) scattered around routes
MAD2 specifically — you'll have JWT login + registration + possibly admin-created accounts. All call set_password(), nothing changes

The reason your MAD1 code put it in auth.py is probably just because that's the quickest/most obvious place. It works fine for a small project with one auth file, but it's already showing the strain (api.py also imports it).

# 2.
Because it was solving a **server-side routing problem that no longer exists**.

In MAD1, the flow was:

```
Browser hits GET /login
  → Flask checks: is this user already logged in?
  → if yes, Flask picks a URL and sends HTTP 302 to the right dashboard
  → Browser follows the redirect
```

The server had to decide where to send the browser, so it needed `isinstance(current_user, Admin/Company/Student)` to pick the right URL.

---

In MAD2, the server never redirects for auth. The flow is:

```
Vue calls POST /api/auth/login
  → Flask returns JSON: { "role": "admin", "access_token": "..." }
  → Vue reads role from the response
  → Vue Router does router.push('/admin/dashboard')  ← client decides
```

The redirect decision moved entirely to the frontend. The server's job ends at returning the token and role. Vue already knows where to go because you told it in the JSON response.

`redirect_to_dashboard()` was also used in MAD1 to guard the login page itself — if a logged-in user accidentally navigated to `/login`, Flask would bounce them away. In MAD2, that guard also moves to Vue Router as a navigation guard:

```js
// Vue Router navigation guard — client-side equivalent
router.beforeEach((to, from) => {
  const token = localStorage.getItem('token')
  if (to.path === '/login' && token) {
    return '/admin/dashboard'  // or whichever role
  }
})
```

So the function isn't missing from `auth.py` — its entire responsibility was handed off to the frontend.

---

# 3. Milestone 8 — Redis Caching Improvements & Server Optimizations

### A. Per-Student Applied Drives Caching in Redis (`routes/student.py`)
- **Problem**: `GET /api/student/drives` previously hit SQLite on every request to compute `applied_drive_ids = [a.drive_id for a in student.applications]`, instantiating heavy ORM objects and preventing a 100% cache hit.
- **Solution**:
  1. Cached per-student applied drive IDs under `student_applied_ids_{student_id}` in Redis (5 min TTL).
  2. Optimized SQL fallback query to direct column extraction (`db.session.query(Application.drive_id)`), avoiding ORM model overhead.
  3. Added explicit invalidation via `safe_delete(f'student_applied_ids_{student.id}')` in `apply()` whenever a student submits a new application.
- **Outcome**: `GET /api/student/drives` now executes **0 database queries** on Redis cache hits.

### B. Multithreaded Flask Dev Server (`app.py`)
- **Problem**: Single-threaded `app.run()` queued incoming HTTP requests serially, causing 100ms–200ms queueing delays when browser extensions issued background fetch calls (`set-current-domain`, `manager-domain-data`) simultaneously.
- **Solution**: Enabled `threaded=True` in `app.run(debug=True, threaded=True)` to handle concurrent browser requests in parallel threads.

### C. Precision Server Timing Header (`app.py`)
- **Feature**: Added `@app.before_request` and `@app.after_request` hooks using `time.perf_counter()`.
- **Header**: Returns `X-Response-Time` in response headers (e.g. `X-Response-Time: 1.15ms`), providing exact server-side processing time independent of browser extension / network queueing.

### D. Centralized Cache Invalidation Audit (`cache_keys.py`, `routes/admin.py`, `routes/company.py`)
- Verified and documented `remember_key()` and `invalidate_namespace()` for multi-query namespaces (`admin_companies`, `admin_students`, `company_drive_apps`).
- Verified single-key direct invalidation via `safe_delete(student_drives_key(''))` for `student_drives_all`.