/**
 * AdminDashboard.js — GET /api/admin/dashboard, stat cards + pending approval tables.
 * Defines a global `AdminDashboard` component consumed by router.js.
 */
const AdminDashboard = {
  data: function () {
    return {
      loading: true,
      error: '',
      stats: { total_students: 0, total_companies: 0, total_drives: 0, total_apps: 0 },
      pendingCompanies: [],
      pendingDrives: [],
      pendingCompaniesCount: 0,
      pendingDrivesCount: 0
    };
  },
  mounted: function () {
    this.fetchDashboard();
  },
  methods: {
    fetchDashboard: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/dashboard').then(function (res) {
        var d = res.data;
        self.stats = {
          total_students: d.total_students,
          total_companies: d.total_companies,
          total_drives: d.total_drives,
          total_apps: d.total_apps
        };
        self.pendingCompanies = d.pending_companies || [];
        self.pendingDrives = d.pending_drives || [];
        self.pendingCompaniesCount = d.pending_companies_count;
        self.pendingDrivesCount = d.pending_drives_count;
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load dashboard.';
      }).finally(function () {
        self.loading = false;
      });
    },
    approveCompany: function (id) {
      var self = this;
      window.api.put('/admin/companies/' + id + '/approve')
        .then(function () { self.fetchDashboard(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to approve company.';
        });
    },
    rejectCompany: function (id) {
      var self = this;
      window.api.put('/admin/companies/' + id + '/reject')
        .then(function () { self.fetchDashboard(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to reject company.';
        });
    },
    approveDrive: function (id) {
      var self = this;
      window.api.put('/admin/drives/' + id + '/approve')
        .then(function () { self.fetchDashboard(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to approve drive.';
        });
    },
    rejectDrive: function (id) {
      var self = this;
      window.api.put('/admin/drives/' + id + '/reject')
        .then(function () { self.fetchDashboard(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to reject drive.';
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
    '  <h4 class="mb-4"><i class="bi bi-speedometer2 me-2"></i>Admin Dashboard</h4>' +
    '' +
    '  <div v-if="error" class="alert alert-danger alert-dismissible fade show" role="alert">' +
    '    {{ error }}' +
    '    <button type="button" class="btn-close" @click="error = \'\'"></button>' +
    '  </div>' +
    '' +
    '  <div v-if="loading" class="text-center py-5">' +
    '    <div class="spinner-border text-dark" role="status"></div>' +
    '  </div>' +
    '' +
    '  <template v-else>' +
    '' +
    '    <div class="row g-3 mb-4">' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/admin/students" class="text-decoration-none text-reset">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-primary">{{ stats.total_students }}</div>' +
    '            <div class="text-muted small">Students</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/admin/companies" class="text-decoration-none text-reset">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-success">{{ stats.total_companies }}</div>' +
    '            <div class="text-muted small">Companies</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/admin/drives" class="text-decoration-none text-reset">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-warning">{{ stats.total_drives }}</div>' +
    '            <div class="text-muted small">Drives</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '      <div class="col-6 col-md-3">' +
    '        <router-link to="/admin/applications" class="text-decoration-none text-reset">' +
    '          <div class="card text-center p-3">' +
    '            <div class="fs-2 fw-bold text-danger">{{ stats.total_apps }}</div>' +
    '            <div class="text-muted small">Applications</div>' +
    '          </div>' +
    '        </router-link>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="card">' +
    '      <div class="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">' +
    '        <div>' +
    '          <i class="bi bi-hourglass-split me-2 text-warning"></i>Pending Company Approvals' +
    '          <span class="badge bg-warning text-dark ms-2">{{ pendingCompaniesCount }}</span>' +
    '        </div>' +
    '        <router-link to="/admin/companies?status=Pending" class="btn btn-sm btn-outline-primary">Manage All</router-link>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <table v-if="pendingCompanies.length" class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>Company</th><th>Email</th><th>Industry</th><th>Registered</th><th>Action</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="c in pendingCompanies" :key="c.id">' +
    '              <td class="fw-semibold">{{ c.company_name }}</td>' +
    '              <td>{{ c.email }}</td>' +
    '              <td>{{ c.industry || \'—\' }}</td>' +
    '              <td>{{ fmtDate(c.created_at) }}</td>' +
    '              <td>' +
    '                <button class="btn btn-success btn-sm" @click="approveCompany(c.id)">Approve</button>' +
    '                <button class="btn btn-danger btn-sm ms-1" @click="rejectCompany(c.id)">Reject</button>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '        <p v-else class="text-muted p-3 mb-0">No pending approvals.</p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="card mt-4 mb-4">' +
    '      <div class="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">' +
    '        <div>' +
    '          <i class="bi bi-briefcase me-2 text-info"></i>Pending Drive Approvals' +
    '          <span class="badge bg-info text-dark ms-2">{{ pendingDrivesCount }}</span>' +
    '        </div>' +
    '        <router-link to="/admin/drives?status=Pending" class="btn btn-sm btn-outline-info">Manage All</router-link>' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <table v-if="pendingDrives.length" class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>Job Title</th><th>Company</th><th>Deadline</th><th>Action</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="d in pendingDrives" :key="d.id">' +
    '              <td class="fw-semibold">{{ d.job_title }}</td>' +
    '              <td>{{ d.company_name }}</td>' +
    '              <td>{{ fmtDate(d.application_deadline) }}</td>' +
    '              <td>' +
    '                <button class="btn btn-success btn-sm" @click="approveDrive(d.id)">Approve</button>' +
    '                <button class="btn btn-danger btn-sm ms-1" @click="rejectDrive(d.id)">Reject</button>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '        <p v-else class="text-muted p-3 mb-0">No pending drive approvals.</p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '</div>'
};
