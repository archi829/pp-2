/**
 * ErrorAlert.js — reusable dismissible Bootstrap alert-danger for failed requests.
 * Self-registers as <error-alert>. Renders nothing when `message` is empty.
 * Usage: <error-alert :message="error" @dismiss="error = ''"></error-alert>
 */
Vue.component('error-alert', {
  props: {
    message: { type: String, default: '' }
  },
  template:
    '<div v-if="message" class="alert alert-danger alert-dismissible fade show" role="alert">' +
    '  {{ message }}' +
    '  <button type="button" class="btn-close" @click="$emit(\'dismiss\')"></button>' +
    '</div>'
});
