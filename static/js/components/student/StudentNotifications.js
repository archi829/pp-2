/**
 * StudentNotifications.js — GET /api/student/notifications.
 * Straight chronological list. The GET marks all as read server-side
 * (preserving MAD1 behaviour) — don't add a separate PUT endpoint.
 * Defines a global `StudentNotifications` component consumed by router.js.
 */
const StudentNotifications = {
  data: function () {
    return {
      loading: true,
      error: '',
      notifications: []
    };
  },
  mounted: function () {
    this.fetchNotifications();
  },
  methods: {
    fetchNotifications: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/student/notifications').then(function (res) {
        self.notifications = res.data || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load notifications.';
      }).finally(function () {
        self.loading = false;
      });
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
    '  <div class="d-flex justify-content-between align-items-center mb-4">' +
    '    <h4 class="fw-bold mb-0"><i class="bi bi-bell-fill me-2 text-primary"></i>My Notifications</h4>' +
    '    <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <ul class="list-group list-group-flush">' +
    '      <li v-if="!notifications.length" class="list-group-item text-muted p-4 text-center">' +
    '        <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>' +
    '        No notifications yet.' +
    '      </li>' +
    '      <li v-for="n in notifications" :key="n.id" class="list-group-item d-flex justify-content-between align-items-center p-3">' +
    '        <span>' +
    '          <i class="bi bi-info-circle text-primary me-2"></i>{{ n.message }}' +
    '        </span>' +
    '        <span class="text-muted small text-nowrap ms-3">{{ fmtDateTime(n.created_at) }}</span>' +
    '      </li>' +
    '    </ul>' +
    '  </div>' +
    '</div>'
};
