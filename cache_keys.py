"""
cache_keys.py — centralizes cache key naming for Milestone 8 so a route's
@cache.cached key_prefix and the cache.delete()/invalidate_namespace() calls
that invalidate it later can never drift apart on the naming convention.

Cache expiry & refresh policy (the rubric's third bullet — documented here,
not just implemented in the route files):

  - student_drives  : 5 min TTL. Only the unfiltered view (q='') is ever
                       cached (see routes/student.py's `unless=`) — actual
                       search queries are cheap one-off `ilike` lookups and
                       are never cached, so a student's search results can
                       never go stale. Invalidated immediately on any write
                       that changes whether a drive is 'Approved' (admin
                       approve/reject/bulk/delete, company close/reopen).

  - admin_companies  : 5 min TTL, cached across every q/status combination
                        an admin searches with. Invalidated immediately on
                        any write to Company (approve/reject/blacklist/
                        delete/bulk-status/new self-registration).

  - admin_students   : 5 min TTL, cached across every q combination an
                        admin searches with. Invalidated immediately on any
                        write to Student (blacklist/delete/new
                        self-registration).

TTLs above are a backstop for a write site nobody remembered to instrument,
not the primary invalidation mechanism — every write path listed above has
an explicit invalidation call at its call site (see routes/admin.py,
routes/company.py, routes/auth.py).
"""


def student_drives_key(q=''):
    return f'student_drives_{q or "all"}'


def admin_companies_key(q='', status=''):
    return f'admin_companies_{q or "all"}_{status or "all"}'


def admin_students_key(q=''):
    return f'admin_students_{q or "all"}'


def safe_get(key):
    """cache.get() that degrades to 'cache miss' on any Redis error instead
    of raising — a read-path cache failure must fall back to querying the
    database fresh, never surface as a 500 to the caller."""
    try:
        from extensions import cache
        return cache.get(key)
    except Exception as e:
        print(f'[CACHE WARNING] get({key!r}) failed: {e}')
        return None


def safe_set(key, value, timeout=300):
    """cache.set() that swallows Redis errors — a caching failure should
    never prevent the (already-computed, already-correct) response from
    being returned to the caller."""
    try:
        from extensions import cache
        cache.set(key, value, timeout=timeout)
    except Exception as e:
        print(f'[CACHE WARNING] set({key!r}) failed: {e}')


def safe_delete(key):
    """cache.delete() that swallows Redis errors — see invalidate_namespace's
    docstring: this always runs after a db.session.commit() has already
    succeeded, so it must never turn a successful write into a client-visible
    500. TTL is the backstop if this silently no-ops."""
    try:
        from extensions import cache
        cache.delete(key)
    except Exception as e:
        print(f'[CACHE WARNING] delete({key!r}) failed: {e}')


def remember_key(namespace, key):
    """Track a generated cache key under its namespace in Redis itself, so
    invalidate_namespace() can clear every variant later even though
    flask_caching's RedisCache backend has no built-in 'clear by prefix'
    primitive. Safe to call on every cache miss — a key already present in
    the tracked list is a no-op.

    Wrapped in try/except: if Redis is unreachable, this silently no-ops
    rather than raising. remember_key() is called from the read path right
    before returning a freshly-computed response — a cache bookkeeping
    failure here must never turn a successful read into a client-visible
    500."""
    try:
        from extensions import cache
        tracked = cache.get(f'_tracked_{namespace}') or []
        if key not in tracked:
            tracked.append(key)
            cache.set(f'_tracked_{namespace}', tracked, timeout=600)
    except Exception as e:
        print(f'[CACHE WARNING] remember_key({namespace!r}) failed: {e}')


def invalidate_namespace(namespace):
    """Clear every cache key ever tracked under this namespace. Call this
    from a write route instead of trying to guess which exact query-string
    variant(s) a write could have made stale.

    Wrapped in try/except for the same reason as remember_key(): this is
    always called AFTER db.session.commit() has already succeeded, so a
    Redis outage here must degrade to 'cache might be briefly stale until
    its TTL expires' — not turn an already-successful database write into
    a client-visible 500. The TTL set on every cached read is the backstop
    for exactly this scenario."""
    try:
        from extensions import cache
        tracked = cache.get(f'_tracked_{namespace}') or []
        for key in tracked:
            cache.delete(key)
        cache.delete(f'_tracked_{namespace}')
    except Exception as e:
        print(f'[CACHE WARNING] invalidate_namespace({namespace!r}) failed: {e}')
