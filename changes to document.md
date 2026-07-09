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