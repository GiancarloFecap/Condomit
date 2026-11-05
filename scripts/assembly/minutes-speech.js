(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitMinutesSpeech = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function clean(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function speakerIndex(row) {
        const marker = clean(row?.participant_identity).match(/^__deepgram_speaker__:(\d{1,4})$/);
        if (marker) return Number(marker[1]);
        const legacy = clean(row?.participant_name).match(/^Falante ([1-9]\d{0,4})$/i);
        return legacy ? Number(legacy[1]) - 1 : null;
    }

    function joinText(previous, next) {
        let first = clean(previous);
        let second = clean(next);
        if (!first) return second;
        if (!second) return first;
        const incomplete = /(?:\b(?:e|ou|mas|que|para|de|do|da|dos|das|em|na|no|nos|nas|sobre|com|sem|enquanto|quando|porque|se|por|como|foi|são|o|a|os|as|um|uma|uns|umas))\s*[,.!?;:]?$/i.test(first);
        if (incomplete) {
            first = first.replace(/[,.!?;:]+$/g, '');
            second = second.charAt(0).toLocaleLowerCase('pt-BR') + second.slice(1);
        }
        const previousWord = first.match(/([\p{L}\p{N}]+)[.,!?;:]*$/u)?.[1]?.toLocaleLowerCase('pt-BR');
        const nextWord = second.match(/^[\p{L}\p{N}]+/u)?.[0]?.toLocaleLowerCase('pt-BR');
        if (previousWord && previousWord === nextWord && !/[.!?]$/.test(first)) {
            second = second.replace(/^[\p{L}\p{N}]+\s*/u, '');
        }
        if (!second) return first;
        const separator = /^[,.;:!?]/.test(second) ? '' : ' ';
        return first + separator + second;
    }

    function recognizedName(row) {
        const email = clean(row?.participant_email);
        const name = clean(row?.participant_name);
        if (!email || /@condomit\.invalid$/i.test(email)) return '';
        if (!name || /^Falante(?:\s|$)/i.test(name) || /^Participante não identificado/i.test(name)) return '';
        return name;
    }

    function groupRows(rows, options) {
        const settings = options || {};
        const maxGap = settings.maxGapSeconds == null ? 12 : Number(settings.maxGapSeconds);
        const maxChars = settings.maxChars == null ? 2500 : Number(settings.maxChars);
        const maxDuration = settings.maxDurationSeconds == null ? 180 : Number(settings.maxDurationSeconds);
        const ordered = (Array.isArray(rows) ? rows : []).filter(row => clean(row?.transcript))
            .slice().sort((a, b) => {
                const diff = new Date(a.spoken_at || a.created_at || 0) - new Date(b.spoken_at || b.created_at || 0);
                return diff || Number(a.start_seconds || 0) - Number(b.start_seconds || 0);
            });
        const output = [];
        let current = null;
        for (const row of ordered) {
            const index = speakerIndex(row);
            const recordingId = String(row.recording_id || '');
            const start = Number(row.start_seconds);
            const end = Number(row.end_seconds);
            const startAt = new Date(row.spoken_at || row.created_at || 0).getTime();
            const reliableName = recognizedName(row);
            const sameVoice = current && current.recordingId === recordingId && current.speakerIndex === index;
            const gap = Number.isFinite(start) && Number.isFinite(current?.end_seconds)
                ? start - current.end_seconds
                : (startAt - (current?.endAtMs || startAt)) / 1000;
            const tooLong = current && (
                current.text.length + clean(row.transcript).length > maxChars
                || (Number.isFinite(start) && Number.isFinite(current.start_seconds) && end - current.start_seconds > maxDuration)
            );
            if (!sameVoice || gap > maxGap || gap < -3 || tooLong || !current) {
                current = {
                    recordingId, speakerIndex: index,
                    participant_name: reliableName || 'Participante não identificado',
                    participant_email: reliableName ? clean(row.participant_email) : null,
                    transcript: '', text: clean(row.transcript),
                    start_seconds: Number.isFinite(start) ? start : null,
                    end_seconds: Number.isFinite(end) ? end : null,
                    spoken_at: row.spoken_at || row.created_at || null,
                    endAtMs: startAt + Math.max(0, (Number.isFinite(end) ? end - (Number.isFinite(start) ? start : end) : 0) * 1000),
                    source_ids: [String(row.id)], audio_storage_path: row.audio_storage_path || null
                };
                output.push(current);
            } else {
                current.text = joinText(current.text, row.transcript);
                current.end_seconds = Number.isFinite(end) ? end : current.end_seconds;
                current.endAtMs = Math.max(current.endAtMs, startAt + Math.max(0, (Number.isFinite(end) ? end - (Number.isFinite(start) ? start : end) : 0) * 1000));
                current.source_ids.push(String(row.id));
                current.audio_storage_path = null;
                if (reliableName && current.participant_email === null) {
                    current.participant_name = reliableName;
                    current.participant_email = clean(row.participant_email);
                }
            }
        }
        output.forEach(group => { group.transcript = group.text; });
        return output;
    }

    function formalParagraph(group) {
        const text = clean(group?.text || group?.transcript).replace(/[\s,;:]+$/g, '');
        if (!text) return '';
        const name = recognizedName(group) || 'Um participante ainda não identificado';
        const normalized = /[.!?]$/.test(text) ? text : `${text}.`;
        return `${name} apresentou sua manifestação sobre os assuntos da assembleia, registrando os seguintes pontos: ${normalized}`;
    }

    return { clean, speakerIndex, recognizedName, joinText, groupRows, formalParagraph };
});
