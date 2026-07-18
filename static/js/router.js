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
  { path: '/register', component: Register },

  {
    path: '/admin',
    component: AdminLayout,
    meta: { role: 'admin' },
    redirect: '/admin/dashboard',
    children: [
      { path: 'dashboard', component: AdminDashboard },
      { path: 'companies', component: AdminCompanies },
      { path: 'students', component: AdminStudents },
      { path: 'students/:id', component: AdminStudentDetail },
      { path: 'drives', component: AdminDrives },
      { path: 'applications', component: AdminApplications }
    ]
  },

  {
    path: '/company',
    component: CompanyLayout,
    meta: { role: 'company' },
    redirect: '/company/dashboard',
    children: [
      { path: 'dashboard', component: CompanyDashboard },
      { path: 'profile', component: CompanyProfile },
      { path: 'drives/new', component: CompanyDrives },
      { path: 'drives/:id/edit', component: CompanyDrives },
      { path: 'drives/:id/applications', component: DriveApplicants },
      { path: 'student/:id', component: CompanyStudentProfile },
      { path: 'interviews', component: CompanyInterviews }
    ]
  },

  // Placeholder until Milestone 5 (student) builds this out. MUST exist as a real
  // route — without it, a student login or a student's auto-login-after-registration
  // pushes to a path that only matches the catch-all '*' redirect to /login, which
  // the guard below immediately bounces back to this same dashboard path, producing
  // an infinite redirect loop.
  { path: '/student/dashboard', component: ComingSoon, meta: { role: 'student' } },

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

  // Already logged in and hitting /login, /register, or / → bounce to the right dashboard.
  if ((to.path === '/login' || to.path === '/register' || to.path === '/') && token && role) {
    return next(dashboardPathForRole(role));
  }

  next();
});

window.router = router;