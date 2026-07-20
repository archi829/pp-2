/**
 * StudentDashboard.js — GET /api/student/dashboard.
 * Four stat cards, time-sensitive pending-offer alerts, available drives table
 * (with inline Apply), and recent applications table.
 * Defines a global `StudentDashboard` component consumed by router.js.
 */
const StudentDashboard = {
  data: function () {
    return {
      loading: true,
      error: '',
      student: {},
      stats: { available_drives: 0, applied: 0, shortlisted: 0, selected: 0 },
      availableDrives: [],
      recentApplications: [],
      notifications: [],
      offerBusyIds: []
    };
  },
  computed: {
    pendingOffers: function () {
      return this.recentApplications.filter(function (a) {
        return a.status === 'Selected' && a.offer_status === 'Pending';
      });
    }
  },
  mounted: function () {
    this.fetchDashboard();
  },
  methods: {
    fetchDashboard: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/student/dashboard').then(function (res) {
        var d = res.data;
        self.student = d.student || {};
        self.stats = d.stats || {};
        self.availableDrives = d.available_drives || [];
        self.recentApplications = d.recent_applications || [];
        self.notifications = d.notifications || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load dashboard.';
      }).finally(function () {
        self.loading = false;
      });
    },
    applyToDrive: function (driveId) {
      var self = this;
      window.api.post('/student/applications', { drive_id: driveId })
        .then(function () {
          self.fetchDashboard();
        })
        .catch(function (err) {
          var msg = (err.response && err.response.data && err.response.data.msg)
            || 'Failed to apply.';
          window.showToast(msg);
        });
    },
    respondOffer: function (app, action) {
      var self = this;
      var label = action === 'accept' ? 'accept' : 'decline';
      if (!window.confirm('Are you sure you want to ' + label + ' this offer?')) return;
      self.offerBusyIds.push(app.id);
      window.api.put('/student/applications/' + app.id + '/offer', { action: action })
        .then(function () {
          self.fetchDashboard();
        })
        .catch(function (err) {
          var msg = (err.response && err.response.data && err.response.data.msg)
            || 'Failed to respond to offer.';
          window.showToast(msg);
        })
        .finally(function () {
          var idx = self.offerBusyIds.indexOf(app.id);
          if (idx !== -1) self.offerBusyIds.splice(idx, 1);
        });
    },
    statusBadgeClass: function (status) {
      var map = {
        'Applied': 'bg-secondary',
        'Shortlisted': 'bg-info text-dark',
        'Interview Scheduled': 'bg-warning text-dark',
        'Selected': 'bg-success',
        'Rejected': 'bg-danger',
        'Placed': 'bg-primary'
      };
      return 'badge ' + (map[status] || 'bg-secondary');
    },
    fmtDate: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  },
  template:
    '<div class="container mt-4 pb-5">' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <template v-else>' +
    '' +
    '    <!-- Pending offer alerts (time-sensitive) -->' +
    '    <div v-if="pendingOffers.length" class="card mb-4 border-success">' +
    '      <div class="card-header bg-success text-white fw-bold">' +
    '        <i class="bi bi-bell-fill me-2"></i>Action Required — Pending Offers' +
    '      </div>' +
    '      <ul class="list-group list-group-flush">' +
    '        <li v-for="a in pendingOffers" :key="a.id" class="list-group-item d-flex justify-content-between align-items-center bg-light">' +
    '          <div>' +
    '            <strong>Offer Received!</strong> {{ a.company_name }} has selected you for <strong>{{ a.job_title }}</strong>.' +
    '          </div>' +
    '          <div class="d-flex gap-2 ms-3 flex-shrink-0">' +
    '            <button class="btn btn-sm btn-success" :disabled="offerBusyIds.indexOf(a.id) !== -1" @click="respondOffer(a, \'accept\')">Accept</button>' +
    '            <button class="btn btn-sm btn-outline-danger" :disabled="offerBusyIds.indexOf(a.id) !== -1" @click="respondOffer(a, \'reject\')">Decline</button>' +
    '          </div>' +
    '        </li>' +
    '      </ul>' +
    '    </div>' +
    '' +
    '    <!-- Notifications strip -->' +
    '    <div v-if="notifications.length" class="card mb-4 border-primary">' +
    '      <div class="card-header bg-primary text-white fw-bold d-flex justify-content-between align-items-center">' +
    '        <span><i class="bi bi-bell-fill me-2"></i>Notifications</span>' +
    '        <router-link to="/student/notifications" class="btn btn-sm btn-light text-primary fw-bold">View All</router-link>' +
    '      </div>' +
    '      <ul class="list-group list-group-flush">' +
    '        <li v-for="n in notifications" :key="n.id" class="list-group-item text-muted">' +
    '          <i class="bi bi-info-circle text-info me-2"></i>{{ n.message }}' +
    '          <span class="float-end small">{{ fmtDate(n.created_at) }}</span>' +
    '        </li>' +
    '      </ul>' +
    '    </div>' +
    '' +
    '    <!-- Profile card -->' +
    '    <div class="card mb-4">' +
    '      <div class="card-body">' +
    '        <div class="d-flex justify-content-between align-items-start">' +
    '          <div>' +
    '            <h4 class="fw-bold mb-1"><i class="bi bi-person-circle me-2"></i>{{ student.full_name }}</h4>' +
    '            <p class="text-muted mb-1">{{ student.email }}</p>' +
    '            <p class="text-muted small mb-0">' +
    '              CGPA: {{ student.cgpa || \'—\' }} &nbsp;|&nbsp; Skills: {{ student.skills || \'Not set\' }}' +
    '            </p>' +
    '          </div>' +
    '          <router-link to="/student/profile" class="btn btn-outline-dark btn-sm">' +
    '            <i class="bi bi-pencil me-1"></i>Edit Profile' +
    '          </router-link>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <!-- Stat cards -->' +
    '    <div class="row g-3 mb-4">' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/student/drives" class="text-decoration-none">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-primary">{{ stats.available_drives }}</div>' +
    '            <div class="text-muted small">Open Drives</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/student/applications" class="text-decoration-none">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-info">{{ stats.applied }}</div>' +
    '            <div class="text-muted small">Applied</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3">' +
    '          <div class="fs-2 fw-bold text-warning">{{ stats.shortlisted }}</div>' +
    '          <div class="text-muted small">Shortlisted</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3">' +
    '          <div class="fs-2 fw-bold text-success">{{ stats.selected }}</div>' +
    '          <div class="text-muted small">Selected</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <!-- Available drives -->' +
    '    <div class="card mb-4">' +
    '      <div class="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">' +
    '        <span><i class="bi bi-briefcase me-2 text-primary"></i>Available Drives</span>' +
    '        <router-link to="/student/drives" class="btn btn-sm btn-outline-primary">Browse All</router-link>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <table v-if="availableDrives.length" class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>Job Title</th><th>Company</th><th>Deadline</th><th>Action</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="d in availableDrives" :key="d.id">' +
    '              <td class="fw-semibold">{{ d.job_title }}</td>' +
    '              <td>{{ d.company_name }}</td>' +
    '              <td>{{ fmtDate(d.application_deadline) }}</td>' +
    '              <td>' +
    '                <router-link :to="\'/student/drives/\' + d.id" class="btn btn-sm btn-outline-secondary me-1">View</router-link>' +
    '                <button class="btn btn-sm btn-dark" @click="applyToDrive(d.id)">Apply</button>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '        <p v-else class="text-muted p-3 mb-0">No new drives available right now.</p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <!-- Recent applications -->' +
    '    <div class="card">' +
    '      <div class="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">' +
    '        <span><i class="bi bi-file-earmark-text me-2 text-info"></i>My Applications</span>' +
    '        <router-link to="/student/applications" class="btn btn-sm btn-outline-info">Full History</router-link>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <table v-if="recentApplications.length" class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>Job Title</th><th>Company</th><th>Applied On</th><th>Status</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="a in recentApplications" :key="a.id">' +
    '              <td class="fw-semibold">{{ a.job_title }}</td>' +
    '              <td>{{ a.company_name }}</td>' +
    '              <td>{{ fmtDate(a.applied_at) }}</td>' +
    '              <td>' +
    '                <span :class="statusBadgeClass(a.status)">{{ a.status }}</span>' +
    '                <span v-if="a.status === \'Selected\' && a.offer_status !== \'Pending\'" class="badge ms-1" :class="a.offer_status === \'Accepted\' ? \'bg-success\' : \'bg-danger\'">{{ a.offer_status }}</span>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '        <p v-else class="text-muted p-3 mb-0">You haven\'t applied to any drives yet.</p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '</div>'
};
