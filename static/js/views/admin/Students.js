import { api } from '/static/js/api.js'

export default {
  name: 'AdminStudents',
  template: `
    <div>
      <!-- Search bar -->
      <div class="card shadow-sm mb-4">
        <div class="card-body d-flex gap-2">
          <input v-model="q" @input="debounceSearch" type="text"
                 class="form-control" placeholder="Search by name, email or phone…" />
          <button @click="loadStudents" class="btn btn-primary px-4">
            <i class="bi bi-search"></i>
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="card shadow-sm">
        <div class="card-header bg-white d-flex justify-content-between align-items-center">
          <span class="fw-semibold">Students <span class="text-muted fw-normal">({{ students.length }})</span></span>
        </div>
        <div class="card-body p-0">
          <div v-if="loading" class="p-4 text-center text-muted">Loading…</div>
          <div v-else-if="students.length === 0" class="p-4 text-center text-muted">No students found.</div>
          <div v-else class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead><tr>
                <th class="ps-3">#</th>
                <th>Name</th>
                <th>Email</th>
                <th>CGPA</th>
                <th>Apps</th>
                <th>Status</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                <tr v-for="s in students" :key="s.id">
                  <td class="ps-3 text-muted small">{{ s.id }}</td>
                  <td>
                    <div class="fw-semibold small">{{ s.full_name }}</div>
                    <div class="text-muted" style="font-size:.75rem;">{{ s.phone || '—' }}</div>
                  </td>
                  <td class="small">{{ s.email }}</td>
                  <td class="small">{{ s.cgpa ?? '—' }}</td>
                  <td class="small">{{ s.application_count }}</td>
                  <td>
                    <span v-if="s.is_blacklisted" class="badge bg-danger">Blacklisted</span>
                    <span v-else-if="!s.is_active"  class="badge bg-secondary">Inactive</span>
                    <span v-else                     class="badge bg-success">Active</span>
                  </td>
                  <td>
                    <button @click="toggleBlacklist(s)"
                            class="btn btn-sm me-1"
                            :class="s.is_blacklisted ? 'btn-outline-success' : 'btn-outline-warning'"
                            :title="s.is_blacklisted ? 'Unblacklist' : 'Blacklist'">
                      <i :class="s.is_blacklisted ? 'bi bi-unlock' : 'bi bi-slash-circle'"></i>
                    </button>
                    <a v-if="s.resume_path"
                       :href="'/api/admin/students/' + s.id + '/resume'"
                       target="_blank"
                       class="btn btn-sm btn-outline-secondary me-1" title="View resume">
                      <i class="bi bi-file-earmark-pdf"></i>
                    </a>
                    <button @click="confirmDelete(s)"
                            class="btn btn-sm btn-outline-danger" title="Delete">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Delete confirm modal -->
      <div v-if="deleteTarget" class="modal d-block" style="background:rgba(0,0,0,.4);">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title">Delete Student</h6>
              <button @click="deleteTarget=null" class="btn-close"></button>
            </div>
            <div class="modal-body">
              Delete <strong>{{ deleteTarget.full_name }}</strong>? This cannot be undone.
            </div>
            <div class="modal-footer">
              <button @click="deleteTarget=null" class="btn btn-secondary btn-sm">Cancel</button>
              <button @click="doDelete" class="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div v-if="toast" class="position-fixed bottom-0 end-0 p-3" style="z-index:1100">
        <div class="toast show align-items-center text-bg-success border-0">
          <div class="d-flex">
            <div class="toast-body">{{ toast }}</div>
            <button @click="toast=''" class="btn-close btn-close-white me-2 m-auto"></button>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      students:     [],
      loading:      true,
      q:            '',
      toast:        '',
      deleteTarget: null,
      _timer:       null,
    }
  },
  mounted() { this.loadStudents() },
  methods: {
    async loadStudents() {
      this.loading = true
      const res = await api.get(`/api/admin/students?q=${encodeURIComponent(this.q)}`)
      if (res) this.students = await res.json()
      this.loading = false
    },
    debounceSearch() {
      clearTimeout(this._timer)
      this._timer = setTimeout(this.loadStudents, 350)
    },
    async toggleBlacklist(s) {
      const res = await api.patch(`/api/admin/students/${s.id}/blacklist`)
      if (res?.ok) {
        const data = await res.json()
        s.is_blacklisted = data.is_blacklisted
        this.showToast(data.msg)
      }
    },
    confirmDelete(s) { this.deleteTarget = s },
    async doDelete() {
      const res = await api.delete(`/api/admin/students/${this.deleteTarget.id}`)
      if (res?.ok) {
        this.students = this.students.filter(s => s.id !== this.deleteTarget.id)
        this.showToast('Student deleted.')
        this.deleteTarget = null
      }
    },
    showToast(msg) {
      this.toast = msg
      setTimeout(() => this.toast = '', 3000)
    },
  },
}
