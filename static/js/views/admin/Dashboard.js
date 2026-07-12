import { api } from '/static/js/api.js'

export default {
  name: 'AdminDashboard',
  template: `
    <div>
      <!-- Stat cards -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-4 col-lg-2" v-for="card in statCards" :key="card.label">
          <div class="card stat-card shadow-sm h-100">
            <div class="card-body d-flex align-items-center gap-3">
              <div class="icon-box" :style="{ background: card.bg }">
                <i :class="card.icon" :style="{ color: card.color }"></i>
              </div>
              <div>
                <div class="fw-bold fs-5">{{ stats ? stats[card.key] : '…' }}</div>
                <div class="text-muted" style="font-size:.75rem;">{{ card.label }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <!-- Pending Companies -->
        <div class="col-lg-6">
          <div class="card shadow-sm h-100">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
              <span class="fw-semibold">Pending Companies</span>
              <span class="badge bg-warning text-dark">{{ pendingCompanies.length }}</span>
            </div>
            <div class="card-body p-0">
              <div v-if="loadingCompanies" class="p-4 text-center text-muted">Loading…</div>
              <div v-else-if="pendingCompanies.length === 0" class="p-4 text-center text-muted">
                <i class="bi bi-check-circle text-success fs-4 d-block mb-1"></i>
                All companies reviewed
              </div>
              <table v-else class="table table-hover mb-0">
                <thead><tr>
                  <th class="ps-3">Company</th><th>Industry</th><th>Action</th>
                </tr></thead>
                <tbody>
                  <tr v-for="c in pendingCompanies" :key="c.id">
                    <td class="ps-3">
                      <div class="fw-semibold small">{{ c.company_name }}</div>
                      <div class="text-muted" style="font-size:.75rem;">{{ c.email }}</div>
                    </td>
                    <td class="small text-muted align-middle">{{ c.industry || '—' }}</td>
                    <td class="align-middle">
                      <button @click="approveCompany(c)" class="btn btn-xs btn-success me-1"
                              style="font-size:.75rem;padding:2px 8px;">Approve</button>
                      <button @click="rejectCompany(c)"  class="btn btn-xs btn-danger"
                              style="font-size:.75rem;padding:2px 8px;">Reject</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="card-footer bg-white">
              <router-link to="/admin/companies" class="btn btn-sm btn-outline-secondary w-100">
                View all companies
              </router-link>
            </div>
          </div>
        </div>

        <!-- Pending Drives -->
        <div class="col-lg-6">
          <div class="card shadow-sm h-100">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
              <span class="fw-semibold">Pending Drives</span>
              <span class="badge bg-warning text-dark">{{ pendingDrives.length }}</span>
            </div>
            <div class="card-body p-0">
              <div v-if="loadingDrives" class="p-4 text-center text-muted">Loading…</div>
              <div v-else-if="pendingDrives.length === 0" class="p-4 text-center text-muted">
                <i class="bi bi-check-circle text-success fs-4 d-block mb-1"></i>
                All drives reviewed
              </div>
              <table v-else class="table table-hover mb-0">
                <thead><tr>
                  <th class="ps-3">Drive</th><th>Company</th><th>Action</th>
                </tr></thead>
                <tbody>
                  <tr v-for="d in pendingDrives" :key="d.id">
                    <td class="ps-3">
                      <div class="fw-semibold small">{{ d.job_title }}</div>
                      <div class="text-muted" style="font-size:.75rem;">{{ d.location || '—' }}</div>
                    </td>
                    <td class="small text-muted align-middle">{{ d.company_name }}</td>
                    <td class="align-middle">
                      <button @click="approveDrive(d)" class="btn btn-xs btn-success me-1"
                              style="font-size:.75rem;padding:2px 8px;">Approve</button>
                      <button @click="rejectDrive(d)"  class="btn btn-xs btn-danger"
                              style="font-size:.75rem;padding:2px 8px;">Reject</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="card-footer bg-white">
              <router-link to="/admin/drives" class="btn btn-sm btn-outline-secondary w-100">
                View all drives
              </router-link>
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
      stats:            null,
      pendingCompanies: [],
      pendingDrives:    [],
      loadingCompanies: true,
      loadingDrives:    true,
      toast:            '',
      statCards: [
        { key: 'total_students',     label: 'Students',     icon: 'bi bi-people-fill',      bg: '#eff6ff', color: '#3b82f6' },
        { key: 'total_companies',    label: 'Companies',    icon: 'bi bi-building-fill',     bg: '#f0fdf4', color: '#22c55e' },
        { key: 'total_drives',       label: 'Drives',       icon: 'bi bi-briefcase-fill',    bg: '#fdf4ff', color: '#a855f7' },
        { key: 'total_applications', label: 'Applications', icon: 'bi bi-file-earmark-text', bg: '#fff7ed', color: '#f97316' },
        { key: 'pending_companies',  label: 'Pending Cos',  icon: 'bi bi-hourglass-split',   bg: '#fefce8', color: '#eab308' },
        { key: 'pending_drives',     label: 'Pending Drives',icon:'bi bi-hourglass-split',   bg: '#fef2f2', color: '#ef4444' },
      ],
    }
  },
  async mounted() {
    await Promise.all([this.loadStats(), this.loadPendingCompanies(), this.loadPendingDrives()])
  },
  methods: {
    async loadStats() {
      const res = await api.get('/api/admin/stats')
      if (res) this.stats = await res.json()
    },
    async loadPendingCompanies() {
      this.loadingCompanies = true
      const res = await api.get('/api/admin/companies?status=Pending')
      if (res) this.pendingCompanies = await res.json()
      this.loadingCompanies = false
    },
    async loadPendingDrives() {
      this.loadingDrives = true
      const res = await api.get('/api/admin/drives?status=Pending')
      if (res) this.pendingDrives = await res.json()
      this.loadingDrives = false
    },
    async approveCompany(c) {
      const res = await api.patch(`/api/admin/companies/${c.id}/approve`)
      if (res?.ok) {
        this.showToast(`${c.company_name} approved`)
        this.pendingCompanies = this.pendingCompanies.filter(x => x.id !== c.id)
        this.stats.pending_companies--
      }
    },
    async rejectCompany(c) {
      const res = await api.patch(`/api/admin/companies/${c.id}/reject`)
      if (res?.ok) {
        this.showToast(`${c.company_name} rejected`)
        this.pendingCompanies = this.pendingCompanies.filter(x => x.id !== c.id)
        this.stats.pending_companies--
      }
    },
    async approveDrive(d) {
      const res = await api.patch(`/api/admin/drives/${d.id}/approve`)
      if (res?.ok) {
        this.showToast(`"${d.job_title}" approved`)
        this.pendingDrives = this.pendingDrives.filter(x => x.id !== d.id)
        this.stats.pending_drives--
      }
    },
    async rejectDrive(d) {
      const res = await api.patch(`/api/admin/drives/${d.id}/reject`)
      if (res?.ok) {
        this.showToast(`"${d.job_title}" rejected`)
        this.pendingDrives = this.pendingDrives.filter(x => x.id !== d.id)
        this.stats.pending_drives--
      }
    },
    showToast(msg) {
      this.toast = msg
      setTimeout(() => this.toast = '', 3000)
    },
  },
}
