/**
 * CompanyDashboard.js — GET /api/company/dashboard + /api/company/drives,
 * stat cards that filter the drives table, and drive row actions
 * (Edit / Close / Re-open / Delete).
 * Defines a global `CompanyDashboard` component consumed by router.js.
 */
const CompanyDashboard = {
  data: function () {
    return {
      loading: true,
      error: '',
      company: {},
      stats: { total_drives: 0, active_drives: 0, pending_drives: 0, total_applicants: 0 },
      allDrives: [],
      statusFilter: ''
    };
  },
  computed: {
    tableDrives: function () {
      if (!this.statusFilter) return this.allDrives;
      var status = this.statusFilter;
      return this.allDrives.filter(function (d) { return d.status === status; });
    }
  },
  mounted: function () {
    this.fetchAll();
  },
  methods: {
    fetchAll: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return Promise.all([
        window.api.get('/company/dashboard'),
        window.api.get('/company/drives')
      ]).then(function (results) {
        var dashboard = results[0].data;
        self.company = dashboard.company || {};
        self.stats = {
          total_drives: dashboard.total_drives,
          active_drives: dashboard.active_drives,
          pending_drives: dashboard.pending_drives,
          total_applicants: dashboard.total_applicants
        };
        self.allDrives = results[1].data || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load dashboard.';
      }).finally(function () {
        self.loading = false;
      });
    },
    setFilter: function (status) {
      this.statusFilter = status;
    },
    goToApplications: function (driveId) {
      this.$router.push('/company/drives/' + driveId + '/applications');
    },
    editDrive: function (driveId) {
      this.$router.push('/company/drives/' + driveId + '/edit');
    },
    closeDrive: function (drive) {
      var self = this;
      if (!window.confirm('Are you sure you want to close this drive? Students will no longer be able to apply.')) return;
      window.api.put('/company/drives/' + drive.id + '/status', { action: 'close' })
        .then(function () { self.fetchAll(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to close drive.';
        });
    },
    reopenDrive: function (drive) {
      var self = this;
      window.api.put('/company/drives/' + drive.id + '/status', { action: 'reopen' })
        .then(function () { self.fetchAll(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to re-open drive.';
        });
    },
    deleteDrive: function (drive) {
      var self = this;
      if (!window.confirm('Delete this drive?')) return;
      window.api.delete('/company/drives/' + drive.id)
        .then(function () { self.fetchAll(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to delete drive.';
        });
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
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <template v-else>' +
    '' +
    '    <div class="card mb-4">' +
    '      <div class="card-body">' +
    '        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">' +
    '          <div>' +
    '            <h4 class="fw-bold mb-1"><i class="bi bi-building me-2"></i>{{ company.company_name }}</h4>' +
    '            <p class="text-muted mb-1">{{ company.industry || \'Industry not set\' }}</p>' +
    '            <p class="text-muted small mb-0">{{ company.email }}</p>' +
    '            <a v-if="company.website" :href="company.website" target="_blank" class="small">{{ company.website }}</a>' +
    '          </div>' +
    '          <router-link to="/company/drives/new" class="btn btn-dark">' +
    '            <i class="bi bi-plus-circle me-1"></i>Post New Drive' +
    '          </router-link>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="row g-3 mb-4">' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3" style="cursor:pointer;" :class="{ \'border border-primary\': !statusFilter }" @click="setFilter(\'\')">' +
    '          <div class="fs-2 fw-bold text-primary">{{ stats.total_drives }}</div>' +
    '          <div class="text-muted small">Total Drives</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3" style="cursor:pointer;" :class="{ \'border border-primary\': statusFilter === \'Approved\' }" @click="setFilter(\'Approved\')">' +
    '          <div class="fs-2 fw-bold text-success">{{ stats.active_drives }}</div>' +
    '          <div class="text-muted small">Active</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3" style="cursor:pointer;" :class="{ \'border border-primary\': statusFilter === \'Pending\' }" @click="setFilter(\'Pending\')">' +
    '          <div class="fs-2 fw-bold text-warning">{{ stats.pending_drives }}</div>' +
    '          <div class="text-muted small">Pending Approval</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <div class="card text-center p-3">' +
    '          <div class="fs-2 fw-bold text-info">{{ stats.total_applicants }}</div>' +
    '          <div class="text-muted small">Total Applicants</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="card">' +
    '      <div class="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">' +
    '        <span>' +
    '          <i class="bi bi-briefcase me-2"></i>' +
    '          {{ statusFilter ? statusFilter + \' Placement Drives\' : \'Your Placement Drives\' }}' +
    '        </span>' +
    '        <div>' +
    '          <button v-if="statusFilter" class="btn btn-sm btn-outline-secondary me-2" @click="setFilter(\'\')">Clear Filter</button>' +
    '          <span class="text-muted small">Click a row to view applicants</span>' +
    '        </div>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <div v-if="tableDrives.length" class="table-responsive">' +
    '          <table class="table table-hover align-middle mb-0">' +
    '            <thead class="table-light">' +
    '              <tr>' +
    '                <th>Job Title</th><th>Location</th><th>Deadline</th><th>Applicants</th><th>Status</th>' +
    '                <th @click.stop>Actions</th>' +
    '              </tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <tr v-for="d in tableDrives" :key="d.id" style="cursor:pointer;" @click="goToApplications(d.id)">' +
    '                <td>' +
    '                  <div class="fw-semibold">{{ d.job_title }}</div>' +
    '                  <div v-if="d.salary_range" class="text-muted small">{{ d.salary_range }}</div>' +
    '                </td>' +
    '                <td>{{ d.location || \'—\' }}</td>' +
    '                <td class="text-nowrap">{{ fmtDate(d.application_deadline) }}</td>' +
    '                <td><span class="badge bg-primary rounded-pill fs-6">{{ d.applications_count }}</span></td>' +
    '                <td>' +
    '                  <span v-if="d.status === \'Approved\'" class="badge bg-success">Approved</span>' +
    '                  <span v-else-if="d.status === \'Pending\'" class="badge bg-warning text-dark">Pending</span>' +
    '                  <span v-else-if="d.status === \'Closed\'" class="badge bg-secondary">Closed</span>' +
    '                  <span v-else class="badge bg-danger">Rejected</span>' +
    '                </td>' +
    '                <td @click.stop>' +
    '                  <div class="d-flex gap-1 flex-wrap">' +
    '                    <button class="btn btn-sm btn-outline-secondary" @click="editDrive(d.id)">Edit</button>' +
    '                    <button v-if="d.status === \'Approved\'" class="btn btn-sm btn-warning" @click="closeDrive(d)">Close</button>' +
    '                    <button v-if="d.status === \'Closed\'" class="btn btn-sm btn-success" @click="reopenDrive(d)">Re-open</button>' +
    '                    <button class="btn btn-sm btn-outline-danger" @click="deleteDrive(d)">Delete</button>' +
    '                  </div>' +
    '                </td>' +
    '              </tr>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '        <p v-else class="text-muted p-3 mb-0">' +
    '          <template v-if="statusFilter">No {{ statusFilter.toLowerCase() }} drives found.</template>' +
    '          <template v-else>No drives posted yet. <router-link to="/company/drives/new">Post your first drive →</router-link></template>' +
    '        </p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '</div>'
};
