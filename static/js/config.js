/**
 * config.js — shared axios instance, JWT interceptors, and auth helpers.
 * Must load before any component/router script that uses window.api / window.auth.
 */
(function () {
  var api = axios.create({ baseURL: '/api' });

  // Minimal Bootstrap 5 toast helper for surfacing errors that aren't tied to a
  // specific component's inline <error-alert> (e.g. 403s on background actions).
  // Lazily creates a single top-right toast container and reuses it.
  function showToast(message) {
    var container = document.getElementById('pp-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pp-toast-container';
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      container.style.zIndex = 1080;
      document.body.appendChild(container);
    }

    var toastEl = document.createElement('div');
    toastEl.className = 'toast align-items-center text-bg-danger border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML =
      '<div class="d-flex">' +
      '  <div class="toast-body"></div>' +
      '  <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>' +
      '</div>';
    // textContent, not innerHTML, for the message itself — avoids injecting
    // unescaped server text into the DOM.
    toastEl.querySelector('.toast-body').textContent = message;

    container.appendChild(toastEl);
    var toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', function () {
      toastEl.remove();
    });
  }
  window.showToast = showToast;

  // Attach the JWT (if present) to every outgoing request.
  api.interceptors.request.use(function (config) {
    var token = window.auth.getToken();
    if (token) {
      config.headers.Authorization = 'Bearer ' + token;
    }
    return config;
  });

  // 401 (missing/invalid/expired token) -> clear session, bounce to /login.
  // 403 (wrong role / blacklisted / not approved) -> surface the server's msg via
  // a toast instead of failing silently; the request's own .catch() still runs too,
  // so components with an inline <error-alert> show it there as well.
  api.interceptors.response.use(
    function (response) { return response; },
    function (error) {
      if (error.response && error.response.status === 401) {
        window.auth.logout();
        if (window.location.pathname !== '/login') {
          if (window.router) {
            window.router.push('/login').catch(function () {});
          } else {
            window.location.href = '/login';
          }
        }
      } else if (error.response && error.response.status === 403) {
        var msg = (error.response.data && error.response.data.msg) || 'You do not have access to perform this action.';
        if (typeof window.showToast === 'function') {
          window.showToast(msg);
        }
      }
      return Promise.reject(error);
    }
  );

  window.api = api;

  window.auth = {
    getToken: function () {
      return localStorage.getItem('token');
    },
    getRole: function () {
      return localStorage.getItem('role');
    },
    getUser: function () {
      return {
        id: localStorage.getItem('user_id'),
        email: localStorage.getItem('email'),
        role: localStorage.getItem('role')
      };
    },
    isAuthenticated: function () {
      return !!localStorage.getItem('token');
    },
    // data = { access_token, role, user_id, email } (the /api/auth/login response body)
    login: function (data) {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('email', data.email);
    },
    logout: function () {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('user_id');
      localStorage.removeItem('email');
    }
  };
})();
