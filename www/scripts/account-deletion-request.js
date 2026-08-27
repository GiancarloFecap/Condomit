(() => {
  'use strict';
  const form = document.getElementById('deletionRequestForm');
  if (!form) return;
  const submit = document.getElementById('deletionSubmit');
  const status = document.getElementById('deletionStatus');

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `form-status ${kind}`.trim();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = String(document.getElementById('deletionEmail')?.value || '').trim().toLowerCase();
    const reason = String(document.getElementById('deletionReason')?.value || '').trim();
    const website = String(document.getElementById('companyWebsite')?.value || '').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setStatus('Informe um e-mail válido.', 'error');
      return;
    }
    submit.disabled = true;
    setStatus('Enviando solicitação...');
    try {
      const response = await fetch('/.netlify/functions/account-deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason, website })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a solicitação.');
      form.reset();
      setStatus('Solicitação recebida. A equipe de suporte fará a verificação necessária antes da exclusão.', 'success');
    } catch (error) {
      setStatus(error?.message || 'Não foi possível enviar a solicitação.', 'error');
    } finally {
      submit.disabled = false;
    }
  });
})();
