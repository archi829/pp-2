/**
 * DriveDetail.js — GET /api/student/drives/:id + POST /api/student/applications.
 * Shows drive details and a cover-letter apply form, or an already-applied
 * status block if the student has previously applied.
 * Defines a global `DriveDetail` component consumed by router.js.
 */
const DriveDetail = {
  data: function () {
    return {
      loading: true,
      applying: false,
      error: '',
      drive: null,
      alreadyApplied: null,
      coverLetter: ''
    };
  },
  computed: {
    driveId: function () {
      return this.$route.params.id;
    }
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler: function () {
        this.fetchDrive();
      }
    }
  },
  methods: {
    fetchDrive: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      self.coverLetter = '';
      return window.api.get('/student/drives/' + self.driveId).then(function (res) {
        self.drive = res.data;
        self.alreadyApplied = res.data.already_applied || null;
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load drive.';
      }).finally(function () {
        self.loading = false;
      });
    },
    submitApplication: function () {
      var self = this;
      self.applying = true;
      self.error = '';
      window.api.post('/student/applications', {
        drive_id: parseInt(self.driveId),
        cover_letter: self.coverLetter
      }).then(function () {
        self.$router.push('/student/applications');
      }).catch(function (err) {
        var msg = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to submit application.';
        if (err.response && err.response.status === 409) {
          self.error = msg;
          self.fetchDrive();
        } else {
          self.error = msg;
        }
      }).finally(function () {
        self.applying = false;
      });
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
      return 'badge fs-6 ' + (map[status] || 'bg-secondary');
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
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else-if="drive" class="row justify-content-center">' +
    '    <div class="col-md-8">' +
    '      <div class="card">' +
    '        <div class="card-body">' +
    '          <div class="d-flex justify-content-between align-items-start mb-3">' +
    '            <div>' +
    '              <h4 class="fw-bold mb-1">{{ drive.job_title }}</h4>' +
    '              <p class="text-muted mb-0">{{ drive.company_name }}</p>' +
    '            </div>' +
    '            <router-link to="/student/drives" class="btn btn-sm btn-outline-secondary">← Back</router-link>' +
    '          </div>' +
    '' +
    '          <hr>' +
    '' +
    '          <div class="row g-3 mb-3">' +
    '            <div class="col-md-6">' +
    '              <p class="mb-1"><strong>Location:</strong> {{ drive.location || \'Not specified\' }}</p>' +
    '              <p class="mb-1"><strong>Salary:</strong> {{ drive.salary_range || \'Not disclosed\' }}</p>' +
    '              <p class="mb-1"><strong>Deadline:</strong> {{ fmtDate(drive.application_deadline) }}</p>' +
    '            </div>' +
    '            <div class="col-md-6">' +
    '              <p class="mb-1"><strong>Required Skills:</strong> {{ drive.required_skills || \'—\' }}</p>' +
    '              <p class="mb-1"><strong>Eligibility:</strong> {{ drive.eligibility_criteria || \'—\' }}</p>' +
    '            </div>' +
    '          </div>' +
    '' +
    '          <h6 class="fw-bold">Job Description</h6>' +
    '          <p class="text-muted" style="white-space: pre-wrap;">{{ drive.job_description }}</p>' +
    '' +
    '          <hr>' +
    '' +
    '          <!-- Already applied -->' +
    '          <div v-if="alreadyApplied" class="alert alert-success mb-0">' +
    '            <i class="bi bi-check-circle me-2"></i>' +
    '            You have already applied for this drive.' +
    '            Status: <span :class="statusBadgeClass(alreadyApplied.status)">{{ alreadyApplied.status }}</span>' +
    '          </div>' +
    '' +
    '          <!-- Apply form -->' +
    '          <form v-else @submit.prevent="submitApplication">' +
    '            <div class="mb-3">' +
    '              <label class="form-label fw-semibold">' +
    '                Cover Letter <span class="text-muted small">(optional)</span>' +
    '              </label>' +
    '              <textarea class="form-control" rows="4" v-model="coverLetter" placeholder="Why are you a good fit for this role?"></textarea>' +
    '            </div>' +
    '            <button type="submit" class="btn btn-dark w-100" :disabled="applying">' +
    '              <i class="bi bi-send me-1"></i>{{ applying ? \'Submitting…\' : \'Submit Application\' }}' +
    '            </button>' +
    '          </form>' +
    '' +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
