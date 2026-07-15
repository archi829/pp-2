/**
 * router.js — vue-router 3 routes + auth navigation guard.
 * Loads after Login.js / AdminLayout.js / AdminDashboard.js, before app.js.
 */
const ComingSoon = {
  template:
    '<div class="container mt-4">' +
    '  <p class="text-muted"><i class="bi bi-cone-striped me-2"></i>Coming soon.</p>' +
    '</div>'
};

const routes = [
  { path: '/login', component: Login },

  {
    path: '/admin',
    component: AdminLayout,
    meta: { role: 'admin' },
    redirect: '/admin/dashboard',
    children: [
      { path: 'dashboard', component: AdminDashboard },
      { path: 'companies', component: ComingSoon },
      { path: 'students', component: ComingSoon },
      { path: 'students/:id', component: ComingSoon },
      { path: 'drives', component: ComingSoon },
      { path: 'applications', component: ComingSoon }
    ]
  },

  { path: '/', redirect: '/login' },
  { path: '*', redirect: '/login' }
];

const router = new VueRouter({
  mode: 'history',
  routes: routes
});

function dashboardPathForRole(role) {
  return {
    admin: '/admin/dashboard',
    company: '/company/dashboard',
    student: '/student/dashboard'
  }[role] || '/login';
}

router.beforeEach(function (to, from, next) {
  var token = window.auth.getToken();
  var role = window.auth.getRole();

  // Route requires a specific role → must be logged in as that role.
  if (to.meta && to.meta.role) {
    if (!token || role !== to.meta.role) {
      return next('/login');
    }
  }

  // Already logged in and hitting /login or / → bounce to the right dashboard.
  if ((to.path === '/login' || to.path === '/') && token && role) {
    return next(dashboardPathForRole(role));
  }

  next();
});

window.router = router;
