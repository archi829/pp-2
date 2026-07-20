/**
 * StudentInterviews.js — GET /api/student/interviews (read-only).
 * Students see their scheduled interviews but cannot reschedule —
 * that's a company action. Shows job title, company, date/time, mode,
 * location/link, and status badge.
 * Defines a global `StudentInterviews` component consumed by router.js.
 */
const StudentInterviews = {
  data: function () {
    return {
      loading: true,
      error: '',
      interviews: []
    };
  },
  mounted: function () {
    this.fetchInterviews();
  },
  methods: {
    fetchInterviews: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/student/interviews').then(function (res) {
        self.interviews = res.data || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load interviews.';
      }).finally(function () {
        self.loading = false;
      });
    },
    statusBadgeClass: function (status) {
      var map = {
        'Scheduled': 'bg-info text-dark',
        'Completed': 'bg-success',
        'Cancelled': 'bg-danger'
      };
      return 'badge ' + (map[status] || 'bg-secondary');
    },
    fmtDateTime: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="d-flex justify-content-between align-items-center mb-3">' +
    '    <h4><i class="bi bi-calendar-event me-2"></i>My Interviews</h4>' +
    '    <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <div v-if="interviews.length" class="table-responsive">' +
    '        <table class="table table-hover align-middle mb-0">' +
    '          <thead class="table-light">' +
    '            <tr>' +
    '              <th>#</th><th>Job Title</th><th>Company</th><th>Date &amp; Time</th>' +
    '              <th>Mode</th><th>Location / Link</th><th>Status</th>' +
    '            </tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="(iv, idx) in interviews" :key="iv.id">' +
    '              <td class="text-muted small">{{ idx + 1 }}</td>' +
    '              <td class="fw-semibold">{{ iv.job_title || \'—\' }}</td>' +
    '              <td>{{ iv.company_name || \'—\' }}</td>' +
    '              <td class="text-nowrap">{{ fmtDateTime(iv.scheduled_at) }}</td>' +
    '              <td>' +
    '                <span v-if="iv.mode === \'Online\'" class="badge bg-primary">Online</span>' +
    '                <span v-else-if="iv.mode === \'In-person\'" class="badge bg-secondary">In-person</span>' +
    '                <span v-else class="text-muted">{{ iv.mode || \'—\' }}</span>' +
    '              </td>' +
    '              <td>' +
    '                <a v-if="iv.location_or_link && iv.location_or_link.startsWith(\'http\')" :href="iv.location_or_link" target="_blank" class="small text-truncate" style="max-width:200px; display:block;">{{ iv.location_or_link }}</a>' +
    '                <span v-else-if="iv.location_or_link" class="small">{{ iv.location_or_link }}</span>' +
    '                <span v-else class="text-muted">—</span>' +
    '              </td>' +
    '              <td><span :class="statusBadgeClass(iv.status)">{{ iv.status }}</span></td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '      </div>' +
    '      <div v-else class="p-4 text-center text-muted">' +
    '        <i class="bi bi-calendar-x fs-1 d-block mb-2"></i>' +
    '        No interviews scheduled yet.' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
