/**
 * AdminApplications.js — full applications list, student name links to detail page.
 * Defines a global `AdminApplications` component consumed by router.js.
 */
const AdminApplications = {
  data: function () {
    return {
      apps: [],
      loading: true,
      error: ''
    };
  },
  mounted: function () {
    this.fetchApplications();
  },
  methods: {
    fetchApplications: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/applications')
        .then(function (res) {
          self.apps = res.data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load applications.';
        })
        .finally(function () {
          self.loading = false;
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
    '  <div class="d-flex justify-content-between align-items-center mb-3">' +
    '    <h4><i class="bi bi-file-earmark-text me-2"></i>All Applications</h4>' +
    '    <router-link to="/admin/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <div class="table-responsive" v-if="apps.length">' +
    '        <table class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>#</th><th>Student</th><th>Job Title</th><th>Company</th><th>Applied On</th><th>Status</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="(a, idx) in apps" :key="a.id">' +
    '              <td class="text-muted small">{{ idx + 1 }}</td>' +
    '              <td>' +
    '                <router-link :to="\'/admin/students/\' + a.student_id" class="text-decoration-none fw-semibold">' +
    '                  {{ a.student_name }}' +
    '                </router-link>' +
    '              </td>' +
    '              <td>{{ a.drive_job_title }}</td>' +
    '              <td>{{ a.company_name }}</td>' +
    '              <td>{{ fmtDate(a.applied_at) }}</td>' +
    '              <td><span class="badge" :class="statusBadgeClass(a.status)">{{ a.status }}</span></td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '      </div>' +
    '      <p v-else class="text-muted p-3 mb-0">No applications yet.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
