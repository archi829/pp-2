/**
 * CompanyLayout.js — navbar shell wrapping all /company/* pages.
 * Defines a global `CompanyLayout` component consumed by router.js.
 */
const CompanyLayout = {
  methods: {
    logout: function () {
      window.auth.logout();
      this.$router.push('/login');
    }
  },
  template:
    '<div>' +
    '  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">' +
    '    <div class="container">' +
    '      <router-link class="navbar-brand" to="/company/dashboard">' +
    '        <i class="bi bi-mortarboard-fill me-2"></i>PlacementPortal' +
    '      </router-link>' +
    '      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">' +
    '        <span class="navbar-toggler-icon"></span>' +
    '      </button>' +
    '' +
    '      <div class="collapse navbar-collapse" id="navbarNav">' +
    '        <ul class="navbar-nav ms-auto align-items-lg-center">' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/company/dashboard">' +
    '              <i class="bi bi-speedometer2"></i> Dashboard' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/company/drives/new">' +
    '              <i class="bi bi-plus-circle"></i> Post Drive' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/company/interviews">' +
    '              <i class="bi bi-calendar-event"></i> Interviews' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/company/notifications">' +
    '              <i class="bi bi-bell"></i> Notifications' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/company/profile">' +
    '              <i class="bi bi-building"></i> Profile' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item ms-2">' +
    '            <button class="btn btn-outline-danger btn-sm" @click="logout">' +
    '              <i class="bi bi-box-arrow-right"></i> Logout' +
    '            </button>' +
    '          </li>' +
    '' +
    '        </ul>' +
    '      </div>' +
    '    </div>' +
    '  </nav>' +
    '' +
    '  <router-view></router-view>' +
    '</div>'
};