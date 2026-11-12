(function (root, factory) {
    const speech = typeof module === 'object' && module.exports
        ? require('./minutes-speech') : root?.CondomitMinutesSpeech;
    const api = factory(speech);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitMinutesNarrative = api;
})(typeof window !== 'undefined' ? window : null, function (speech) {
    'use strict';

    const HEADING = 'MANIFESTAÇÕES DOS PARTICIPANTES';
    const NEXT_HEADING = 'DELIBERAÇÕES E VOTAÇÕES';
    const clean = speech?.clean || (value => String(value || '').replace(/\s+/g, ' ').trim());
    const uninformative = /^(?:bom dia|boa tarde|boa noite|obrigad[oa]|agrade[çc]o|at[eé] logo|um bom final de semana|tenham um [oó]timo dia|ol[aá](?: pessoal)?)[\s,.!?]*$/i;
    const incomplete = /^(?:e|ou|mas|que|de|do|da|em|com|para|por|o|a|um|uma|ent[ãa]o|enfim|por fim|primeiramente)[,.!?\s]*$/i;

    function normalizeNumbers(text) {
        return text.replace(/\b1 proposta\b/gi, 'uma proposta')
            .replace(/\b1 vota[çc][ãa]o\b/gi, 'uma votação')
            .replace(/\b(or[çc]amento(?: estimado)? de|no valor de)\s+(\d{4,8})(?!\d)\b/gi, (_, label, amount) =>
                `${label} R$ ${Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
            .replace(/\b(\d{4,8})(?:\s+reais)\b/gi, (_, amount) =>
                `R$ ${Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }

    function normalizedClause(value) {
        return normalizeNumbers(clean(value)
            .replace(/^(?:e|ent[ãa]o|primeiramente|em seguida|por fim|enfim|ol[aá](?: pessoal)?|principais(?: assuntos)?)[,;:.!\s]+/i, '')
            .replace(/\s+(?:n[eé]|t[aá]|certo)\s*[.!?]*$/i, '')
            .replace(/^[,;:.!\s]+|[,;:.!\s]+$/g, ''));
    }

    function toReportedClause(value) {
        const original = normalizedClause(value).replace(/\bde a\b/gi, 'da').replace(/\bde o\b/gi, 'do');
        if (original.length < 8 || uninformative.test(original) || incomplete.test(original)) return null;
        const first = original.charAt(0).toLocaleLowerCase('pt-BR') + original.slice(1);
        const patterns = [
            [/^sobre\s+(.+)$/i, x => `abordou ${x}`],
            [/^no valor de\s+(.+)$/i, x => `mencionou o valor de ${x}`],
            [/^(?:eu\s+)?(?:acho|acredito|considero|penso)\s+que\s+(.+)$/i, x => `considerou que ${x.replace(/^(?:podemos|poderíamos|deveríamos)\s+adiar\s+(.+)$/i, 'seria recomendável avaliar o adiamento de $1')}`],
            [/^(?:eu\s+)?(?:quero|gostaria|queria)\s+(?:de\s+)?(?:falar|comentar|discutir)\s+(?:sobre\s+)?(.+)$/i, x => `abordou ${x}`],
            [/^(?:n[oó]s|a gente)\s+(?:iremos|vamos|pretendemos)\s+(?:fazer|realizar)\s+(?:uma?\s+)?vota[çc][ãa]o(.*)$/i, x => `informou a intenção de realizar uma votação${x ? ' ' + x : ''}`],
            [/^(?:eu\s+)?(?:sugiro|proponho)\s+(?:que\s+)?(.+)$/i, x => `sugeriu ${x}`],
            [/^(?:eu\s+)?(?:discordo|n[ãa]o concordo)\s+(?:com|da|de)\s+(.+)$/i, x => `manifestou discordância em relação a ${x}`],
            [/^(?:eu\s+)?concordo\s+(?:com|da|de)\s+(.+)$/i, x => `manifestou concordância com ${x}`],
            [/^alguns moradores\s+(?:relatam|relataram|apontam|apontaram)\s+(.+)$/i, x => `mencionou relatos de moradores sobre ${x}`],
            [/^(?:outros|alguns moradores)\s+sugeriram\s+(.+)$/i, x => `relatou que houve sugestão de ${x}`],
            [/^(?:foi|foram)\s+apresentad[ao]s?\s+(.+)$/i, x => `informou que foi apresentada ${x}`],
            [/^(?:n[oó]s\s+)?(?:discutimos|debatemos|conversamos sobre)\s+(.+)$/i, x => `mencionou a discussão sobre ${x}`],
            [/^(?:n[oó]s|a gente)\s+(?:decidimos|deliberamos)\s+(.+)$/i, x => `afirmou que houve deliberação sobre ${x}`]
        ];
        for (const [regex, format] of patterns) {
            const match = original.match(regex);
            if (match) return format(normalizedClause(match[1])).replace(/\bde a\b/gi, 'da').replace(/\bde o\b/gi, 'do').replace(/[.!?]+$/g, '');
        }
        // Fallback conservador: não afirma que uma proposta foi aprovada e não atribui uma decisão coletiva.
        if (/^(?:foi|foram|ser[aã]o|ficou|ficaram)\b/i.test(first)) return `registrou que ${first}`;
        if (/^(?:os|as|alguns|algumas|outros|outras|um|uma|o|a)\s+/i.test(first)) return `relatou que ${first}`;
        if (/\b(?:or[çc]amento|valor|proposta|reforma|problema|manuten[çc][ãa]o|elevador|seguran[çc]a|vota[çc][ãa]o|despesa|assembleia|prazo|custo)\b/i.test(first)) {
            return `abordou questões relacionadas a ${first}`;
        }
        return `registrou observações sobre ${first}`;
    }

    function splitSentences(text) {
        const normalized = clean(text);
        if (!normalized) return [];
        const fragments = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) || [normalized];
        // Uma frase dividida pelo reconhecedor pode conter segmentos minúsculos; reanexar sempre que possível.
        const sentences = [];
        for (const raw of fragments) {
            const fragment = normalizedClause(raw);
            if (!fragment || incomplete.test(fragment) || uninformative.test(fragment)) continue;
            if (fragment.length < 9 && sentences.length) sentences[sentences.length - 1] += ` ${fragment}`;
            else sentences.push(fragment);
        }
        return sentences;
    }

    function paragraphForGroup(group) {
        const name = speech?.recognizedName?.(group) || 'Um participante';
        const clauses = splitSentences(group.text || group.transcript)
            .map(toReportedClause).filter(Boolean);
        if (!clauses.length) return '';
        // Cada intervenção continua atribuída a uma única voz. Nunca misturar pessoas diferentes.
        const lead = name === 'Um participante' ? 'Um participante' : name;
        const phrases = clauses;
        return `${lead} ${phrases.join('; ')}.`.replace(/\s+([,.;:])/g, '$1');
    }

    function fallbackParagraphs(rows) {
        const groups = speech?.groupRows?.(rows) || [];
        return groups.map(paragraphForGroup).filter(Boolean);
    }

    function narrativeSection(body) {
        const text = String(body || '');
        const headingIndex = text.toLocaleUpperCase('pt-BR').indexOf(HEADING);
        if (headingIndex < 0) return '';
        const after = text.slice(headingIndex + HEADING.length);
        const nextIndex = after.toLocaleUpperCase('pt-BR').indexOf(NEXT_HEADING);
        return (nextIndex < 0 ? after : after.slice(0, nextIndex)).trim();
    }

    function hasNarrative(body) {
        const section = narrativeSection(body);
        return section.length >= 45
            && !/síntese narrativa das manifestações está pendente|não foi possível consolidar as manifestações|nenhuma manifestação disponível/i.test(section);
    }

    return { HEADING, NEXT_HEADING, toReportedClause, paragraphForGroup, fallbackParagraphs, narrativeSection, hasNarrative };
});
