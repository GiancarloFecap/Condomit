(function () {
  function formatDateBR(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDateTime(date) {
    return `${formatDateBR(date)} ${formatTime(date)}`;
  }

  function getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function debounce(fn, wait) {
    let timeoutId = null;
    return function debounced(...args) {
      const context = this;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        fn.apply(context, args);
      }, wait);
    };
  }

  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      borderRadius: '8px',
      color: '#fff',
      fontWeight: '500',
      zIndex: '99999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transform: 'translateX(120%)',
      transition: 'transform 0.3s ease',
      backgroundColor: type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
    return toast;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }

  function getQueryParam(name, url) {
    const params = new URLSearchParams(url ? new URL(url).search : window.location.search);
    return params.get(name);
  }

  function setQueryParam(name, value, url) {
    const targetUrl = url ? new URL(url) : new URL(window.location.href);
    if (value == null || value === '') {
      targetUrl.searchParams.delete(name);
    } else {
      targetUrl.searchParams.set(name, value);
    }
    if (!url) {
      window.history.replaceState({}, '', targetUrl.toString());
    }
    return targetUrl.toString();
  }

  function parseCep(cep) {
    if (!cep) return null;
    const digits = String(cep).replace(/\D/g, '');
    if (digits.length !== 8) return null;
    return `${digits.substring(0, 5)}-${digits.substring(5)}`;
  }

  function sanitizeMessage(message) {
    if (!message) return '';
    let sanitized = escapeHtml(String(message));
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    return sanitized.substring(0, 2000);
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      textarea.remove();
      return success;
    } catch (e) {
      return false;
    }
  }

  function classNames() {
    const classes = [];
    for (let i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (!arg) continue;
      const type = typeof arg;
      if (type === 'string' || type === 'number') {
        classes.push(arg);
      } else if (Array.isArray(arg)) {
        const inner = classNames.apply(null, arg);
        if (inner) classes.push(inner);
      } else if (type === 'object') {
        for (const key in arg) {
          if (Object.prototype.hasOwnProperty.call(arg, key) && arg[key]) {
            classes.push(key);
          }
        }
      }
    }
    return classes.join(' ');
  }

  window.AssemblyUtils = {
    formatDateBR,
    formatTime,
    formatDateTime,
    getInitials,
    escapeHtml,
    formatDuration,
    debounce,
    showToast,
    generateId,
    getQueryParam,
    setQueryParam,
    parseCep,
    sanitizeMessage,
    copyToClipboard,
    classNames
  };
})();
