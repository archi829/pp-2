import { api } from '/static/js/api.js'

export default {
  name: 'AdminCompanies',
  template: `
    <div>
      <!-- Filters -->
      <div class="card shadow-sm mb-4">
        <div class="card-body d-flex gap-2 flex-wrap">
          <input v-model="q" @input="debounceSearch" type="text"
                 class="form-control" style="max-width:280px"
                 placeholder="Search company or industry…" />
          <select v-model="statusFilter" @change="loadCompanies" class="form-select" style="max-width:160px">
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="card shadow-sm">
        <div class="card-header bg-white d-flex justify-content-between align-items-center">
          <span class="fw-semibold">Companies <span class="text-muted fw-normal">({{ companies.length }})</span></span>
        </div>
        <div class="card-body p-0">
          <div v-if="loading" class="p-4 text-center text-muted">Loading…</div>
          <div v-else-if="companies.length === 0" class="p-4 text-center text-muted">No companies found.</div>
          <div v-else class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead><tr>
                <th class="ps-3">#</th>
                <th>Company</th>
                <th>Industry</th>
                <th>Drives</th>
                <th>Approval</th>
                <th>Blacklist</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                <tr v-for="c in companies" :key="c.id">
                  <td class="ps-3 text-muted small">{{ c.id }}</td>
                  <td>
                    <div class="fw-semibold small">{{ c.company_name }}</div>
                    <div class="text-muted" style="font-size:.75rem;">{{ c.email }}</div>
                  </td>
                  <td class="small text-muted">{{ c.industry || '—' }}</td>
                  <td class="small">{{ c.drive_count }}</td>
                  <td>
                    <span class="badge"
                          :class="approvalBadge(c.approval_status)">
                      {{ c.approval_status }}
                    </span>
                  </td>
                  <td>
                    <span v-if="c.is_blacklisted" class="badge bg-danger">Blacklisted</span>
                    <span v-else class="text-muted small">—</span>
                  </td>
                  <td>
                    <button v-if="c.approval_status !== 'Approved'"
                            @click="approve(c)"
                            class="btn btn-sm btn-outline-success me-1" title="Approve">
                      <i class="bi bi-check-lg"></i>
                    </button>
                    <button v-if="c.approval_status !== 'Rejected'"
                            @click="reject(c)"
                            class="btn btn-sm btn-outline-danger me-1" title="Reject">
                      <i class="bi bi-x-lg"></i>
                    </button>
                    <button @click="toggleBlacklist(c)"
                            class="btn btn-sm me-1"
                            :class="c.is_blacklisted ? 'btn-outline-secondary' : 'btn-outline-warning'"
                            :title="c.is_blacklisted ? 'Unblacklist' : 'Blacklist'">
                      <i :class="c.is_blacklisted ? 'bi bi-unlock' : 'bi bi-slash-circle'"></i>
                    </button>
                    <button @click="confirmDelete(c)"
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

      <!-- Delete modal -->
      <div v-if="deleteTarget" class="modal d-block" style="background:rgba(0,0,0,.4);">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title">Delete Company</h6>
              <button @click="deleteTarget=null" class="btn-close"></button>
            </div>
            <div class="modal-body">
              Delete <strong>{{ deleteTarget.company_name }}</strong> and all its drives? This cannot be undone.
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
      companies:    [],
      loading:      true,
      q:            '',
      statusFilter: '',
      toast:        '',
      deleteTarget: null,
      _timer:       null,
    }
  },
  mounted() { this.loadCompanies() },
  methods: {
    async loadCompanies() {
      this.loading = true
      const params = new URLSearchParams()
      if (this.q)            params.set('q', this.q)
      if (this.statusFilter) params.set('status', this.statusFilter)
      const res = await api.get(`/api/admin/companies?${params}`)
      if (res) this.companies = await res.json()
      this.loading = false
    },
    debounceSearch() {
      clearTimeout(this._timer)
      this._timer = setTimeout(this.loadCompanies, 350)
    },
    approvalBadge(status) {
      return { 'bg-warning text-dark': status === 'Pending',
               'bg-success':           status === 'Approved',
               'bg-danger':            status === 'Rejected' }
    },
    async approve(c) {
      const res = await api.patch(`/api/admin/companies/${c.id}/approve`)
      if (res?.ok) { const d = await res.json(); c.approval_status = d.approval_status; this.showToast(d.msg) }
    },
    async reject(c) {
      const res = await api.patch(`/api/admin/companies/${c.id}/reject`)
      if (res?.ok) { const d = await res.json(); c.approval_status = d.approval_status; this.showToast(d.msg) }
    },
    async toggleBlacklist(c) {
      const res = await api.patch(`/api/admin/companies/${c.id}/blacklist`)
      if (res?.ok) { const d = await res.json(); c.is_blacklisted = d.is_blacklisted; this.showToast(d.msg) }
    },
    confirmDelete(c) { this.deleteTarget = c },
    async doDelete() {
      const res = await api.delete(`/api/admin/companies/${this.deleteTarget.id}`)
      if (res?.ok) {
        this.companies = this.companies.filter(c => c.id !== this.deleteTarget.id)
        this.showToast('Company deleted.')
        this.deleteTarget = null
      }
    },
    showToast(msg) { this.toast = msg; setTimeout(() => this.toast = '', 3000) },
  },
}
