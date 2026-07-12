export default {
  name: 'AdminLayout',
  template: `
    <div class="d-flex">

      <!-- Sidebar -->
      <nav class="sidebar d-flex flex-column">
        <div class="brand">
          🎓 Placement Portal
          <div class="text-muted" style="font-size:.7rem;font-weight:400;">Admin Panel</div>
        </div>
        <ul class="nav flex-column mt-2 flex-grow-1">
          <li class="nav-item" v-for="link in navLinks" :key="link.to">
            <router-link :to="link.to" class="nav-link"
                         :class="{ active: $route.path.startsWith(link.to) }">
              <i :class="link.icon"></i>{{ link.label }}
            </router-link>
          </li>
        </ul>
        <div class="p-3 border-top border-secondary">
          <small class="text-muted d-block mb-2">{{ email }}</small>
          <button @click="logout" class="btn btn-sm btn-outline-danger w-100">
            <i class="bi bi-box-arrow-right me-1"></i>Logout
          </button>
        </div>
      </nav>

      <!-- Main -->
      <div class="d-flex flex-column flex-grow-1" style="min-width:0;">
        <div class="topbar d-flex align-items-center justify-content-between">
          <h6 class="mb-0 fw-semibold">{{ pageTitle }}</h6>
          <span class="badge bg-primary">Admin</span>
        </div>
        <div class="main-content">
          <router-view></router-view>
        </div>
      </div>

    </div>
  `,
  data() {
    return {
      navLinks: [
        { to: '/admin/dashboard',    icon: 'bi bi-speedometer2 ', label: 'Dashboard'    },
        { to: '/admin/students',     icon: 'bi bi-people ',       label: 'Students'     },
        { to: '/admin/companies',    icon: 'bi bi-building ',     label: 'Companies'    },
        { to: '/admin/drives',       icon: 'bi bi-briefcase ',    label: 'Drives'       },
        { to: '/admin/applications', icon: 'bi bi-file-text ',    label: 'Applications' },
      ],
    }
  },
  computed: {
    email() {
      try { return JSON.parse(localStorage.getItem('user')).email } catch { return '' }
    },
    pageTitle() {
      const map = {
        '/admin/dashboard':    'Dashboard',
        '/admin/students':     'Students',
        '/admin/companies':    'Companies',
        '/admin/drives':       'Placement Drives',
        '/admin/applications': 'All Applications',
      }
      return map[this.$route.path] || 'Admin'
    },
  },
  methods: {
    logout() {
      localStorage.clear()
      this.$router.push('/login')
    },
  },
}
