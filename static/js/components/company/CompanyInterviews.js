/**
 * CompanyInterviews.js — route 'interviews'.
 * GET /api/company/interviews on mount, table of all interviews across this
 * company's drives, with inline status updates (Scheduled/Completed/Cancelled)
 * via PUT /api/company/interviews/:id. Scheduling new interviews happens from
 * DriveApplicants.js per-row — this page is the read/manage-all view.
 * Defines a global `CompanyInterviews` component consumed by router.js.
 */
const CompanyInterviews = {
  data: function () {
    return {
      loading: true,
      error: '',
      interviews: [],
      savingIds: []
    };
  },
  computed: {
    statusOptions: function () {
      return ['Scheduled', 'Completed', 'Cancelled'];
    }
  },
  mounted: function () {
    this.fetchInterviews();
  },
  methods: {
    fetchInterviews: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/company/interviews').then(function (res) {
        self.interviews = (res.data || []).map(function (i) {
          i._newStatus = i.status;
          return i;
        });
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load interviews.';
      }).finally(function () {
        self.loading = false;
      });
    },
    saveStatus: function (interview) {
      var self = this;
      if (interview._newStatus === interview.status) return;
      self.savingIds.push(interview.id);
      window.api.put('/company/interviews/' + interview.id, { status: interview._newStatus })
        .then(function () { return self.fetchInterviews(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update interview.';
          interview._newStatus = interview.status;
        })
        .finally(function () {
          var idx = self.savingIds.indexOf(interview.id);
          if (idx !== -1) self.savingIds.splice(idx, 1);
        });
    },
    statusBadgeClass: function (status) {
      return {
        Completed: 'bg-success',
        Cancelled: 'bg-danger',
        Scheduled: 'bg-warning text-dark'
      }[status] || 'bg-secondary';
    },
    fmtDateTime: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="d-flex justify-content-between align-items-center mb-3">' +
    '    <h4><i class="bi bi-calendar-event me-2"></i>Interviews</h4>' +
    '    <router-link to="/company/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <div v-if="interviews.length" class="table-responsive">' +
    '        <table class="table table-hover align-middle mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>Student</th><th>Drive</th><th>Scheduled</th><th>Mode</th><th>Location / Link</th><th>Status</th><th>Update</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="i in interviews" :key="i.id">' +
    '              <td class="fw-semibold">{{ i.student_name }}</td>' +
    '              <td>{{ i.job_title }}</td>' +
    '              <td class="text-nowrap">{{ fmtDateTime(i.scheduled_at) }}</td>' +
    '              <td>{{ i.mode || \'—\' }}</td>' +
    '              <td>{{ i.location_or_link || \'—\' }}</td>' +
    '              <td><span class="badge" :class="statusBadgeClass(i.status)">{{ i.status }}</span></td>' +
    '              <td>' +
    '                <div class="d-flex gap-1">' +
    '                  <select class="form-select form-select-sm" style="min-width:120px" v-model="i._newStatus">' +
    '                    <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>' +
    '                  </select>' +
    '                  <button class="btn btn-sm btn-dark" :disabled="savingIds.indexOf(i.id) !== -1" @click="saveStatus(i)">Save</button>' +
    '                </div>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '      </div>' +
    '      <p v-else class="text-muted p-4 mb-0 text-center">' +
    '        No interviews scheduled yet. Schedule one from a drive\'s applicants list.' +
    '      </p>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
