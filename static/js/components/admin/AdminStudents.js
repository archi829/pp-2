/**
 * AdminStudents.js — search/blacklist/delete students, link to student detail.
 * Defines a global `AdminStudents` component consumed by router.js.
 */
const AdminStudents = {
  data: function () {
    return {
      students: [],
      q: this.$route.query.q || '',
      loading: true,
      error: ''
    };
  },
  watch: {
    '$route.query': {
      immediate: true,
      handler: function (query) {
        this.q = query.q || '';
        this.fetchStudents();
      }
    }
  },
  methods: {
    fetchStudents: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      return window.api.get('/admin/students', { params: { q: self.q } })
        .then(function (res) {
          self.students = res.data;
        })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to load students.';
        })
        .finally(function () {
          self.loading = false;
        });
    },
    submitSearch: function () {
      var query = {};
      if (this.q) query.q = this.q;
      this.$router.push({ path: '/admin/students', query: query }).catch(function () {});
    },
    clearSearch: function () {
      this.q = '';
      this.$router.push({ path: '/admin/students' }).catch(function () {});
    },
    toggleBlacklist: function (s) {
      var self = this;
      window.api.put('/admin/students/' + s.id + '/blacklist')
        .then(function () { self.fetchStudents(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to update blacklist status.';
        });
    },
    remove: function (s) {
      var self = this;
      if (!window.confirm('Delete ' + s.full_name + '?')) return;
      window.api.delete('/admin/students/' + s.id)
        .then(function () { self.fetchStudents(); })
        .catch(function (err) {
          self.error = (err.response && err.response.data && err.response.data.msg) || 'Failed to delete student.';
        });
    }
  },
  template:
    '<div class="container mt-4">' +
    '  <div class="d-flex justify-content-between align-items-center mb-3">' +
    '    <h4><i class="bi bi-people me-2"></i>Students</h4>' +
    '    <router-link to="/admin/dashboard" class="btn btn-sm btn-outline-secondary">← Dashboard</router-link>' +
    '  </div>' +
    '' +
    '  <error-alert :message="error" @dismiss="error = \'\'"></error-alert>' +
    '' +
    '  <form @submit.prevent="submitSearch" class="mb-3 d-flex gap-2">' +
    '    <input type="text" class="form-control" v-model="q" placeholder="Search by name, email, phone, or ID…">' +
    '    <button class="btn btn-dark px-4">Search</button>' +
    '    <button v-if="q" type="button" class="btn btn-outline-secondary" @click="clearSearch">Clear</button>' +
    '  </form>' +
    '' +
    '  <loading-spinner v-if="loading"></loading-spinner>' +
    '' +
    '  <div v-else class="card">' +
    '    <div class="card-body p-0">' +
    '      <div class="table-responsive" v-if="students.length">' +
    '        <table class="table table-hover mb-0">' +
    '          <thead class="table-light">' +
    '            <tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>CGPA</th><th>Status</th><th>Actions</th></tr>' +
    '          </thead>' +
    '          <tbody>' +
    '            <tr v-for="s in students" :key="s.id" :class="{ \'table-danger\': s.is_blacklisted }">' +
    '              <td class="text-muted small">{{ s.id }}</td>' +
    '              <td class="fw-semibold">' +
    '                <router-link :to="\'/admin/students/\' + s.id" class="text-decoration-none text-dark">' +
    '                  {{ s.full_name }} <i class="bi bi-box-arrow-up-right ms-1 small text-muted"></i>' +
    '                </router-link>' +
    '              </td>' +
    '              <td>{{ s.email }}</td>' +
    '              <td>{{ s.phone || \'—\' }}</td>' +
    '              <td>{{ s.cgpa || \'—\' }}</td>' +
    '              <td>' +
    '                <span v-if="s.is_blacklisted" class="badge bg-danger">Blacklisted</span>' +
    '                <span v-else class="badge bg-success">Active</span>' +
    '              </td>' +
    '              <td>' +
    '                <router-link :to="\'/admin/students/\' + s.id" class="btn btn-sm btn-outline-primary me-1">View</router-link>' +
    '                <button class="btn btn-sm" :class="s.is_blacklisted ? \'btn-success\' : \'btn-warning\'" @click="toggleBlacklist(s)">' +
    '                  {{ s.is_blacklisted ? \'Unblacklist\' : \'Blacklist\' }}' +
    '                </button>' +
    '                <button class="btn btn-sm btn-outline-danger ms-1" @click="remove(s)">Delete</button>' +
    '              </td>' +
    '            </tr>' +
    '          </tbody>' +
    '        </table>' +
    '      </div>' +
    '      <p v-else class="text-muted p-3 mb-0">No students found{{ q ? \' for "\' + q + \'"\' : \'\' }}.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>'
};
