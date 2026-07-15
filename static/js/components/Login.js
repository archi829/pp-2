/**
 * Login.js — shared login page for admin/company/student.
 * Defines a global `Login` component consumed by router.js.
 */
const Login = {
  data: function () {
    return {
      role: '',
      email: '',
      password: '',
      loading: false,
      error: ''
    };
  },
  methods: {
    submit: function () {
      var self = this;
      self.error = '';

      if (!self.role) {
        self.error = 'Please select a role.';
        return;
      }

      self.loading = true;
      window.api.post('/auth/login', {
        email: self.email,
        password: self.password,
        role: self.role
      }).then(function (res) {
        window.auth.login(res.data);
        var dest = {
          admin: '/admin/dashboard',
          company: '/company/dashboard',
          student: '/student/dashboard'
        }[res.data.role] || '/login';
        self.$router.push(dest);
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Login failed. Please check your credentials and try again.';
      }).finally(function () {
        self.loading = false;
      });
    }
  },
  template:
    '<div class="container mt-5">' +
    '  <div class="row justify-content-center">' +
    '    <div class="col-md-5">' +
    '      <div class="card p-4">' +
    '' +
    '        <div class="text-center mb-4">' +
    '          <i class="bi bi-mortarboard-fill fs-1 text-dark"></i>' +
    '          <h4 class="mt-2 fw-bold">Sign In</h4>' +
    '          <p class="text-muted small mb-0">Placement Portal</p>' +
    '        </div>' +
    '' +
    '        <div v-if="error" class="alert alert-danger alert-dismissible fade show" role="alert">' +
    '          {{ error }}' +
    '          <button type="button" class="btn-close" @click="error = \'\'"></button>' +
    '        </div>' +
    '' +
    '        <form @submit.prevent="submit">' +
    '' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Login As</label>' +
    '            <div class="d-flex gap-2">' +
    '              <div class="form-check flex-fill border rounded p-2 text-center">' +
    '                <input class="form-check-input" type="radio" id="roleAdmin" value="admin" v-model="role" required>' +
    '                <label class="form-check-label d-block" for="roleAdmin">' +
    '                  <i class="bi bi-shield-lock d-block fs-5"></i>Admin' +
    '                </label>' +
    '              </div>' +
    '              <div class="form-check flex-fill border rounded p-2 text-center">' +
    '                <input class="form-check-input" type="radio" id="roleCompany" value="company" v-model="role">' +
    '                <label class="form-check-label d-block" for="roleCompany">' +
    '                  <i class="bi bi-building d-block fs-5"></i>Company' +
    '                </label>' +
    '              </div>' +
    '              <div class="form-check flex-fill border rounded p-2 text-center">' +
    '                <input class="form-check-input" type="radio" id="roleStudent" value="student" v-model="role">' +
    '                <label class="form-check-label d-block" for="roleStudent">' +
    '                  <i class="bi bi-person d-block fs-5"></i>Student' +
    '                </label>' +
    '              </div>' +
    '            </div>' +
    '          </div>' +
    '' +
    '          <div class="mb-3">' +
    '            <label for="email" class="form-label fw-semibold">Email</label>' +
    '            <input type="email" class="form-control" id="email" v-model="email"' +
    '                   placeholder="you@example.com" required>' +
    '          </div>' +
    '' +
    '          <div class="mb-3">' +
    '            <label for="password" class="form-label fw-semibold">Password</label>' +
    '            <input type="password" class="form-control" id="password" v-model="password"' +
    '                   placeholder="password" required>' +
    '          </div>' +
    '' +
    '          <button type="submit" class="btn btn-dark w-100 mt-1" :disabled="loading">' +
    '            <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>' +
    '            <i v-else class="bi bi-box-arrow-in-right me-1"></i>' +
    '            {{ loading ? \'Signing in…\' : \'Login\' }}' +
    '          </button>' +
    '        </form>' +
    '' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
