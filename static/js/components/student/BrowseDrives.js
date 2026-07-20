/**
 * BrowseDrives.js — GET /api/student/drives with ?q= query-string sync.
 * Fetches both drives and applied_drive_ids in one call so Applied badges
 * render without extra round-trips per row.
 * Defines a global `BrowseDrives` component consumed by router.js.
 */
const BrowseDrives = {
  data: function () {
    return {
      loading: true,
      error: '',
      drives: [],
      appliedDriveIds: [],
      searchInput: this.$route.query.q || '',
      applyingIds: []
    };
  },
  watch: {
    '$route': {
      immediate: true,
      handler: function (to) {
        this.searchInput = to.query.q || '';
        this.fetchDrives();
      }
    }
  },
  methods: {
    fetchDrives: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      var params = {};
      if (self.searchInput) params.q = self.searchInput;
      return window.api.get('/student/drives', { params: params }).then(function (res) {
        self.drives = res.data.drives || [];
        self.appliedDriveIds = res.data.applied_drive_ids || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load drives.';
      }).finally(function () {
        self.loading = false;
      });
    },
    search: function () {
      var q = this.searchInput.trim();
      var query = q ? { q: q } : {};
      this.$router.push({ path: '/student/drives', query: query }).catch(function () {});
    },
    clearSearch: function () {
      this.searchInput = '';
      this.$router.push({ path: '/student/drives' }).catch(function () {});
    },
    isApplied: function (driveId) {
      return this.appliedDriveIds.indexOf(driveId) !== -1;
    },
    applyToDrive: function (drive) {
      var self = this;
      self.applyingIds.push(drive.id);
      window.api.post('/student/applications', { drive_id: drive.id })
        .then(function () {
          self.appliedDriveIds.push(drive.id);
          self.$router.push('/student/applications');
        })
        .catch(function (err) {
          var msg = (err.response && err.response.data && err.response.data.msg)
            || 'Failed to apply.';
          window.showToast(msg);
        })
        .finally(function () {
          var idx = self.applyingIds.indexOf(drive.id);
          if (idx !== -1) self.applyingIds.splice(idx, 1);
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
    '    <h4><i class="bi bi-briefcase me-2"></i>Placement Drives</h4>' +
    '    <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <div class="d-flex gap-2 mb-3">' +
    '    <input type="text" class="form-control" v-model="searchInput" placeholder="Search by company, job title, or skills…" style="max-width:420px;" @keyup.enter="search">' +
    '    <button class="btn btn-dark px-4" @click="search">Search</button>' +
    '    <button v-if="$route.query.q" class="btn btn-outline-secondary" @click="clearSearch">Clear</button>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else-if="drives.length" class="row g-3">' +
    '    <div v-for="d in drives" :key="d.id" class="col-md-6">' +
    '      <div class="card h-100">' +
    '        <div class="card-body">' +
    '          <div class="d-flex justify-content-between align-items-start">' +
    '            <h5 class="card-title fw-bold mb-1">{{ d.job_title }}</h5>' +
    '            <span v-if="isApplied(d.id)" class="badge bg-success">Applied</span>' +
    '          </div>' +
    '          <p class="text-muted small mb-2">{{ d.company_name }}</p>' +
    '          <p class="small mb-1"><i class="bi bi-geo-alt me-1"></i>{{ d.location || \'Location not specified\' }}</p>' +
    '          <p class="small mb-1"><i class="bi bi-cash me-1"></i>{{ d.salary_range || \'Not disclosed\' }}</p>' +
    '          <p class="small mb-2"><i class="bi bi-calendar me-1"></i>Deadline: {{ fmtDate(d.application_deadline) }}</p>' +
    '          <p v-if="d.required_skills" class="small text-muted mb-0"><i class="bi bi-tools me-1"></i>{{ d.required_skills }}</p>' +
    '        </div>' +
    '        <div class="card-footer bg-white border-0 pt-0">' +
    '          <router-link :to="\'/student/drives/\' + d.id" class="btn btn-sm btn-outline-secondary me-1">View Details</router-link>' +
    '          <button v-if="!isApplied(d.id)" class="btn btn-sm btn-dark" :disabled="applyingIds.indexOf(d.id) !== -1" @click="applyToDrive(d)">Apply Now</button>' +
    '          <button v-else class="btn btn-sm btn-success" disabled>Applied</button>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '' +
    '  <p v-else-if="!loading" class="text-muted">' +
    '    No drives found<template v-if="$route.query.q"> for &ldquo;{{ $route.query.q }}&rdquo;</template>.' +
    '  </p>' +
    '</div>'
};
