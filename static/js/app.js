import { createApp }    from 'https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.esm-browser.js'
import { createRouter, createWebHistory }
                        from 'https://cdn.jsdelivr.net/npm/vue-router@4.3.0/dist/vue-router.esm-browser.js'

// ── Views ─────────────────────────────────────────────────────────────────────
import Login            from '/static/js/views/Login.js'

import AdminLayout      from '/static/js/views/admin/Layout.js'
import AdminDashboard   from '/static/js/views/admin/Dashboard.js'
import AdminStudents    from '/static/js/views/admin/Students.js'
import AdminCompanies   from '/static/js/views/admin/Companies.js'
import AdminDrives      from '/static/js/views/admin/Drives.js'
import AdminApplications from '/static/js/views/admin/Applications.js'

// Company + Student views — stubs until M4/M5
const ComingSoon = {
  template: `<div class="p-5 text-center text-muted">
               <i class="bi bi-tools fs-1 d-block mb-3"></i>
               <h5>Coming in next milestone</h5>
             </div>`
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',      redirect: '/login' },
    { path: '/login', component: Login   },

    // Admin — protected, role = admin
    {
      path:      '/admin',
      component: AdminLayout,
      meta:      { requiresAuth: true, role: 'admin' },
      redirect:  '/admin/dashboard',
      children: [
        { path: 'dashboard',    component: AdminDashboard    },
        { path: 'students',     component: AdminStudents     },
        { path: 'companies',    component: AdminCompanies    },
        { path: 'drives',       component: AdminDrives       },
        { path: 'applications', component: AdminApplications },
      ],
    },

    // Company — stubs (M4)
    {
      path:      '/company',
      component: ComingSoon,
      meta:      { requiresAuth: true, role: 'company' },
      redirect:  '/company/dashboard',
      children: [
        { path: 'dashboard', component: ComingSoon },
      ],
    },

    // Student — stubs (M5)
    {
      path:      '/student',
      component: ComingSoon,
      meta:      { requiresAuth: true, role: 'student' },
      redirect:  '/student/dashboard',
      children: [
        { path: 'dashboard', component: ComingSoon },
      ],
    },

    // Catch-all
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

// ── Navigation guard ──────────────────────────────────────────────────────────
router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  const role  = localStorage.getItem('role')

  // Route needs auth but no token → login
  if (to.meta.requiresAuth && !token) return '/login'

  // Route needs a specific role but user has a different one → their own dashboard
  if (to.meta.role && to.meta.role !== role) return `/${role}/dashboard`

  // Logged-in user tries to hit /login → their dashboard
  if (to.path === '/login' && token && role) return `/${role}/dashboard`

  return true
})

// ── Mount ─────────────────────────────────────────────────────────────────────
const app = createApp({template: '<router-view />'})
app.use(router)
app.mount('#app')
