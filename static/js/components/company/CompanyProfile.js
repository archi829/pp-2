/**
 * CompanyProfile.js — GET/PUT /api/company/profile.
 * company_name and email are read-only; hr_contact/industry/website/description editable.
 * Defines a global `CompanyProfile` component consumed by router.js.
 */
const CompanyProfile = {
  data: function () {
    return {
      loading: true,
      saving: false,
      error: '',
      successMsg: '',
      form: {
        company_name: '',
        email: '',
        hr_contact: '',
        industry: '',
        website: '',
        description: ''
      }
    };
  },
  mounted: function () {
    this.fetchProfile();
  },
  methods: {
    fetchProfile: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/company/profile').then(function (res) {
        var c = res.data;
        self.form = {
          company_name: c.company_name || '',
          email: c.email || '',
          hr_contact: c.hr_contact || '',
          industry: c.industry || '',
          website: c.website || '',
          description: c.description || ''
        };
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to load profile.';
      }).finally(function () {
        self.loading = false;
      });
    },
    saveProfile: function () {
      var self = this;
      self.saving = true;
      self.error = '';
      self.successMsg = '';
      window.api.put('/company/profile', {
        hr_contact: self.form.hr_contact,
        industry: self.form.industry,
        website: self.form.website,
        description: self.form.description
      }).then(function () {
        self.successMsg = 'Profile updated successfully.';
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update profile.';
      }).finally(function () {
        self.saving = false;
      });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="row justify-content-center">' +
    '    <div class="col-md-7">' +
    '      <div class="card p-4">' +
    '        <div class="d-flex justify-content-between align-items-center mb-4">' +
    '          <h4 class="fw-bold mb-0"><i class="bi bi-building me-2"></i>Company Profile</h4>' +
    '          <router-link to="/company/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '        </div>' +
    '' +
    '        <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '        <div v-if="successMsg" class="alert alert-success alert-dismissible fade show" role="alert">' +
    '          {{ successMsg }}' +
    '          <button type="button" class="btn-close" @click="successMsg = \'\'"></button>' +
    '        </div>' +
    '' +
    '        <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '        <form v-else @submit.prevent="saveProfile">' +
    '          <div class="row">' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Company Name</label>' +
    '              <input type="text" class="form-control" :value="form.company_name" disabled>' +
    '              <div class="form-text">Company name cannot be changed.</div>' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Email</label>' +
    '              <input type="email" class="form-control" :value="form.email" disabled>' +
    '              <div class="form-text">Email cannot be changed.</div>' +
    '            </div>' +
    '          </div>' +
    '          <div class="row">' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">HR Contact Name</label>' +
    '              <input type="text" class="form-control" v-model="form.hr_contact">' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Industry</label>' +
    '              <input type="text" class="form-control" v-model="form.industry" placeholder="e.g. Software, Finance">' +
    '            </div>' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Website</label>' +
    '            <input type="url" class="form-control" v-model="form.website" placeholder="https://yourcompany.com">' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Company Description</label>' +
    '            <textarea class="form-control" rows="3" v-model="form.description" placeholder="Brief description of your company..."></textarea>' +
    '          </div>' +
    '          <button type="submit" class="btn btn-dark w-100" :disabled="saving">' +
    '            <i class="bi bi-check-circle me-1"></i>{{ saving ? \'Saving…\' : \'Save Changes\' }}' +
    '          </button>' +
    '        </form>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
