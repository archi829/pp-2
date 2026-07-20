/**
 * StudentProfile.js — GET/PUT /api/student/profile and POST /api/student/profile/resume.
 * Resume upload uses FormData (multipart), NOT the shared JSON window.api headers.
 * Defines a global `StudentProfile` component consumed by router.js.
 */
const StudentProfile = {
  data: function () {
    return {
      loading: true,
      saving: false,
      uploading: false,
      error: '',
      successMsg: '',
      resumeFile: null,
      form: {
        full_name: '',
        email: '',
        phone: '',
        cgpa: '',
        skills: '',
        education: '',
        resume_path: ''
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
      return window.api.get('/student/profile').then(function (res) {
        var s = res.data;
        self.form = {
          full_name: s.full_name || '',
          email: s.email || '',
          phone: s.phone || '',
          cgpa: s.cgpa != null ? String(s.cgpa) : '',
          skills: s.skills || '',
          education: s.education || '',
          resume_path: s.resume_path || ''
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
      window.api.put('/student/profile', {
        full_name: self.form.full_name,
        phone: self.form.phone,
        cgpa: self.form.cgpa !== '' ? parseFloat(self.form.cgpa) : null,
        skills: self.form.skills,
        education: self.form.education
      }).then(function (res) {
        self.successMsg = 'Profile updated successfully.';
        self.form.resume_path = res.data.resume_path || self.form.resume_path;
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to update profile.';
      }).finally(function () {
        self.saving = false;
      });
    },
    onFileChange: function (e) {
      this.resumeFile = e.target.files[0] || null;
    },
    uploadResume: function () {
      var self = this;
      if (!self.resumeFile) return;
      self.uploading = true;
      self.error = '';
      self.successMsg = '';

      // Must use FormData — don't pass through window.api's default Content-Type.
      // Let axios set the multipart boundary automatically.
      var formData = new FormData();
      formData.append('resume', self.resumeFile);

      window.api.post('/student/profile/resume', formData, {
        headers: { 'Content-Type': undefined }
      }).then(function (res) {
        self.successMsg = 'Resume uploaded successfully.';
        self.form.resume_path = res.data.resume_path || '';
        self.resumeFile = null;
        // Reset the file input
        var input = document.getElementById('resumeInput');
        if (input) input.value = '';
      }).catch(function (err) {
        self.error = (err.response && err.response.data && err.response.data.msg)
          || 'Failed to upload resume.';
      }).finally(function () {
        self.uploading = false;
      });
    },
    viewResume: function () {
      window.api.get('/student/resume', { responseType: 'blob' })
        .then(function (res) {
          var contentType = (res.headers && res.headers['content-type']) || 'application/octet-stream';
          var blob = new Blob([res.data], { type: contentType });
          var url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        })
        .catch(function () {
          window.showToast('Could not open resume.');
        });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="row justify-content-center">' +
    '    <div class="col-md-7">' +
    '      <div class="card p-4">' +
    '        <div class="d-flex justify-content-between align-items-center mb-4">' +
    '          <h4 class="fw-bold mb-0"><i class="bi bi-person-circle me-2"></i>My Profile</h4>' +
    '          <router-link to="/student/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
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
    '              <label class="form-label fw-semibold">Full Name</label>' +
    '              <input type="text" class="form-control" v-model="form.full_name" required>' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Email</label>' +
    '              <input type="email" class="form-control" :value="form.email" disabled>' +
    '              <div class="form-text">Email cannot be changed.</div>' +
    '            </div>' +
    '          </div>' +
    '          <div class="row">' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">Phone</label>' +
    '              <input type="text" class="form-control" v-model="form.phone" placeholder="10-digit number">' +
    '            </div>' +
    '            <div class="col-md-6 mb-3">' +
    '              <label class="form-label fw-semibold">CGPA</label>' +
    '              <input type="number" class="form-control" v-model="form.cgpa" step="0.01" min="0" max="10" placeholder="e.g. 8.5">' +
    '            </div>' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Education</label>' +
    '            <input type="text" class="form-control" v-model="form.education" placeholder="e.g. B.Tech CSE, IIT Madras, 2025">' +
    '          </div>' +
    '          <div class="mb-3">' +
    '            <label class="form-label fw-semibold">Skills</label>' +
    '            <input type="text" class="form-control" v-model="form.skills" placeholder="e.g. Python, Flask, SQL">' +
    '            <div class="form-text">Comma separated</div>' +
    '          </div>' +
    '' +
    '          <button type="submit" class="btn btn-dark w-100" :disabled="saving">' +
    '            <i class="bi bi-check-circle me-1"></i>{{ saving ? \'Saving…\' : \'Save Profile\' }}' +
    '          </button>' +
    '        </form>' +
    '' +
    '        <!-- Resume upload section -->' +
    '        <hr class="my-4">' +
    '        <div>' +
    '          <h6 class="fw-semibold mb-2"><i class="bi bi-file-earmark-person me-2"></i>Resume</h6>' +
    '          <div v-if="form.resume_path" class="d-flex align-items-center gap-2 mb-2">' +
    '            <i class="bi bi-file-earmark-check text-success"></i>' +
    '            <span class="small text-success">{{ form.resume_path }}</span>' +
    '            <button type="button" class="btn btn-sm btn-outline-primary" @click="viewResume">' +
    '              <i class="bi bi-eye me-1"></i>View Resume' +
    '            </button>' +
    '          </div>' +
    '          <div class="d-flex gap-2 align-items-center">' +
    '            <input id="resumeInput" type="file" class="form-control" accept=".pdf,.doc,.docx" @change="onFileChange">' +
    '            <button type="button" class="btn btn-outline-dark flex-shrink-0" :disabled="!resumeFile || uploading" @click="uploadResume">' +
    '              {{ uploading ? \'Uploading…\' : \'Upload\' }}' +
    '            </button>' +
    '          </div>' +
    '          <div class="form-text">PDF, DOC or DOCX. Max recommended: 2 MB.</div>' +
    '        </div>' +
    '' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
