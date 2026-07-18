/**
 * CompanyStudentProfile.js — route 'student/:id'.
 * Company-scoped student view (adapted from AdminStudentDetail.js): profile card,
 * resume blob download, and this student's application history against THIS
 * company's drives only (404s server-side if the student never applied here).
 * Also lets the company update an application's status inline, same as the old
 * templates/company/student_profile.html.
 * Defines a global `CompanyStudentProfile` component consumed by router.js.
 */
const CompanyStudentProfile = {
  data: function () {
    return {
      student: null,
      applications: [],
      loading: true,
      error: '',
      resumeBusy: false,
      savingAppIds: []
    };
  },
  computed: {
    statusOptions: function () {
      // 'Selected' and 'Interview Scheduled' are deliberately excluded — this page
      // has no scheduling modal or Placement form, so those transitions only
      // happen from a drive's applicants page (DriveApplicants.js).
      return ['Applied', 'Shortlisted', 'Rejected'];
    }
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler: function () {
        this.fetchDetail();
      }
    }
  },
  methods: {
    fetchDetail: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/company/student/' + self.$route.params.id + '/profile')
        .then(function (res) {
          var data = res.data;
          self.applications = (data.applications || []).map(function (a) {
            a._newStatus = a.status;
            return a;
          });
          delete data.applications;
          self.student = data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load student.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    isFinalStatus: function (status) {
      return status === 'Selected' || status === 'Placed';
    },
    saveRowStatus: function (app) {
      var self = this;
      if (app._newStatus === app.status) return;
      self.savingAppIds.push(app.id);
      window.api.put('/company/applications/' + app.id + '/status', { status: app._newStatus })
        .then(function () { return self.fetchDetail(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update status.';
          app._newStatus = app.status;
        })
        .finally(function () {
          var idx = self.savingAppIds.indexOf(app.id);
          if (idx !== -1) self.savingAppIds.splice(idx, 1);
        });
    },
    viewResume: function () {
      var self = this;
      self.resumeBusy = true;
      window.api.get('/company/student/' + self.student.id + '/resume', { responseType: 'blob' })
        .then(function (res) {
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
          self.resumeBusy = false;
        });
    },
    statusBadgeClass: function (status) {
      return {
        Selected: 'bg-success',
        Placed: 'bg-success',
        Rejected: 'bg-danger',
        Shortlisted: 'bg-info text-dark',
        'Interview Scheduled': 'bg-warning text-dark'
      }[status] || 'bg-secondary';
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
    '  <div class="mb-3">' +
    '    <a href="#" class="btn btn-sm btn-outline-secondary" @click.prevent="$router.go(-1)">← Back</a>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <template v-else-if="student">' +
    '' +
    '    <div class="card mb-4">' +
    '      <div class="card-body">' +
    '        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">' +
    '          <div>' +
    '            <h4 class="fw-bold mb-1"><i class="bi bi-person-circle me-2 text-primary"></i>{{ student.full_name }}</h4>' +
    '            <p class="text-muted mb-1"><i class="bi bi-envelope me-1"></i>{{ student.email }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-telephone me-1"></i>{{ student.phone || \'Not provided\' }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-mortarboard me-1"></i>{{ student.education || \'Not provided\' }}</p>' +
    '            <p class="text-muted mb-1"><i class="bi bi-bar-chart me-1"></i>CGPA: <strong>{{ student.cgpa || \'—\' }}</strong></p>' +
    '          </div>' +
    '          <div>' +
    '            <button v-if="student.resume_path" class="btn btn-primary" :disabled="resumeBusy" @click="viewResume">' +
    '              <span v-if="resumeBusy" class="spinner-border spinner-border-sm me-1"></span>' +
    '              <i v-else class="bi bi-eye me-1"></i>View Resume' +
    '            </button>' +
    '            <span v-else class="text-muted">No resume uploaded</span>' +
    '          </div>' +
    '        </div>' +
    '' +
    '        <template v-if="student.skills">' +
    '          <hr>' +
    '          <p class="fw-semibold mb-2"><i class="bi bi-tools me-1"></i>Skills</p>' +
    '          <div class="d-flex flex-wrap gap-2">' +
    '            <span v-for="(sk, i) in student.skills.split(\',\')" :key="i" class="badge bg-light text-dark border">{{ sk.trim() }}</span>' +
    '          </div>' +
    '        </template>' +
    '      </div>' +
    '    </div>' +
    '' +
    '    <div class="card">' +
    '      <div class="card-header bg-white fw-semibold">' +
    '        <i class="bi bi-briefcase me-2 text-info"></i>Applications to Your Drives' +
    '      </div>' +
    '      <div class="card-body p-0">' +
    '        <div class="table-responsive">' +
    '          <table class="table table-hover mb-0">' +
    '            <thead class="table-light">' +
    '              <tr><th>Drive</th><th>Applied On</th><th>Status</th><th>Update</th></tr>' +
    '            </thead>' +
    '            <tbody>' +
    '              <tr v-for="a in applications" :key="a.id">' +
    '                <td class="fw-semibold">{{ a.job_title }}</td>' +
    '                <td>{{ fmtDate(a.applied_at) }}</td>' +
    '                <td><span class="badge" :class="statusBadgeClass(a.status)">{{ a.status }}</span></td>' +
    '                <td>' +
    '                  <div v-if="!isFinalStatus(a.status)" class="d-flex gap-1">' +
    '                    <select class="form-select form-select-sm" style="min-width:130px" v-model="a._newStatus">' +
    '                      <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>' +
    '                    </select>' +
    '                    <button class="btn btn-sm btn-dark" :disabled="savingAppIds.indexOf(a.id) !== -1" @click="saveRowStatus(a)">Save</button>' +
    '                  </div>' +
    '                  <span v-else class="text-muted small">Use the drive\'s applicants page to select or schedule an interview for this candidate.</span>' +
    '                </td>' +
    '              </tr>' +
    '            </tbody>' +
    '          </table>' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '' +
    '  </template>' +
    '</div>'
};