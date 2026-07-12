import { api } from '/static/js/api.js'

export default {
  name: 'AdminDrives',
  template: `
    <div>
      <!-- Filters -->
      <div class="card shadow-sm mb-4">
        <div class="card-body d-flex gap-2 flex-wrap">
          <select v-model="statusFilter" @change="loadDrives" class="form-select" style="max-width:160px">
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="card shadow-sm">
        <div class="card-header bg-white d-flex justify-content-between align-items-center">
          <span class="fw-semibold">Placement Drives <span class="text-muted fw-normal">({{ drives.length }})</span></span>
        </div>
        <div class="card-body p-0">
          <div v-if="loading" class="p-4 text-center text-muted">Loading…</div>
          <div v-else-if="drives.length === 0" class="p-4 text-center text-muted">No drives found.</div>
          <div v-else class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead><tr>
                <th class="ps-3">#</th>
                <th>Job Title</th>
                <th>Company</th>
                <th>Deadline</th>
                <th>Apps</th>
                <th>Status</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                <tr v-for="d in drives" :key="d.id">
                  <td class="ps-3 text-muted small">{{ d.id }}</td>
                  <td>
                    <div class="fw-semibold small">{{ d.job_title }}</div>
                    <div class="text-muted" style="font-size:.75rem;">{{ d.location || '—' }}</div>
                  </td>
                  <td class="small text-muted">{{ d.company_name }}</td>
                  <td class="small">{{ formatDate(d.application_deadline) }}</td>
                  <td class="small">{{ d.application_count }}</td>
                  <td>
                    <span class="badge" :class="statusBadge(d.status)">{{ d.status }}</span>
                  </td>
                  <td>
                    <button v-if="d.status === 'Pending' || d.status === 'Rejected'"
                            @click="approve(d)"
                            class="btn btn-sm btn-outline-success me-1" title="Approve">
                      <i class="bi bi-check-lg"></i>
                    </button>
                    <button v-if="d.status === 'Pending' || d.status === 'Approved'"
                            @click="reject(d)"
                            class="btn btn-sm btn-outline-danger" title="Reject">
                      <i class="bi bi-x-lg"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
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
      drives:       [],
      loading:      true,
      statusFilter: '',
      toast:        '',
    }
  },
  mounted() { this.loadDrives() },
  methods: {
    async loadDrives() {
      this.loading = true
      const params = new URLSearchParams()
      if (this.statusFilter) params.set('status', this.statusFilter)
      const res = await api.get(`/api/admin/drives?${params}`)
      if (res) this.drives = await res.json()
      this.loading = false
    },
    statusBadge(s) {
      return {
        'bg-warning text-dark': s === 'Pending',
        'bg-success':           s === 'Approved',
        'bg-danger':            s === 'Rejected',
        'bg-secondary':         s === 'Closed',
      }
    },
    formatDate(d) {
      if (!d) return '—'
      return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    },
    async approve(d) {
      const res = await api.patch(`/api/admin/drives/${d.id}/approve`)
      if (res?.ok) { const j = await res.json(); d.status = j.status; this.showToast(j.msg) }
    },
    async reject(d) {
      const res = await api.patch(`/api/admin/drives/${d.id}/reject`)
      if (res?.ok) { const j = await res.json(); d.status = j.status; this.showToast(j.msg) }
    },
    showToast(msg) { this.toast = msg; setTimeout(() => this.toast = '', 3000) },
  },
}
