/**
 * AdminCompanies.js — search/filter/approve/reject/blacklist/delete companies,
 * plus bulk approve/reject for Pending rows. Filters live in the route query string.
 * Defines a global `AdminCompanies` component consumed by router.js.
 */
const AdminCompanies = {
  data: function () {
    return {
      companies: [],
      q: this.$route.query.q || '',
      status: this.$route.query.status || '',
      selected: [],
      loading: true,
      error: '',
      bulkBusy: false
    };
  },
  computed: {
    pendingIds: function () {
      return this.companies
        .filter(function (c) { return c.approval_status === 'Pending'; })
        .map(function (c) { return c.id; });
    },
    isAllSelected: function () {
      return this.pendingIds.length > 0 && this.selected.length === this.pendingIds.length;
    }
  },
  watch: {
    '$route.query': {
      immediate: true,
      handler: function (query) {
        this.q = query.q || '';
        this.status = query.status || '';
        this.selected = [];
        this.fetchCompanies();
      }
    }
  },
  methods: {
    fetchCompanies: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/companies', { params: { q: self.q, status: self.status } })
        .then(function (res) {
          self.companies = res.data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load companies.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    submitSearch: function () {
      var query = {};
      if (this.q) query.q = this.q;
      if (this.status) query.status = this.status;
      this.$router.push({ path: '/admin/companies', query: query }).catch(function () {});
    },
    clearFilters: function () {
      this.q = '';
      this.status = '';
      this.$router.push({ path: '/admin/companies' }).catch(function () {});
    },
    toggleSelectAll: function (e) {
      this.selected = e.target.checked ? this.pendingIds.slice() : [];
    },
    approve: function (c) {
      var self = this;
      window.api.put('/admin/companies/' + c.id + '/approve')
        .then(function () { self.fetchCompanies(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to approve company.';
        });
    },
    reject: function (c) {
      var self = this;
      window.api.put('/admin/companies/' + c.id + '/reject')
        .then(function () { self.fetchCompanies(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to reject company.';
        });
    },
    toggleBlacklist: function (c) {
      var self = this;
      window.api.put('/admin/companies/' + c.id + '/blacklist')
        .then(function () { self.fetchCompanies(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update blacklist status.';
        });
    },
    remove: function (c) {
      var self = this;
      if (!window.confirm('Delete ' + c.company_name + '?')) return;
      window.api.delete('/admin/companies/' + c.id)
        .then(function () { self.fetchCompanies(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to delete company.';
        });
    },
    bulkAction: function (action) {
      var self = this;
      if (!self.selected.length) {
        window.alert('Select at least one pending company first.');
        return;
      }
      var label = action === 'approve' ? 'Approve' : 'Reject';
      if (!window.confirm('Are you sure you want to ' + label + ' ' + self.selected.length + ' selected companies?')) return;

      self.bulkBusy = true;
      window.api.post('/admin/companies/bulk-status', { company_ids: self.selected, action: action })
        .then(function () {
          self.selected = [];
          return self.fetchCompanies();
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
    '    <h4><i class="bi bi-building me-2"></i>Companies</h4>' +
    '    <router-link to="/admin/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <form @submit.prevent="submitSearch" class="mb-3 d-flex gap-2 flex-wrap">' +
    '    <input type="text" class="form-control" v-model="q" placeholder="Search by name or industry…" style="max-width: 300px;">' +
    '    <select class="form-select" style="width:auto;" v-model="status" @change="submitSearch">' +
    '      <option value="">All Statuses</option>' +
    '      <option value="Pending">Pending</option>' +
    '      <option value="Approved">Approved</option>' +
    '      <option value="Rejected">Rejected</option>' +
    '    </select>' +
    '    <button type="submit" class="btn btn-dark px-4">Search</button>' +
    '    <button v-if="q || status" type="button" class="btn btn-outline-secondary" @click="clearFilters">Clear</button>' +
    '  </form>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <template v-if="companies.length">' +
    '' +
    '        <div class="d-flex align-items-center gap-2 p-2 bg-light border-bottom">' +
    '          <span class="text-muted small ms-2">{{ selected.length }} selected</span>' +
    '          <button class="btn btn-sm btn-success ms-3" :disabled="bulkBusy" @click="bulkAction(\'approve\')">Approve Selected</button>' +
    '          <button class="btn btn-sm btn-danger" :disabled="bulkBusy" @click="bulkAction(\'reject\')">Reject Selected</button>' +
    '        </div>' +
    '' +
    '        <div class="table-responsive">' +
    '          <table class="table table-hover align-middle mb-0">' +
    '            <thead class="table-light">' +
    '              <tr>' +
    '                <th style="width:36px;"><input type="checkbox" class="form-check-input" :checked="isAllSelected" @change="toggleSelectAll"></th>' +
    '                <th>ID</th><th>Company</th><th>Email</th><th>Industry</th><th>Status</th><th>Blacklisted</th><th>Actions</th>' +
    '              </tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <tr v-for="c in companies" :key="c.id" :class="{ \'table-danger\': c.is_blacklisted }">' +
    '                <td>' +
    '                  <input v-if="c.approval_status === \'Pending\'" type="checkbox" class="form-check-input" :value="c.id" v-model="selected">' +
    '                </td>' +
    '                <td class="text-muted small">{{ c.id }}</td>' +
    '                <td class="fw-semibold">{{ c.company_name }}</td>' +
    '                <td>{{ c.email }}</td>' +
    '                <td>{{ c.industry || \'—\' }}</td>' +
    '                <td>' +
    '                  <span v-if="c.approval_status === \'Approved\'" class="badge bg-success">Approved</span>' +
    '                  <span v-else-if="c.approval_status === \'Rejected\'" class="badge bg-danger">Rejected</span>' +
    '                  <span v-else class="badge bg-warning text-dark">Pending</span>' +
    '                  <div v-if="c.approval_status === \'Pending\'" class="mt-1">' +
    '                    <button class="btn btn-success btn-sm" @click="approve(c)">Approve</button>' +
    '                    <button class="btn btn-danger btn-sm ms-1" @click="reject(c)">Reject</button>' +
    '                  </div>' +
    '                </td>' +
    '                <td>' +
    '                  <span v-if="c.is_blacklisted" class="badge bg-danger">Yes</span>' +
    '                  <span v-else class="badge bg-secondary">No</span>' +
    '                </td>' +
    '                <td>' +
    '                  <button class="btn btn-sm" :class="c.is_blacklisted ? \'btn-success\' : \'btn-warning\'" @click="toggleBlacklist(c)">' +
    '                    {{ c.is_blacklisted ? \'Unblacklist\' : \'Blacklist\' }}' +
    '                  </button>' +
    '                  <button class="btn btn-sm btn-outline-danger ms-1" @click="remove(c)">Delete</button>' +
    '                </td>' +
    '              </tr>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '      </template>' +
    '      <p v-else class="text-muted p-3 mb-0">No companies found{{ q ? \' for "\' + q + \'"\' : \'\' }}.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
