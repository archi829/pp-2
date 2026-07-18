/**
 * CompanyDrives.js — unified create/edit drive form.
 * Route 'drives/new'      -> create mode (empty form, POST /api/company/drives)
 * Route 'drives/:id/edit' -> edit mode   (GET/PUT /api/company/drives/:id)
 * Defines a global `CompanyDrives` component consumed by router.js.
 */
const CompanyDrives = {
  data: function () {
    return {
      loading: false,
      saving: false,
      error: '',
      form: {
        job_title: '',
        job_description: '',
        eligibility_criteria: '',
        required_skills: '',
        salary_range: '',
        location: '',
        application_deadline: ''
      }
    };
  },
  computed: {
    isEditMode: function () {
      return !!this.$route.params.id;
    },
    minDate: function () {
      // Deadline must be a future date — today doesn't qualify, so floor at tomorrow.
      var d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
  },
  watch: {
    '$route.params.id': {
      immediate: true,
      handler: function () {
        this.loadDrive();
      }
    }
  },
  methods: {
    resetForm: function () {
      this.form = {
        job_title: '',
        job_description: '',
        eligibility_criteria: '',
        required_skills: '',
        salary_range: '',
        location: '',
        application_deadline: ''
      };
    },
    loadDrive: function () {
      var self = this;
      self.error = '';
      if (!self.isEditMode) {
        self.resetForm();
        return;
      }
      self.loading = true;
      window.api.get('/company/drives/' + self.$route.params.id)
        .then(function (res) {
          var d = res.data;
          self.form = {
            job_title: d.job_title || '',
            job_description: d.job_description || '',
            eligibility_criteria: d.eligibility_criteria || '',
            required_skills: d.required_skills || '',
            salary_range: d.salary_range || '',
            location: d.location || '',
            application_deadline: d.application_deadline || ''
          };
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load drive.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    submit: function () {
      var self = this;
      self.error = '';

      if (!self.form.job_title.trim() || !self.form.job_description.trim() || !self.form.application_deadline) {
        self.error = 'Job title, description and application deadline are required.';
        return;
      }
      if (self.form.application_deadline <= new Date().toISOString().slice(0, 10)) {
        self.error = 'Deadline must be a future date.';
        return;
      }

      self.saving = true;
      var request = self.isEditMode
        ? window.api.put('/company/drives/' + self.$route.params.id, self.form)
        : window.api.post('/company/drives', self.form);

      request.then(function () {
        self.$router.push('/company/dashboard');
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || (self.isEditMode ? 'Failed to update drive.' : 'Failed to post drive.');
      }).finally(function () {
        self.saving = false;
      });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="row justify-content-center">' +
    '    <div class="col-md-8">' +
    '      <div class="card p-4">' +
    '        <div class="d-flex justify-content-between align-items-center mb-4">' +
    '          <h4 class="fw-bold mb-0">' +
    '            <i :class="isEditMode ? \'bi bi-pencil-square\' : \'bi bi-briefcase-fill\'" class="me-2"></i>' +
    '            {{ isEditMode ? \'Edit Drive\' : \'Post New Drive\' }}' +
    '          </h4>' +
    '          <router-link to="/company/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '        </div>' +
    '' +
    '        <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '        <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '        <form v-else @submit.prevent="submit">' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Job Title <span class="text-danger">*</span></label>' +
    '            <input type="text" class="form-control" v-model="form.job_title" required>' +
    '          </div>' +
    '' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Job Description <span class="text-danger">*</span></label>' +
    '            <textarea class="form-control" rows="4" v-model="form.job_description" required></textarea>' +
    '          </div>' +
    '' +
    '          <div class="row">' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Eligibility Criteria</label>' +
    '              <input type="text" class="form-control" v-model="form.eligibility_criteria" placeholder="e.g. CGPA >= 7.0, CSE/IT only">' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Required Skills</label>' +
    '              <input type="text" class="form-control" v-model="form.required_skills" placeholder="e.g. Python, SQL, Django">' +
    '            </div>' +
    '          </div>' +
    '' +
    '          <div class="row">' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Salary Range</label>' +
    '              <input type="text" class="form-control" v-model="form.salary_range" placeholder="e.g. 8-12 LPA">' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Location</label>' +
    '              <input type="text" class="form-control" v-model="form.location" placeholder="e.g. Bangalore, Remote">' +
    '            </div>' +
    '          </div>' +
    '' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Application Deadline <span class="text-danger">*</span></label>' +
    '            <input type="date" class="form-control" v-model="form.application_deadline" :min="minDate" required>' +
    '          </div>' +
    '' +
    '          <button type="submit" class="btn btn-dark w-100" :disabled="saving">' +
    '            <i class="bi bi-send me-1"></i>' +
    '            {{ saving ? \'Saving…\' : (isEditMode ? \'Save Changes\' : \'Submit for Admin Approval\') }}' +
    '          </button>' +
    '        </form>' +
    '' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
