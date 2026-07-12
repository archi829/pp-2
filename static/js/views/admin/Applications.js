import { api } from '/static/js/api.js'

export default {
  name: 'AdminApplications',
  template: `
    <div>
      <!-- Filter bar -->
      <div class="card shadow-sm mb-4">
        <div class="card-body d-flex gap-2 flex-wrap align-items-center">
          <input v-model="q" @input="filterApps" type="text"
                 class="form-control" style="max-width:260px"
                 placeholder="Search student or company…" />
          <select v-model="statusFilter" @change="filterApps" class="form-select" style="max-width:180px">
            <option value="">All statuses</option>
            <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
          </select>
          <span class="text-muted small ms-auto">{{ filtered.length }} of {{ apps.length }}</span>
        </div>
      </div>

      <!-- Table -->
      <div class="card shadow-sm">
        <div class="card-body p-0">
          <div v-if="loading" class="p-4 text-center text-muted">Loading…</div>
          <div v-else-if="filtered.length === 0" class="p-4 text-center text-muted">No applications found.</div>
          <div v-else class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead><tr>
                <th class="ps-3">#</th>
                <th>Student</th>
                <th>Drive</th>
                <th>Company</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Offer</th>
              </tr></thead>
              <tbody>
                <tr v-for="a in filtered" :key="a.id">
                  <td class="ps-3 text-muted small">{{ a.id }}</td>
                  <td>
                    <div class="fw-semibold small">{{ a.student_name }}</div>
                    <div class="text-muted" style="font-size:.75rem;">{{ a.student_email }}</div>
                  </td>
                  <td class="small">{{ a.job_title }}</td>
                  <td class="small text-muted">{{ a.company_name }}</td>
                  <td class="small text-muted">{{ formatDate(a.applied_at) }}</td>
                  <td>
                    <span class="badge" :class="statusBadge(a.status)">{{ a.status }}</span>
                  </td>
                  <td>
                    <span v-if="a.offer_status && a.offer_status !== 'Pending'"
                          class="badge"
                          :class="a.offer_status === 'Accepted' ? 'bg-success' : 'bg-secondary'">
                      {{ a.offer_status }}
                    </span>
                    <span v-else class="text-muted small">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      apps:         [],
      filtered:     [],
      loading:      true,
      q:            '',
      statusFilter: '',
      statuses:     ['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Placed'],
    }
  },
  async mounted() {
    const res = await api.get('/api/admin/applications')
    if (res) { this.apps = await res.json(); this.filtered = this.apps }
    this.loading = false
  },
  methods: {
    filterApps() {
      const q  = this.q.toLowerCase()
      const st = this.statusFilter
      this.filtered = this.apps.filter(a => {
        const matchQ  = !q || a.student_name?.toLowerCase().includes(q)
                            || a.company_name?.toLowerCase().includes(q)
                            || a.job_title?.toLowerCase().includes(q)
        const matchSt = !st || a.status === st
        return matchQ && matchSt
      })
    },
    statusBadge(s) {
      return {
        'bg-secondary':         s === 'Applied',
        'bg-primary':           s === 'Shortlisted',
        'bg-info text-dark':    s === 'Interview Scheduled',
        'bg-success':           s === 'Selected',
        'bg-danger':            s === 'Rejected',
        'bg-dark':              s === 'Placed',
      }
    },
    formatDate(d) {
      if (!d) return '—'
      return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    },
  },
}
