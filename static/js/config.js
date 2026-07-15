/**
 * config.js — shared axios instance, JWT interceptors, and auth helpers.
 * Must load before any component/router script that uses window.api / window.auth.
 */
(function () {
  var api = axios.create({ baseURL: '/api' });

  // Attach the JWT (if present) to every outgoing request.
  api.interceptors.request.use(function (config) {
    var token = window.auth.getToken();
    if (token) {
      config.headers.Authorization = 'Bearer ' + token;
    }
    return config;
  });

  // On 401 (missing/invalid/expired token), clear session and bounce to /login.
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
