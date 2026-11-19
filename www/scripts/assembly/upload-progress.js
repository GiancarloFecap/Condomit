(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitUploadProgress = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    function view(record) {
        const details = record?.verification?.upload_progress || record?.upload_progress || null;
        if (details) return {
            stage: String(details.stage || 'processando'),
            label: String(details.label || 'Processando gravação...'),
            percent: Number.isFinite(details.percent) ? Math.max(0, Math.min(100, details.percent)) : null,
            uploadedBytes: Number.isFinite(details.uploaded_bytes) ? details.uploaded_bytes : null,
            totalBytes: Number.isFinite(details.total_bytes) ? details.total_bytes : null
        };
        const status = String(record?.status || '').toLowerCase();
        if (status === 'concluido') return {stage: 'concluido', label: 'Vídeo salvo e confirmado no servidor.', percent: 100};
        if (status === 'falhou') return {stage: 'falhou', label: 'Falha no envio do MP4. A gravação não foi confirmada.', percent: null};
        if (status === 'gravando') return {stage: 'gravando', label: 'Gravação ativa. O envio será confirmado após a finalização.', percent: null};
        if (status === 'pendente') return {stage: 'preparando', label: 'Preparando a gravação...', percent: null};
        return {stage: 'aguardando', label: 'Aguardando informações do vídeo...', percent: null};
    }
    function formatBytes(value) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return '';
        return n < 1024*1024 ? `${(n/1024).toFixed(0)} KB` : `${(n/(1024*1024)).toFixed(1)} MB`;
    }
    function render(container, record) {
        if (!container) return;
        const data = view(record);
        container.classList.add('assembly-upload-progress');
        container.classList.toggle('assembly-upload-progress-error', data.stage === 'falhou');
        container.classList.toggle('assembly-upload-progress-done', data.stage === 'concluido');
        let label = container.querySelector('.assembly-upload-label');
        let bar = container.querySelector('.assembly-upload-track');
        let fill = container.querySelector('.assembly-upload-fill');
        let detail = container.querySelector('.assembly-upload-detail');
        if (!bar || !fill || !label || !detail) {
            container.replaceChildren();
            label = document.createElement('div'); label.className = 'assembly-upload-label';
            bar = document.createElement('div'); bar.className = 'assembly-upload-track';
            fill = document.createElement('div'); fill.className = 'assembly-upload-fill';
            bar.append(fill);
            detail = document.createElement('small'); detail.className = 'assembly-upload-detail';
            container.append(label, bar, detail);
        }
        label.textContent = data.label;
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Envio do vídeo para o servidor');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        if (data.percent === null) {
            bar.removeAttribute('aria-valuenow');
            fill.style.width = '';
            bar.classList.toggle('assembly-upload-indeterminate', data.stage !== 'falhou');
            detail.textContent = data.stage === 'falhou'
                ? 'Envio interrompido. Consulte o diagnóstico; não é seguro finalizar a assembleia.'
                : '';
        } else {
            bar.classList.remove('assembly-upload-indeterminate');
            bar.setAttribute('aria-valuenow', String(data.percent));
            fill.style.width = `${data.percent}%`;
            const bytes = data.uploadedBytes !== null && data.totalBytes !== null && data.totalBytes > 0
                ? ` · ${formatBytes(data.uploadedBytes)} de ${formatBytes(data.totalBytes)}` : '';
            detail.textContent = `${data.percent.toFixed(0)}%${bytes}${data.stage === 'concluido' ? ' · MP4 confirmado' : ' · porcentagem real da recuperação'}`;
        }
        return data;
    }
    return {view, render};
});
