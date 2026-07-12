import { api } from '/static/js/api.js'

export default {
  name: 'Login',
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div class="card shadow-sm" style="width: 420px; border-radius: 14px; border: none;">
        <div class="card-body p-5">

          <div class="text-center mb-4">
            <div class="mb-2" style="font-size:2.2rem;">🎓</div>
            <h4 class="fw-bold mb-0">Placement Portal</h4>
            <p class="text-muted small mt-1">Sign in to continue</p>
          </div>

          <div class="mb-3">
            <label class="form-label fw-semibold small">Role</label>
            <div class="d-flex gap-2">
              <button v-for="r in roles" :key="r.value"
                      @click="form.role = r.value"
                      class="btn btn-sm flex-fill"
                      :class="form.role === r.value ? 'btn-primary' : 'btn-outline-secondary'">
                {{ r.label }}
              </button>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label fw-semibold small">Email</label>
            <input v-model="form.email" type="email" class="form-control"
                   placeholder="you@example.com" @keyup.enter="submit" />
          </div>

          <div class="mb-4">
            <label class="form-label fw-semibold small">Password</label>
            <input v-model="form.password" type="password" class="form-control"
                   placeholder="••••••••" @keyup.enter="submit" />
          </div>

          <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>

          <button @click="submit" class="btn btn-primary w-100"
                  :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            Sign In
          </button>

          <hr class="my-4" />

          <p class="text-center small text-muted mb-0">
            New company?
            <router-link to="/register/company">Register here</router-link>
            &nbsp;·&nbsp;
            New student?
            <router-link to="/register/student">Register here</router-link>
          </p>

        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form:    { email: '', password: '', role: 'student' },
      roles:   [
        { value: 'student', label: 'Student' },
        { value: 'company', label: 'Company' },
        { value: 'admin',   label: 'Admin'   },
      ],
      loading: false,
      error:   '',
    }
  },
  mounted() {
    // Already logged in → go straight to dashboard
    const token = localStorage.getItem('token')
    const role  = localStorage.getItem('role')
    if (token && role) this.$router.replace(`/${role}/dashboard`)
  },
  methods: {
    async submit() {
      this.error = ''
      if (!this.form.email || !this.form.password) {
        this.error = 'Email and password are required.'
        return
      }
      this.loading = true
      try {
        const res  = await api.post('/api/auth/login', this.form)
        const data = await res.json()
        if (!res.ok) {
          this.error = data.msg || 'Login failed.'
          return
        }
        localStorage.setItem('token', data.access_token)
        localStorage.setItem('role',  data.role)
        localStorage.setItem('user',  JSON.stringify({ id: data.user_id, email: data.email }))
        this.$router.push(`/${data.role}/dashboard`)
      } catch {
        this.error = 'Network error. Is the server running?'
      } finally {
        this.loading = false
      }
    },
  },
}
