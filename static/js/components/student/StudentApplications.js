/**
 * StudentApplications.js — GET /api/student/applications (full history).
 * Status-count stat cards, full table with per-row cover-letter modal,
 * inline personal-note save, and offer Accept/Decline for Selected rows.
 * Defines a global `StudentApplications` component consumed by router.js.
 */
const StudentApplications = {
  data: function () {
    return {
      loading: true,
      error: '',
      applications: [],
      statusCounts: {},
      total: 0,
      // cover letter modal
      showCLModal: false,
      clApp: null,
      // note saving state: map of app.id -> bool
      savingNotes: {},
      // offer responding state
      offerBusyIds: []
    };
  },
  mounted: function () {
    this.fetchApplications();
  },
  methods: {
    fetchApplications: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/student/applications').then(function (res) {
        self.total = res.data.total || 0;
        self.statusCounts = res.data.status_counts || {};
        // Attach a local _note field so inline edits don't mutate the original
        self.applications = (res.data.applications || []).map(function (a) {
          a._note = a.student_notes || '';
          return a;
        });
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load applications.';
      }).finally(function () {
        self.loading = false;
      });
    },
    saveNote: function (app) {
      var self = this;
      self.$set(self.savingNotes, app.id, true);
      window.api.put('/student/applications/' + app.id + '/note', {
        student_notes: app._note
      }).then(function () {
        app.student_notes = app._note;
      }).catch(function (err) {
        var msg = (err.response && err.response.data && err.response.data.msg) || 'Failed to save note.';
        window.showToast(msg);
      }).finally(function () {
        self.$set(self.savingNotes, app.id, false);
      });
    },
    respondOffer: function (app, action) {
      var self = this;
      var label = action === 'accept' ? 'accept' : 'decline';
      if (!window.confirm('Are you sure you want to ' + label + ' this offer?')) return;
      self.offerBusyIds.push(app.id);
      window.api.put('/student/applications/' + app.id + '/offer', { action: action })
        .then(function () {
          self.fetchApplications();
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
    openCL: function (app) {
      this.clApp = app;
      this.showCLModal = true;
    },
    closeCL: function () {
      this.showCLModal = false;
      this.clApp = null;
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
    offerBadgeClass: function (offerStatus) {
      if (offerStatus === 'Accepted') return 'badge bg-success';
      if (offerStatus === 'Declined') return 'badge bg-danger';
      return 'badge bg-warning text-dark';
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
    '    <h4><i class="bi bi-clock-history me-2"></i>My Application History</h4>' +
    '    <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <template v-else>' +
    '' +
    '    <!-- Status count cards -->' +
    '    <div v-if="applications.length" class="row g-3 mb-4">' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-secondary">{{ statusCounts[\'Applied\'] || 0 }}</div>' +
    '          <div class="text-muted small">Applied</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-info">{{ statusCounts[\'Shortlisted\'] || 0 }}</div>' +
    '          <div class="text-muted small">Shortlisted</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-warning">{{ statusCounts[\'Interview Scheduled\'] || 0 }}</div>' +
    '          <div class="text-muted small">Interview</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-success">{{ statusCounts[\'Selected\'] || 0 }}</div>' +
    '          <div class="text-muted small">Selected</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-danger">{{ statusCounts[\'Rejected\'] || 0 }}</div>' +
    '          <div class="text-muted small">Rejected</div>' +
    '        </div>' +
    '      </div>' +
    '      <div class="col-6 col-md-2">' +
    '        <div class="card text-center p-2">' +
    '          <div class="fs-4 fw-bold text-dark">{{ total }}</div>' +
    '          <div class="text-muted small">Total</div>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <!-- Applications table -->' +
    '    <div class="card">' +
    '      <div class="card-body p-0">' +
    '        <div v-if="applications.length" class="table-responsive">' +
    '          <table class="table table-hover mb-0">' +
    '            <thead class="table-light">' +
    '              <tr>' +
    '                <th>#</th><th>Job Title</th><th>Company</th><th>Location</th>' +
    '                <th>Salary</th><th>Applied On</th><th>Status</th>' +
    '                <th>Cover Letter</th><th>My Notes</th>' +
    '              </tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <tr v-for="(a, idx) in applications" :key="a.id">' +
    '                <td class="text-muted small">{{ idx + 1 }}</td>' +
    '                <td class="fw-semibold">' +
    '                  <router-link :to="\'/student/drives/\' + a.drive_id" class="text-decoration-none text-dark">{{ a.job_title }}</router-link>' +
    '                </td>' +
    '                <td>{{ a.company_name }}</td>' +
    '                <td>{{ a.location || \'—\' }}</td>' +
    '                <td>{{ a.salary_range || \'—\' }}</td>' +
    '                <td class="text-nowrap">{{ fmtDate(a.applied_at) }}</td>' +
    '                <td>' +
    '                  <span :class="statusBadgeClass(a.status)">{{ a.status }}</span>' +
    '                  <template v-if="a.status === \'Selected\'">' +
    '                    <div class="mt-1">' +
    '                      <span v-if="a.offer_status !== \'Pending\'" :class="offerBadgeClass(a.offer_status)">Offer {{ a.offer_status }}</span>' +
    '                      <div v-else class="d-flex gap-1 mt-1">' +
    '                        <button class="btn btn-xs btn-success btn-sm py-0 px-1" :disabled="offerBusyIds.indexOf(a.id) !== -1" @click="respondOffer(a, \'accept\')">Accept</button>' +
    '                        <button class="btn btn-xs btn-outline-danger btn-sm py-0 px-1" :disabled="offerBusyIds.indexOf(a.id) !== -1" @click="respondOffer(a, \'reject\')">Decline</button>' +
    '                      </div>' +
    '                    </div>' +
    '                  </template>' +
    '                </td>' +
    '                <td>' +
    '                  <button v-if="a.cover_letter" type="button" class="btn btn-sm btn-outline-secondary" @click="openCL(a)">View</button>' +
    '                  <span v-else class="text-muted small">—</span>' +
    '                </td>' +
    '                <td>' +
    '                  <div class="d-flex align-items-center gap-1">' +
    '                    <textarea class="form-control form-control-sm" rows="1" v-model="a._note" placeholder="Add a note…" style="min-width:140px"></textarea>' +
    '                    <button class="btn btn-sm btn-outline-secondary flex-shrink-0" :disabled="savingNotes[a.id]" @click="saveNote(a)" title="Save note">' +
    '                      <i class="bi bi-save"></i>' +
    '                    </button>' +
    '                  </div>' +
    '                </td>' +
    '              </tr>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '        <p v-else class="text-muted p-3 mb-0">' +
    '          You haven\'t applied to any drives yet. <router-link to="/student/drives">Browse drives →</router-link>' +
    '        </p>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '' +
    '  <!-- Cover letter modal (lightweight overlay, no Bootstrap JS) -->' +
    '  <div v-if="showCLModal && clApp" class="modal d-block" style="background: rgba(0,0,0,.5);" @click.self="closeCL">' +
    '    <div class="modal-dialog">' +
    '      <div class="modal-content">' +
    '        <div class="modal-header">' +
    '          <h5 class="modal-title">Cover Letter — {{ clApp.job_title }}</h5>' +
    '          <button type="button" class="btn-close" @click="closeCL"></button>' +
    '        </div>' +
    '        <div class="modal-body">' +
    '          <p class="mb-0" style="white-space: pre-wrap;">{{ clApp.cover_letter }}</p>' +
    '        </div>' +
    '        <div class="modal-footer">' +
    '          <button type="button" class="btn btn-outline-secondary" @click="closeCL">Close</button>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '' +
    '</div>'
};
