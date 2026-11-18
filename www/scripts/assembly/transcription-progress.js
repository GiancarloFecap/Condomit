(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitTranscriptionProgress = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const toSeconds = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
    const time = seconds => {
        const amount = Math.floor(toSeconds(seconds));
        const minutes = Math.floor(amount / 60);
        const hours = Math.floor(minutes / 60);
        return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}min` : `${minutes}min ${String(amount % 60).padStart(2, '0')}s`;
    };
    function measure(recording) {
        const row = recording || {};
        const status = String(row.transcription_status || 'pendente').toLowerCase();
        const total = toSeconds(row.transcription_total_seconds || row.duration_seconds);
        const cursor = toSeconds(row.transcription_cursor_seconds);
        const complete = status === 'concluido';
        const failed = status === 'falhou';
        // O callback assíncrono Deepgram só entrega o resultado no fim. Não inferir progresso pela espera.
        const known = complete || (total > 0 && cursor > 0);
        const current = complete ? total : (total > 0 ? Math.min(total, cursor) : 0);
        const percent = complete ? 100 : (known && total ? Math.min(99, Math.floor(current * 100 / total)) : null);
        return {status,total,current,percent,complete,failed,known};
    }
    function render(target, recording) {
        if (!target || typeof document === 'undefined') return;
        const value = measure(recording);
        const shell = document.createElement('div');
        shell.className = 'assembly-transcript-progress0768';
        shell.dataset.status = value.status;
        const heading = document.createElement('div');
        heading.className = 'assembly-transcript-heading0768';
        const title = document.createElement('strong');
        title.textContent = 'Transcrição do vídeo';
        const amount = document.createElement('span');
        amount.textContent = value.complete ? '100%' : value.percent === null ? 'Progresso não informado' : `${value.percent}%`;
        heading.append(title,amount);
        const bar = document.createElement('div');
        bar.className = 'assembly-transcript-bar0768';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Transcrição em relação à duração do vídeo');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        if (value.percent !== null) bar.setAttribute('aria-valuenow', String(value.percent));
        else bar.setAttribute('aria-valuetext', 'Aguardando conclusão do processamento assíncrono');
        const fill = document.createElement('span');
        fill.style.width = `${value.percent === null ? 100 : value.percent}%`;
        if (value.percent === null && !value.complete && !value.failed) fill.className = 'indeterminate0768';
        bar.append(fill);
        const label = document.createElement('small');
        if (value.complete) label.textContent = `Concluídos ${time(value.total)} de ${time(value.total)} de vídeo.`;
        else if (value.failed) label.textContent = 'Transcrição falhou. Os trechos concluídos só podem ser confirmados após reprocessamento.';
        else if (value.known) label.textContent = `Processados ${time(value.current)} de ${time(value.total)} de vídeo.`;
        else label.textContent = `Vídeo: ${value.total ? time(value.total) : 'duração indisponível'}. Deepgram processa de forma assíncrona; o percentual de cada segundo ainda não é fornecido.`;
        shell.append(heading,bar,label);
        target.replaceChildren(shell);
    }
    return {measure,render,time};
});
