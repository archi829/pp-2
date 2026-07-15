/**
 * AdminStudentDetail.js — student profile card + application history + resume download.
 * Defines a global `AdminStudentDetail` component consumed by router.js.
 *
 * Resume note: /api/admin/students/:id/resume is a JWT-protected file route. A plain
 * <a href> click won't send the Authorization header, so "View Resume" instead fetches
 * the file via axios (which does attach the header) as a blob and opens it via a
 * short-lived object URL.
 */
const AdminStudentDetail = {
  data: function () {
    return {
      student: null,
      applications: [],
      loading: true,
      error: '',
      resumeBusy: false
    };
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler: function () {
        this.fetchDetail();
      }
    }
  },
  methods: {
    fetchDetail: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/students/' + self.$route.params.id)
        .then(function (res) {
          var data = res.data;
          self.applications = data.applications || [];
          delete data.applications;
          self.student = data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load student.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    toggleBlacklist: function () {
      var self = this;
      window.api.put('/admin/students/' + self.student.id + '/blacklist')
        .then(function () { self.fetchDetail(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update blacklist status.';
        });
    },
    viewResume: function () {
      var self = this;
      self.resumeBusy = true;
      window.api.get('/admin/students/' + self.student.id + '/resume', { responseType: 'blob' })
        .then(function (res) {
          // res.data is already a Blob (responseType: 'blob'), but it defaults to
          // application/octet-stream unless we pass the real content-type through —
          // without this the browser renders the raw PDF bytes as plain text instead
          // of opening a PDF viewer.
          var contentType = res.headers && res.headers['content-type']
            ? res.headers['content-type']
            : 'application/pdf';
          var blob = new Blob([res.data], { type: contentType });
          var url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(function () { window.URL.revokeObjectURL(url); }, 60000);
        })
        .catch(function () {
          self.error = 'Failed to load resume.';
        })
        .finally(function () {
          self.resumeBusy = false;
        });
    },
    statusBadgeClass: function (status) {
      return {
        Selected: 'bg-success',
        Rejected: 'bg-danger',
        Shortlisted: 'bg-info text-dark',
        'Interview Scheduled': 'bg-warning text-dark'
      }[status] || 'bg-secondary';
    },
    fmtDate: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  },
  template:
    '<div class="container mt-4">' +
    '' +
    '  <div class="mb-3">' +
    '    <router-link to="/admin/students" class="btn btn-sm btn-outline-secondary">← Back to Students</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <template v-else-if="student">' +
    '' +
    '    <div class="card mb-4">' +
    '      <div class="card-body">' +
    '        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">' +
    '          <div>' +
    '            <h4 class="fw-bold mb-1"><i class="bi bi-person-circle me-2 text-primary"></i>{{ student.full_name }}</h4>' +
    '            <p class="text-muted mb-1">{{ student.email }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-telephone me-1"></i>{{ student.phone || \'Phone not set\' }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-mortarboard me-1"></i>{{ student.education || \'Education not set\' }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-bar-chart me-1"></i>CGPA: <strong>{{ student.cgpa || \'—\' }}</strong></p>' +
    '            <p class="text-muted mb-0"><i class="bi bi-tools me-1"></i>Skills: {{ student.skills || \'Not listed\' }}</p>' +
    '          </div>' +
    '          <div class="d-flex flex-column gap-2 align-items-end">' +
    '            <span v-if="student.is_blacklisted" class="badge bg-danger fs-6">Blacklisted</span>' +
    '            <span v-else class="badge bg-success fs-6">Active</span>' +
    '' +
    '            <button v-if="student.resume_path" class="btn btn-outline-primary btn-sm" :disabled="resumeBusy" @click="viewResume">' +
    '              <span v-if="resumeBusy" class="spinner-border spinner-border-sm me-1"></span>' +
    '              <i v-else class="bi bi-eye me-1"></i>View Resume' +
    '            </button>' +
    '            <span v-else class="text-muted small">No resume uploaded</span>' +
    '' +
    '            <button class="btn btn-sm" :class="student.is_blacklisted ? \'btn-success\' : \'btn-warning\'" @click="toggleBlacklist">' +
    '              {{ student.is_blacklisted ? \'Unblacklist\' : \'Blacklist\' }}' +
    '            </button>' +
    '          </div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="card">' +
    '      <div class="card-header bg-white fw-semibold">' +
    '        <i class="bi bi-clock-history me-2 text-info"></i>Application History' +
    '        <span class="badge bg-secondary ms-2">{{ applications.length }}</span>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <table v-if="applications.length" class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>#</th><th>Job Title</th><th>Company</th><th>Location</th><th>Applied On</th><th>Status</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="(a, idx) in applications" :key="a.id">' +
    '              <td class="text-muted small">{{ idx + 1 }}</td>' +
    '              <td class="fw-semibold">{{ a.job_title }}</td>' +
    '              <td>{{ a.company_name }}</td>' +
    '              <td>{{ a.location || \'—\' }}</td>' +
    '              <td>{{ fmtDate(a.applied_at) }}</td>' +
    '              <td><span class="badge" :class="statusBadgeClass(a.status)">{{ a.status }}</span></td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '        <p v-else class="text-muted p-3 mb-0">This student has not applied to any drives yet.</p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '</div>'
};
