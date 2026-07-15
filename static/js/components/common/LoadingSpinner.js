/**
 * LoadingSpinner.js — reusable "GET in flight" indicator.
 * Self-registers as <loading-spinner> so no per-component `components: {...}` wiring
 * is needed. Must load before any component whose template uses <loading-spinner>.
 */
Vue.component('loading-spinner', {
  props: {
    label: { type: String, default: 'Loading…' }
  },
  template:
    '<div class="text-center py-5">' +
    '  <div class="spinner-border text-dark" role="status">' +
    '    <span class="visually-hidden">{{ label }}</span>' +
    '  </div>' +
    '</div>'
});
