/**
 * AdminLayout.js — navbar shell wrapping all /admin/* pages.
 * Defines a global `AdminLayout` component consumed by router.js.
 */
const AdminLayout = {
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
    '      <router-link class="navbar-brand" to="/admin/dashboard">' +
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
    '            <router-link class="nav-link" to="/admin/dashboard">' +
    '              <i class="bi bi-speedometer2"></i> Dashboard' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item dropdown">' +
    '            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">' +
    '              <i class="bi bi-people"></i> Manage' +
    '            </a>' +
    '            <ul class="dropdown-menu">' +
    '              <li><router-link class="dropdown-item" to="/admin/students"><i class="bi bi-person me-2"></i>Students</router-link></li>' +
    '              <li><router-link class="dropdown-item" to="/admin/companies"><i class="bi bi-building me-2"></i>Companies</router-link></li>' +
    '              <li><router-link class="dropdown-item" to="/admin/drives"><i class="bi bi-briefcase me-2"></i>Drives</router-link></li>' +
    '              <li><router-link class="dropdown-item" to="/admin/applications"><i class="bi bi-file-earmark-text me-2"></i>Applications</router-link></li>' +
    '            </ul>' +
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
