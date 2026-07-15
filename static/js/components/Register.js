/**
 * Register.js — student/company self-registration, mirrors the old
 * templates/auth/register.html fields. Wired to the existing (already-working)
 * POST /api/auth/register/student and POST /api/auth/register/company endpoints.
 * Defines a global `Register` component consumed by router.js.
 */
const Register = {
  data: function () {
    return {
      role: this.$route.query.role === 'company' ? 'company' : 'student',
      loading: false,
      error: '',
      submitted: false,   // company path only — pending admin approval, no auto-login
      submittedMsg: '',

      // student fields
      full_name: '',
      email: '',
      password: '',
      confirm_password: '',
      phone: '',
      cgpa: '',
      education: '',
      skills: '',
      resumeFile: null,

      // company fields
      company_name: '',
      hr_contact: '',
      industry: '',
      website: '',
      description: ''
    };
  },
  methods: {
    setRole: function (role) {
      this.role = role;
      this.error = '';
      this.$router.replace({ path: '/register', query: { role: role } }).catch(function () {});
    },
    onFileChange: function (e) {
      this.resumeFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    },
    submit: function () {
      var self = this;
      self.error = '';

      if (self.password !== self.confirm_password) {
        self.error = 'Passwords do not match.';
        return;
      }
      if (self.password.length < 6) {
        self.error = 'Password must be at least 6 characters.';
        return;
      }

      self.loading = true;

      if (self.role === 'student') {
        var formData = new FormData();
        formData.append('full_name', self.full_name);
        formData.append('email', self.email);
        formData.append('password', self.password);
        formData.append('confirm_password', self.confirm_password);
        formData.append('phone', self.phone);
        formData.append('cgpa', self.cgpa);
        formData.append('education', self.education);
        formData.append('skills', self.skills);
        if (self.resumeFile) {
          formData.append('resume', self.resumeFile);
        }

        window.api.post('/auth/register/student', formData)
          .then(function (res) {
            // Response has no `role` field (it's implicit for this endpoint) — add
            // it so window.auth.login() can store it like the shared /login response does.
            window.auth.login(Object.assign({}, res.data, { role: 'student' }));
            self.$router.push('/student/dashboard');
          })
          .catch(function (err) {
            self.error = (err.response && err.response.data && err.response.data.msg) || 'Registration failed. Please try again.';
          })
          .finally(function () {
            self.loading = false;
          });

      } else {
        window.api.post('/auth/register/company', {
          company_name: self.company_name,
          email: self.email,
          password: self.password,
          confirm_password: self.confirm_password,
          hr_contact: self.hr_contact,
          industry: self.industry,
          website: self.website,
          description: self.description
        })
          .then(function (res) {
            // Companies need admin approval before they can log in — no token issued yet.
            self.submitted = true;
            self.submittedMsg = res.data.msg || 'Registration submitted. Wait for admin approval before logging in.';
          })
          .catch(function (err) {
            self.error = (err.response && err.response.data && err.response.data.msg) || 'Registration failed. Please try again.';
          })
          .finally(function () {
            self.loading = false;
          });
      }
    }
  },
  template:
    '<div class="container mt-4 mb-5">' +
    '  <div class="row justify-content-center">' +
    '    <div class="col-md-7">' +
    '      <div class="card p-4">' +
    '' +
    '        <template v-if="submitted">' +
    '          <div class="text-center py-4">' +
    '            <i class="bi bi-check-circle-fill fs-1 text-success"></i>' +
    '            <h4 class="mt-3 fw-bold">Registration Submitted</h4>' +
    '            <p class="text-muted">{{ submittedMsg }}</p>' +
    '            <router-link to="/login" class="btn btn-dark mt-2">Go to Login</router-link>' +
    '          </div>' +
    '        </template>' +
    '' +
    '        <template v-else>' +
    '          <div class="text-center mb-4">' +
    '            <i :class="role === \'student\' ? \'bi bi-person-plus-fill\' : \'bi bi-building\'" class="fs-1 text-dark"></i>' +
    '            <h4 class="mt-2 fw-bold">{{ role === \'student\' ? \'Student Registration\' : \'Company Registration\' }}</h4>' +
    '            <p v-if="role === \'company\'" class="text-muted small">Your account needs admin approval before you can log in.</p>' +
    '          </div>' +
    '' +
    '          <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '          <form @submit.prevent="submit" enctype="multipart/form-data">' +
    '' +
    '            <template v-if="role === \'student\'">' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Full Name <span class="text-danger">*</span></label>' +
    '                  <input type="text" class="form-control" v-model="full_name" required>' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Email <span class="text-danger">*</span></label>' +
    '                  <input type="email" class="form-control" v-model="email" required>' +
    '                </div>' +
    '              </div>' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Password <span class="text-danger">*</span></label>' +
    '                  <input type="password" class="form-control" v-model="password" minlength="6" required>' +
    '                  <div class="form-text">Minimum 6 characters</div>' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Confirm Password <span class="text-danger">*</span></label>' +
    '                  <input type="password" class="form-control" v-model="confirm_password" required>' +
    '                </div>' +
    '              </div>' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Phone</label>' +
    '                  <input type="text" class="form-control" v-model="phone" placeholder="10-digit number" pattern="[0-9]{10}" title="Please enter exactly 10 digits">' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">CGPA</label>' +
    '                  <input type="number" class="form-control" v-model="cgpa" step="0.01" min="0" max="10" placeholder="e.g. 8.5">' +
    '                </div>' +
    '              </div>' +
    '              <div class="mb-3">' +
    '                <label class="form-label fw-semibold">Education</label>' +
    '                <input type="text" class="form-control" v-model="education" placeholder="e.g. B.Tech CSE, IIT Madras, 2025">' +
    '              </div>' +
    '              <div class="mb-3">' +
    '                <label class="form-label fw-semibold">Skills</label>' +
    '                <input type="text" class="form-control" v-model="skills" placeholder="e.g. Python, Flask, SQL, HTML">' +
    '                <div class="form-text">Comma separated</div>' +
    '              </div>' +
    '              <div class="mb-3">' +
    '                <label class="form-label fw-semibold">Upload Resume (PDF/DOC)</label>' +
    '                <input type="file" class="form-control" accept=".pdf,.doc,.docx" @change="onFileChange">' +
    '              </div>' +
    '' +
    '              <button type="submit" class="btn btn-dark w-100 mt-2" :disabled="loading">' +
    '                <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>' +
    '                <i v-else class="bi bi-person-check me-1"></i>{{ loading ? \'Submitting…\' : \'Register as Student\' }}' +
    '              </button>' +
    '            </template>' +
    '' +
    '            <template v-else>' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Company Name <span class="text-danger">*</span></label>' +
    '                  <input type="text" class="form-control" v-model="company_name" required>' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Email <span class="text-danger">*</span></label>' +
    '                  <input type="email" class="form-control" v-model="email" required>' +
    '                </div>' +
    '              </div>' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Password <span class="text-danger">*</span></label>' +
    '                  <input type="password" class="form-control" v-model="password" minlength="6" required>' +
    '                  <div class="form-text">Minimum 6 characters</div>' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Confirm Password <span class="text-danger">*</span></label>' +
    '                  <input type="password" class="form-control" v-model="confirm_password" required>' +
    '                </div>' +
    '              </div>' +
    '              <div class="row">' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">HR Contact Name</label>' +
    '                  <input type="text" class="form-control" v-model="hr_contact">' +
    '                </div>' +
    '                <div class="col-md-6 mb-3">' +
    '                  <label class="form-label fw-semibold">Industry</label>' +
    '                  <input type="text" class="form-control" v-model="industry" placeholder="e.g. Software, Finance">' +
    '                </div>' +
    '              </div>' +
    '              <div class="mb-3">' +
    '                <label class="form-label fw-semibold">Website</label>' +
    '                <input type="url" class="form-control" v-model="website" placeholder="https://yourcompany.com">' +
    '              </div>' +
    '              <div class="mb-3">' +
    '                <label class="form-label fw-semibold">Company Description</label>' +
    '                <textarea class="form-control" v-model="description" rows="3" placeholder="Brief description of your company..."></textarea>' +
    '              </div>' +
    '' +
    '              <button type="submit" class="btn btn-dark w-100 mt-2" :disabled="loading">' +
    '                <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>' +
    '                <i v-else class="bi bi-building-check me-1"></i>{{ loading ? \'Submitting…\' : \'Submit for Approval\' }}' +
    '              </button>' +
    '            </template>' +
    '' +
    '          </form>' +
    '' +
    '          <hr class="my-3">' +
    '          <p class="text-center text-muted small mb-1">' +
    '            Already have an account? <router-link to="/login">Login here</router-link>' +
    '          </p>' +
    '          <p v-if="role === \'student\'" class="text-center text-muted small mb-0">' +
    '            Are you a company? <a href="#" @click.prevent="setRole(\'company\')">Register as Company</a>' +
    '          </p>' +
    '          <p v-else class="text-center text-muted small mb-0">' +
    '            Are you a student? <a href="#" @click.prevent="setRole(\'student\')">Register as Student</a>' +
    '          </p>' +
    '        </template>' +
    '' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
