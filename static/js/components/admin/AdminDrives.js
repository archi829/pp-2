/**
 * AdminDrives.js — status + company filters (route-query-synced), select-all + bulk
 * approve/reject, plus quick per-row approve/reject.
 * Defines a global `AdminDrives` component consumed by router.js.
 */
const AdminDrives = {
  data: function () {
    return {
      drives: [],
      companies: [],
      status: this.$route.query.status || '',
      companyId: this.$route.query.company_id || '',
      selected: [],
      loading: true,
      error: '',
      bulkBusy: false
    };
  },
  watch: {
    '$route.query': {
      immediate: true,
      handler: function (query) {
        this.status = query.status || '';
        this.companyId = query.company_id || '';
        this.selected = [];
        this.fetchDrives();
      }
    }
  },
  mounted: function () {
    this.fetchCompanies();
  },
  methods: {
    fetchDrives: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/drives', { params: { status: self.status, company_id: self.companyId } })
        .then(function (res) {
          self.drives = res.data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load drives.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    fetchCompanies: function () {
      var self = this;
      // Reuses the companies list endpoint just to populate the filter dropdown.
      window.api.get('/admin/companies').then(function (res) {
        self.companies = res.data;
      }).catch(function () { /* filter dropdown just stays empty, not fatal */ });
    },
    applyFilters: function () {
      var query = {};
      if (this.status) query.status = this.status;
      if (this.companyId) query.company_id = this.companyId;
      this.$router.push({ path: '/admin/drives', query: query }).catch(function () {});
    },
    clearFilters: function () {
      this.status = '';
      this.companyId = '';
      this.$router.push({ path: '/admin/drives' }).catch(function () {});
    },
    toggleSelectAll: function (e) {
      this.selected = e.target.checked ? this.drives.map(function (d) { return d.id; }) : [];
    },
    approve: function (d) {
      var self = this;
      window.api.put('/admin/drives/' + d.id + '/approve')
        .then(function () { self.fetchDrives(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to approve drive.';
        });
    },
    reject: function (d) {
      var self = this;
      window.api.put('/admin/drives/' + d.id + '/reject')
        .then(function () { self.fetchDrives(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to reject drive.';
        });
    },
    bulkAction: function (action) {
      var self = this;
      if (!self.selected.length) {
        window.alert('Select at least one drive first.');
        return;
      }
      var label = action === 'approve' ? 'Approve' : 'Reject';
      if (!window.confirm('Are you sure you want to ' + label + ' ' + self.selected.length + ' selected drives?')) return;

      self.bulkBusy = true;
      window.api.post('/admin/drives/bulk-status', { drive_ids: self.selected, action: action })
        .then(function () {
          self.selected = [];
          return self.fetchDrives();
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Bulk action failed.';
        })
        .finally(function () {
          self.bulkBusy = false;
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
    '  <div class="d-flex justify-content-between align-items-center mb-3">' +
    '    <h4><i class="bi bi-briefcase me-2"></i>All Placement Drives</h4>' +
    '    <router-link to="/admin/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <div class="mb-3 d-flex gap-2 align-items-center flex-wrap">' +
    '    <select class="form-select" style="width:auto;" v-model="status" @change="applyFilters">' +
    '      <option value="">All Statuses</option>' +
    '      <option value="Pending">Pending</option>' +
    '      <option value="Approved">Approved</option>' +
    '      <option value="Rejected">Rejected</option>' +
    '      <option value="Closed">Closed</option>' +
    '    </select>' +
    '    <select class="form-select" style="width:auto; max-width: 300px;" v-model="companyId" @change="applyFilters">' +
    '      <option value="">All Companies</option>' +
    '      <option v-for="c in companies" :key="c.id" :value="String(c.id)">{{ c.company_name }}</option>' +
    '    </select>' +
    '    <button v-if="status || companyId" class="btn btn-outline-secondary" @click="clearFilters">Clear Filters</button>' +
    '  </div>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <template v-if="drives.length">' +
    '' +
    '        <div class="d-flex align-items-center gap-2 p-2 bg-light border-bottom">' +
    '          <span class="text-muted small ms-2">{{ selected.length }} selected</span>' +
    '          <button class="btn btn-sm btn-success ms-3" :disabled="bulkBusy" @click="bulkAction(\'approve\')">Approve Selected Drives</button>' +
    '          <button class="btn btn-sm btn-danger" :disabled="bulkBusy" @click="bulkAction(\'reject\')">Reject Selected Drives</button>' +
    '        </div>' +
    '' +
    '        <div class="table-responsive">' +
    '          <table class="table table-hover align-middle mb-0">' +
    '            <thead class="table-light">' +
    '              <tr>' +
    '                <th style="width:36px;"><input type="checkbox" class="form-check-input" :checked="selected.length === drives.length" @change="toggleSelectAll"></th>' +
    '                <th>ID</th><th>Job Title</th><th>Company</th><th>Deadline</th><th>Applicants</th><th>Status</th><th>Quick Action</th>' +
    '              </tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <tr v-for="d in drives" :key="d.id">' +
    '                <td><input type="checkbox" class="form-check-input" :value="d.id" v-model="selected"></td>' +
    '                <td class="text-muted small">{{ d.id }}</td>' +
    '                <td class="fw-semibold">{{ d.job_title }}</td>' +
    '                <td>{{ d.company_name }}</td>' +
    '                <td>{{ fmtDate(d.application_deadline) }}</td>' +
    '                <td><span class="badge bg-primary">{{ d.applications_count }}</span></td>' +
    '                <td>' +
    '                  <span v-if="d.status === \'Approved\'" class="badge bg-success">Approved</span>' +
    '                  <span v-else-if="d.status === \'Pending\'" class="badge bg-warning text-dark">Pending</span>' +
    '                  <span v-else-if="d.status === \'Closed\'" class="badge bg-secondary">Closed</span>' +
    '                  <span v-else class="badge bg-danger">Rejected</span>' +
    '                </td>' +
    '                <td>' +
    '                  <template v-if="d.status === \'Pending\'">' +
    '                    <button class="btn btn-sm btn-success" @click="approve(d)">Approve</button>' +
    '                    <button class="btn btn-sm btn-danger ms-1" @click="reject(d)">Reject</button>' +
    '                  </template>' +
    '                  <span v-else class="text-muted small">—</span>' +
    '                </td>' +
    '              </tr>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '      </template>' +
    '      <p v-else class="text-muted p-3 mb-0">No drives found for the selected filters.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
