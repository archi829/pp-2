/**
 * StudentPlacements.js — GET /api/student/placements.
 * Lists confirmed placements. The "Offer Letter" button hits
 * /api/student/placements/<id>/offer-letter and shows "Not available yet"
 * on a 404 rather than a broken download.
 * Defines a global `StudentPlacements` component consumed by router.js.
 */
const StudentPlacements = {
  data: function () {
    return {
      loading: true,
      error: '',
      placements: [],
      downloadingIds: []
    };
  },
  mounted: function () {
    this.fetchPlacements();
  },
  methods: {
    fetchPlacements: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/student/placements').then(function (res) {
        self.placements = res.data || [];
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load placements.';
      }).finally(function () {
        self.loading = false;
      });
    },
    downloadOfferLetter: function (placement) {
      var self = this;
      self.downloadingIds.push(placement.id);
      window.api.get('/student/placements/' + placement.id + '/offer-letter', {
        responseType: 'blob'
      }).then(function (res) {
        var contentType = (res.headers && res.headers['content-type']) || 'application/octet-stream';
        var blob = new Blob([res.data], { type: contentType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'offer_letter_' + placement.id + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }).catch(function (err) {
        if (err.response && err.response.status === 404) {
          window.showToast('Offer letter not available yet. Please check back later.');
        } else {
          window.showToast('Failed to download offer letter.');
        }
      }).finally(function () {
        var idx = self.downloadingIds.indexOf(placement.id);
        if (idx !== -1) self.downloadingIds.splice(idx, 1);
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
    '    <h4><i class="bi bi-trophy me-2 text-warning"></i>My Placements</h4>' +
    '    <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <div v-if="placements.length" class="table-responsive">' +
    '        <table class="table table-hover align-middle mb-0">' +
    '          <thead class="table-light">' +
    '            <tr>' +
    '              <th>#</th><th>Company</th><th>Job Title</th><th>Position</th>' +
    '              <th>Salary</th><th>Joining Date</th><th>Placed On</th><th>Offer Letter</th>' +
    '            </tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="(p, idx) in placements" :key="p.id">' +
    '              <td class="text-muted small">{{ idx + 1 }}</td>' +
    '              <td class="fw-semibold">{{ p.company_name || \'—\' }}</td>' +
    '              <td>{{ p.job_title || \'—\' }}</td>' +
    '              <td>{{ p.position || \'—\' }}</td>' +
    '              <td>{{ p.salary || \'—\' }}</td>' +
    '              <td class="text-nowrap">{{ fmtDate(p.joining_date) }}</td>' +
    '              <td class="text-nowrap">{{ fmtDate(p.placed_at) }}</td>' +
    '              <td>' +
    '                <button class="btn btn-sm btn-outline-primary" :disabled="downloadingIds.indexOf(p.id) !== -1" @click="downloadOfferLetter(p)">' +
    '                  <i class="bi bi-download me-1"></i>' +
    '                  {{ downloadingIds.indexOf(p.id) !== -1 ? \'Downloading…\' : \'Offer Letter\' }}' +
    '                </button>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '      </div>' +
    '      <div v-else class="p-4 text-center text-muted">' +
    '        <i class="bi bi-trophy fs-1 d-block mb-2 text-muted"></i>' +
    '        No confirmed placements yet. Keep applying!' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
