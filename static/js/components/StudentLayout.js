/**
 * StudentLayout.js — navbar shell wrapping all /student/* pages.
 * Defines a global `StudentLayout` component consumed by router.js.
 */
const StudentLayout = {
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
    '      <router-link class="navbar-brand" to="/student/dashboard">' +
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
    '            <router-link class="nav-link" to="/student/dashboard">' +
    '              <i class="bi bi-speedometer2"></i> Dashboard' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/student/drives">' +
    '              <i class="bi bi-briefcase"></i> Browse Drives' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/student/applications">' +
    '              <i class="bi bi-clock-history"></i> My Applications' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/student/interviews">' +
    '              <i class="bi bi-calendar-event"></i> Interviews' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/student/placements">' +
    '              <i class="bi bi-trophy"></i> Placements' +
    '            </router-link>' +
    '          </li>' +
    '' +
    '          <li class="nav-item">' +
    '            <router-link class="nav-link" to="/student/profile">' +
    '              <i class="bi bi-person"></i> Profile' +
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
