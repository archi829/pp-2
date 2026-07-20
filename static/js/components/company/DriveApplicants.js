/**
 * DriveApplicants.js — route 'drives/:id/applications'.
 * Status tabs + CGPA/date sort (query-string-synced, same pattern as AdminDrives.js),
 * select-all + bulk status update, per-row status dropdown, resume blob download
 * (same content-type fix as AdminStudentDetail.js's viewResume), a dedicated
 * position/salary/joining-date modal for marking someone Selected (creates a
 * Placement server-side — not just another dropdown option), and a "Schedule
 * Interview" action per row that posts to /api/company/interviews.
 * Defines a global `DriveApplicants` component consumed by router.js.
 */
const DriveApplicants = {
  data: function () {
    return {
      loading: true,
      error: '',
      drive: null,
      applications: [],
      counts: {},
      tab: this.$route.query.tab || 'all',
      sort: this.$route.query.sort || 'date',
      selected: [],
      bulkStatus: '',
      bulkBusy: false,
      resumeBusyIds: [],
      savingAppIds: [],

      showSelectModal: false,
      selectApp: null,
      selectForm: { position: '', salary: '', joining_date: '' },
      selectSaving: false,

      showInterviewModal: false,
      interviewApp: null,
      interviewForm: { scheduled_at: '', mode: 'Online', location_or_link: '', notes: '' },
      interviewSaving: false,

      // History expansion
      historyMap:  {},   // { app_id: [ log entries ] }
      historyBusy: {},   // { app_id: bool }
      expandedIds: []    // which rows currently have history open
    };
  },
  computed: {
    driveId: function () {
      return this.$route.params.id;
    },
    tabs: function () {
      return [
        ['all', 'All'],
        ['Applied', 'Applied'],
        ['Shortlisted', 'Shortlisted'],
        ['Interview Scheduled', 'Interview Scheduled'],
        ['Selected', 'Selected'],
        ['Rejected', 'Rejected']
      ];
    },
    statusOptions: function () {
      // Mirrors constants.ApplicationStatus.VALID_TRANSITIONS minus 'Selected' and
      // 'Interview Scheduled' — Selected has its own modal (creates a Placement),
      // and Interview Scheduled is now only reachable by actually booking a time
      // via the "Interview" button/modal, not as a bare dropdown option.
      return ['Applied', 'Shortlisted', 'Rejected'];
    }
  },
  watch: {
    '$route': {
      immediate: true,
      handler: function (to) {
        this.tab = to.query.tab || 'all';
        this.sort = to.query.sort || 'date';
        this.selected = [];
        this.fetchApplications();
      }
    }
  },
  methods: {
    fetchApplications: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/company/drives/' + self.driveId + '/applications', {
        params: { tab: self.tab, sort: self.sort }
      }).then(function (res) {
        self.drive = res.data.drive;
        self.counts = res.data.counts || {};
        self.applications = (res.data.applications || []).map(function (a) {
          a._newStatus = a.status;
          return a;
        });
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load applicants.';
      }).finally(function () {
        self.loading = false;
      });
    },
    applyFilters: function (overrides) {
      var query = {};
      var tab = overrides && 'tab' in overrides ? overrides.tab : this.tab;
      var sort = overrides && 'sort' in overrides ? overrides.sort : this.sort;
      if (tab && tab !== 'all') query.tab = tab;
      if (sort && sort !== 'date') query.sort = sort;
      this.$router.push({ path: '/company/drives/' + this.driveId + '/applications', query: query }).catch(function () {});
    },
    setTab: function (tab) {
      this.applyFilters({ tab: tab });
    },
    setSort: function (sort) {
      this.applyFilters({ sort: sort });
    },
    toggleSelectAll: function (e) {
      this.selected = e.target.checked ? this.applications.map(function (a) { return a.id; }) : [];
    },
    isFinalStatus: function (status) {
      return status === 'Selected' || status === 'Placed';
    },
    saveRowStatus: function (app) {
      var self = this;
      if (app._newStatus === app.status) return;
      self.savingAppIds.push(app.id);
      window.api.put('/company/applications/' + app.id + '/status', { status: app._newStatus })
        .then(function () { return self.fetchApplications(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update status.';
          app._newStatus = app.status;
        })
        .finally(function () {
          var idx = self.savingAppIds.indexOf(app.id);
          if (idx !== -1) self.savingAppIds.splice(idx, 1);
        });
    },
    bulkUpdateStatus: function () {
      var self = this;
      if (!self.selected.length) {
        window.alert('Select at least one candidate first.');
        return;
      }
      if (!self.bulkStatus) {
        window.alert('Choose a status to apply first.');
        return;
      }
      if (!window.confirm('Mark ' + self.selected.length + ' candidate(s) as "' + self.bulkStatus + '"?')) return;

      self.bulkBusy = true;
      window.api.post('/company/applications/bulk-status', { app_ids: self.selected, status: self.bulkStatus })
        .then(function () {
          self.selected = [];
          self.bulkStatus = '';
          return self.fetchApplications();
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Bulk update failed.';
        })
        .finally(function () {
          self.bulkBusy = false;
        });
    },
    viewResume: function (studentId) {
      var self = this;
      self.resumeBusyIds.push(studentId);
      window.api.get('/company/student/' + studentId + '/resume', { responseType: 'blob' })
        .then(function (res) {
          // res.data is a Blob but defaults to application/octet-stream unless we pass
          // the real content-type through, or the browser renders raw bytes as text
          // instead of opening a PDF viewer.
          var contentType = res.headers && res.headers['content-type']
            ? res.headers['content-type']
            : 'application/pdf';
          var blob = new Blob([res.data], { type: contentType });
          var url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(function () { window.URL.revokeObjectURL(url); }, 60000);
        })
        .catch(function () {
          self.error = 'Failed to load resume.';
        })
        .finally(function () {
          var idx = self.resumeBusyIds.indexOf(studentId);
          if (idx !== -1) self.resumeBusyIds.splice(idx, 1);
        });
    },

    // ── Select (creates Placement) ──────────────────────────────────────
    openSelectModal: function (app) {
      this.selectApp = app;
      this.selectForm = { position: '', salary: '', joining_date: '' };
      this.showSelectModal = true;
    },
    closeSelectModal: function () {
      this.showSelectModal = false;
      this.selectApp = null;
    },
    submitSelect: function () {
      var self = this;
      self.selectSaving = true;
      window.api.put('/company/applications/' + self.selectApp.id + '/select', self.selectForm)
        .then(function () {
          self.closeSelectModal();
          return self.fetchApplications();
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to mark candidate as Selected.';
        })
        .finally(function () {
          self.selectSaving = false;
        });
    },

    // ── Schedule interview ───────────────────────────────────────────────
    openInterviewModal: function (app) {
      this.interviewApp = app;
      this.interviewForm = { scheduled_at: '', mode: 'Online', location_or_link: '', notes: '' };
      this.showInterviewModal = true;
    },
    closeInterviewModal: function () {
      this.showInterviewModal = false;
      this.interviewApp = null;
    },
    submitInterview: function () {
      var self = this;
      if (!self.interviewForm.scheduled_at) {
        self.error = 'Interview date/time is required.';
        return;
      }
      self.interviewSaving = true;
      window.api.post('/company/interviews', {
        application_id: self.interviewApp.id,
        scheduled_at: self.interviewForm.scheduled_at,
        mode: self.interviewForm.mode,
        location_or_link: self.interviewForm.location_or_link,
        notes: self.interviewForm.notes
      }).then(function () {
        self.closeInterviewModal();
        if (typeof window.showToast === 'function') {
          window.showToast('Interview scheduled.');
        }
        return self.fetchApplications();
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to schedule interview.';
      }).finally(function () {
        self.interviewSaving = false;
      });
    },

    // ── History expansion ─────────────────────────────────────────────────
    toggleHistory: function (app) {
      var self = this;
      var idx  = self.expandedIds.indexOf(app.id);
      if (idx !== -1) { self.expandedIds.splice(idx, 1); return; }
      if (self.historyMap[app.id]) { self.expandedIds.push(app.id); return; }
      self.$set(self.historyBusy, app.id, true);
      window.api.get('/company/applications/' + app.id + '/history')
        .then(function (res) {
          self.$set(self.historyMap, app.id, res.data || []);
          self.expandedIds.push(app.id);
        })
        .catch(function () { window.showToast('Could not load status history.'); })
        .finally(function () { self.$set(self.historyBusy, app.id, false); });
    },
    isExpanded: function (appId) {
      return this.expandedIds.indexOf(appId) !== -1;
    },
    statusBadgeClass: function (status) {
      var map = {
        'Applied': 'bg-secondary', 'Shortlisted': 'bg-info text-dark',
        'Interview Scheduled': 'bg-warning text-dark',
        'Selected': 'bg-success', 'Rejected': 'bg-danger', 'Placed': 'bg-primary'
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
    '<div class="container-fluid mt-4 px-4">' +
    '' +
    '  <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">' +
    '    <div>' +
    '      <h4 class="fw-bold mb-0">{{ drive ? drive.job_title : \'\' }}</h4>' +
    '      <p v-if="drive" class="text-muted small mb-0">' +
    '        {{ drive.location || \'—\' }} · Deadline: {{ fmtDate(drive.application_deadline) }}' +
    '      </p>' +
    '    </div>' +
    '    <router-link to="/company/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <ul class="nav nav-tabs mb-0">' +
    '    <li class="nav-item" v-for="t in tabs" :key="t[0]">' +
    '      <a class="nav-link" :class="{ \'active fw-semibold\': tab === t[0] }" href="#" @click.prevent="setTab(t[0])">' +
    '        {{ t[1] }} <span class="badge ms-1 bg-dark">{{ counts[t[0]] || 0 }}</span>' +
    '      </a>' +
    '    </li>' +
    '  </ul>' +
    '' +
    '  <div class="card" style="border-top-left-radius:0; border-top-right-radius:0;">' +
    '    <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '    <div v-else class="card-body p-0">' +
    '      <template v-if="applications.length">' +
    '' +
    '        <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom bg-light flex-wrap gap-2">' +
    '          <div class="d-flex align-items-center gap-2">' +
    '            <span class="text-muted small">Sort by CGPA:</span>' +
    '            <button class="btn btn-sm" :class="sort === \'cgpa_desc\' ? \'btn-dark\' : \'btn-outline-secondary\'" @click="setSort(\'cgpa_desc\')">↓ High first</button>' +
    '            <button class="btn btn-sm" :class="sort === \'cgpa_asc\' ? \'btn-dark\' : \'btn-outline-secondary\'" @click="setSort(\'cgpa_asc\')">↑ Low first</button>' +
    '            <button class="btn btn-sm" :class="sort === \'date\' ? \'btn-dark\' : \'btn-outline-secondary\'" @click="setSort(\'date\')">Date</button>' +
    '          </div>' +
    '          <div class="d-flex align-items-center gap-2">' +
    '            <span class="text-muted small">{{ selected.length }} selected</span>' +
    '            <select class="form-select form-select-sm" style="min-width:150px" v-model="bulkStatus">' +
    '              <option value="" disabled>Mark as…</option>' +
    '              <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>' +
    '            </select>' +
    '            <button class="btn btn-sm btn-dark" :disabled="bulkBusy" @click="bulkUpdateStatus">Apply</button>' +
    '          </div>' +
    '        </div>' +
    '' +
    '        <div class="table-responsive">' +
    '          <table class="table table-hover align-middle mb-0">' +
    '            <thead class="table-light">' +
    '              <tr>' +
    '                <th style="width:36px"><input type="checkbox" class="form-check-input" :checked="selected.length === applications.length" @change="toggleSelectAll"></th>' +
    '                <th>#</th><th>Student</th><th>CGPA</th><th>Skills</th><th>Applied On</th><th>Status</th><th>Actions</th>' +
    '              </tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <template v-for="(a, idx) in applications" :key="a.id">' +
    '              <tr>' +
    '                <td><input type="checkbox" class="form-check-input" :value="a.id" v-model="selected"></td>' +
    '                <td class="text-muted small">{{ idx + 1 }}</td>' +
    '                <td>' +
    '                  <router-link :to="\'/company/student/\' + a.student.id" class="fw-semibold text-decoration-none">{{ a.student.full_name }}</router-link>' +
    '                  <div class="text-muted small">{{ a.student.email }}</div>' +
    '                </td>' +
    '                <td>' +
    '                  <span v-if="a.student.cgpa" class="badge bg-light text-dark border fw-semibold">{{ a.student.cgpa.toFixed ? a.student.cgpa.toFixed(2) : a.student.cgpa }}</span>' +
    '                  <span v-else class="text-muted">—</span>' +
    '                </td>' +
    '                <td>' +
    '                  <span class="text-muted small">{{ a.student.skills || \'—\' }}</span>' +
    '                </td>' +
    '                <td class="text-nowrap">{{ fmtDate(a.applied_at) }}</td>' +
    '                <td>' +
    '                  <span v-if="isFinalStatus(a.status)" class="badge bg-success">{{ a.status }}</span>' +
    '                  <div v-else class="d-flex gap-1">' +
    '                    <select class="form-select form-select-sm" style="min-width:130px" v-model="a._newStatus">' +
    '                      <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>' +
    '                    </select>' +
    '                    <button class="btn btn-sm btn-dark" :disabled="savingAppIds.indexOf(a.id) !== -1" @click="saveRowStatus(a)">Save</button>' +
    '                  </div>' +
    '                </td>' +
    '                <td>' +
    '                  <div class="d-flex gap-1 flex-wrap">' +
    '                    <a v-if="a.student.resume_path" href="#" class="btn btn-sm btn-outline-secondary" :class="{ disabled: resumeBusyIds.indexOf(a.student.id) !== -1 }" @click.prevent="viewResume(a.student.id)">' +
    '                      <i class="bi bi-file-earmark-person"></i> Resume' +
    '                    </a>' +
    '                    <button class="btn btn-sm btn-outline-info" @click="openInterviewModal(a)"><i class="bi bi-calendar-event"></i> Interview</button>' +
    '                    <button v-if="!isFinalStatus(a.status)" class="btn btn-sm btn-success" @click="openSelectModal(a)"><i class="bi bi-check2-circle"></i> Select</button>' +
    '                    <button class="btn btn-sm btn-outline-secondary" :disabled="historyBusy[a.id]" @click="toggleHistory(a)" title="Status history">' +
    '                      <i class="bi bi-clock-history"></i> {{ isExpanded(a.id) ? "▲" : "▼" }}' +
    '                    </button>' +
    '                  </div>' +
    '                </td>' +
    '              </tr>' +
    '              <!-- History expansion row -->' +
    '              <tr v-if="isExpanded(a.id) && historyMap[a.id]" :key="\'h-\' + a.id">' +
    '                <td colspan="8" class="bg-light p-3">' +
    '                  <p class="text-muted small fw-semibold mb-2"><i class="bi bi-clock-history me-1"></i>Status History — {{ a.student.full_name }}</p>' +
    '                  <div v-if="!historyMap[a.id].length" class="text-muted small">No history recorded yet.</div>' +
    '                  <div v-else class="d-flex gap-2 flex-wrap align-items-center">' +
    '                    <template v-for="(entry, i) in historyMap[a.id]">' +
    '                      <div class="text-center" style="min-width:110px">' +
    '                        <span class="badge bg-secondary d-block mb-1" style="font-size:0.7rem">{{ entry.from_status || "Start" }}</span>' +
    '                        <i class="bi bi-arrow-right text-muted d-block"></i>' +
    '                        <span :class="statusBadgeClass(entry.to_status) + \' d-block mt-1\'" style="font-size:0.7rem">{{ entry.to_status }}</span>' +
    '                        <small class="text-muted d-block mt-1" style="font-size:0.65rem">{{ fmtDate(entry.changed_at) }}</small>' +
    '                        <small class="text-muted text-capitalize d-block" style="font-size:0.65rem">by {{ entry.changed_by_role }}</small>' +
    '                        <small v-if="entry.note" class="text-info d-block" style="font-size:0.65rem">{{ entry.note }}</small>' +
    '                      </div>' +
    '                      <i v-if="i < historyMap[a.id].length - 1" class="bi bi-three-dots text-muted"></i>' +
    '                    </template>' +
    '                  </div>' +
    '                </td>' +
    '              </tr>' +
    '              </template>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '      </template>' +
    '      <p v-else class="text-muted p-4 mb-0 text-center">No applications in this category.</p>' +
    '    </div>' +
    '  </div>' +
    '' +
    '  <div v-if="showSelectModal" class="modal d-block" style="background: rgba(0,0,0,.5);" @click.self="closeSelectModal">' +
    '    <div class="modal-dialog">' +
    '      <div class="modal-content">' +
    '        <div class="modal-header">' +
    '          <h5 class="modal-title">Mark Selected — {{ selectApp.student.full_name }}</h5>' +
    '          <button type="button" class="btn-close" @click="closeSelectModal"></button>' +
    '        </div>' +
    '        <div class="modal-body">' +
    '          <p class="text-muted small">This creates a Placement record for this candidate.</p>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Position</label>' +
    '            <input type="text" class="form-control" v-model="selectForm.position" placeholder="e.g. Software Engineer">' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Salary</label>' +
    '            <input type="text" class="form-control" v-model="selectForm.salary" placeholder="e.g. 10 LPA">' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Joining Date <span class="text-muted small">(optional)</span></label>' +
    '            <input type="date" class="form-control" v-model="selectForm.joining_date">' +
    '          </div>' +
    '        </div>' +
    '        <div class="modal-footer">' +
    '          <button type="button" class="btn btn-outline-secondary" @click="closeSelectModal">Cancel</button>' +
    '          <button type="button" class="btn btn-success" :disabled="selectSaving" @click="submitSelect">' +
    '            {{ selectSaving ? \'Saving…\' : \'Confirm Selection\' }}' +
    '          </button>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '' +
    '  <div v-if="showInterviewModal" class="modal d-block" style="background: rgba(0,0,0,.5);" @click.self="closeInterviewModal">' +
    '    <div class="modal-dialog">' +
    '      <div class="modal-content">' +
    '        <div class="modal-header">' +
    '          <h5 class="modal-title">Schedule Interview — {{ interviewApp.student.full_name }}</h5>' +
    '          <button type="button" class="btn-close" @click="closeInterviewModal"></button>' +
    '        </div>' +
    '        <div class="modal-body">' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Date &amp; Time <span class="text-danger">*</span></label>' +
    '            <input type="datetime-local" class="form-control" v-model="interviewForm.scheduled_at" required>' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Mode</label>' +
    '            <select class="form-select" v-model="interviewForm.mode">' +
    '              <option value="Online">Online</option>' +
    '              <option value="In-person">In-person</option>' +
    '            </select>' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Location / Link</label>' +
    '            <input type="text" class="form-control" v-model="interviewForm.location_or_link" placeholder="Meeting link or office address">' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Notes</label>' +
    '            <textarea class="form-control" rows="2" v-model="interviewForm.notes"></textarea>' +
    '          </div>' +
    '        </div>' +
    '        <div class="modal-footer">' +
    '          <button type="button" class="btn btn-outline-secondary" @click="closeInterviewModal">Cancel</button>' +
    '          <button type="button" class="btn btn-dark" :disabled="interviewSaving" @click="submitInterview">' +
    '            {{ interviewSaving ? \'Scheduling…\' : \'Schedule\' }}' +
    '          </button>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '' +
    '</div>'
};