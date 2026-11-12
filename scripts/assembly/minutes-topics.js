(function (root, factory) {
    const speech = typeof module === 'object' && module.exports
        ? require('./minutes-speech') : root?.CondomitMinutesSpeech;
    const api = factory(speech);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitMinutesTopics = api;
})(typeof window !== 'undefined' ? window : null, function (speech) {
    'use strict';
    const clean = speech?.clean || (value => String(value || '').replace(/\s+/g, ' ').trim());
    const fillers = /(?:^|[\s,;:])(?:é{2,}|ã{2,}|ah+n+|ahn+|hã+|hum+|hmm+|né|tipo assim|ou seja)(?=$|[\s,;:.!?])/giu;
    const stopwords = new Set('sobre para entre isso este esta esse essa aqueles aquelas foram vamos poderia ainda então assim coisa coisas parte partes nosso nossa quero acho com sem cada mais muita muito desde onde durante todos todas agora caso como pelo pela apenas aquela aquele essas esses esta estão depois antes porque por que não foi são um uma uns umas aos nas nos dos das de do da em no na por e ou a o as os se que eu você nós vocês também'.split(' '));
    const predefined = [
        {key:'elevadores', title:'Manutenção dos elevadores', pattern:/\belevador(?:es)?\b|\bascensor(?:es)?\b/i},
        {key:'piscina', title:'Reforma e manutenção da piscina', pattern:/\bpiscina(?:s)?\b/i},
        {key:'lazer', title:'Área de lazer', pattern:/\b(?:área|area)(?:s)? de lazer\b|\bplayground\b|\bquadra(?:s)?\b/i},
        {key:'seguranca', title:'Segurança do condomínio', pattern:/\bseguran[çc]a\b|\bc[âa]mera(?:s)?\b|\bportaria\b|\bacesso\b/i},
        {key:'financeiro', title:'Prestação de contas e orçamento', pattern:/\bpresta[çc][ãa]o de contas\b|\bor[çc]amento\b|\bbalan[çc]o\b|\bmensalidade\b/i},
        {key:'obras', title:'Obras e reformas', pattern:/\b(?:reforma|obra|reparos?)\b/i},
        {key:'convivencia', title:'Convivência e regras internas', pattern:/\bbarulho\b|\bconviv[êe]ncia\b|\bregimento\b|\bregras?\b/i},
        {key:'limpeza', title:'Limpeza e conservação', pattern:/\blimpeza\b|\bconserva[çc][ãa]o\b|\bhigieniza[çc][ãa]o\b/i}
    ];
    function normalize(text) {
        return clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    function removeHesitations(text) {
        return clean(String(text || '').replace(fillers, ' ')
            .replace(/\b(?:é[ée]+|aham|humm+|ahn+)\b/giu, ' ')
            .replace(/\s+([,.;:!?])/g, '$1').replace(/[,;]+(?=[.!?])/g, '').replace(/([,;])(?:\s*[,;])+/g, '$1')
            .replace(/\s{2,}/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, ''));
    }
    function words(text) {
        return [...new Set((normalize(text).match(/[a-z]{4,}/g) || []).filter(w => !stopwords.has(w)))];
    }
    function slug(text) { return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'').slice(0,60) || 'assunto'; }
    function matchScore(left, right) {
        const a = words(left), b = words(right);
        if (!a.length || !b.length) return 0;
        const intersection = a.filter(w => b.includes(w)).length;
        return intersection / Math.max(1, Math.min(a.length, b.length));
    }
    function keyFromText(text) {
        const raw = clean(text);
        return predefined.find(item => item.pattern.test(raw))?.key || null;
    }
    function nameForTopic(title) {
        const entry = predefined.find(item => item.key === keyFromText(title));
        return entry?.title || clean(title).slice(0,120);
    }
    function splitIntoSentences(text) {
        return removeHesitations(text).match(/[^.!?]+(?:[.!?]+|$)/g)?.map(clean).filter(Boolean) || [];
    }
    function buildTopics({rows = [], agenda = [], polls = []} = {}) {
        const ordered = speech?.groupRows?.(rows, {maxGapSeconds:10,maxChars:4000}) || [];
        const topics = [];
        function add(key, title, registered = false) {
            let topic = topics.find(t => t.id === key);
            if (!topic) { topic = {id:key,title,registered,contributions:[],polls:[]}; topics.push(topic); }
            if (registered) { topic.registered = true; topic.title = title; }
            return topic;
        }
        for (const [index, item] of agenda.entries()) {
            const title = clean(item.title || item.description || '');
            if (title) add(`agenda-${item.id || index}`, title, true);
        }
        function resolve(text) {
            let best = null, score = 0;
            for (const topic of topics) {
                const next = matchScore(text, topic.title);
                if (next > score) { score = next; best = topic; }
            }
            if (score >= 0.34) return best;
            const knownKey = keyFromText(text);
            if (knownKey) {
                const candidate = predefined.find(item => item.key === knownKey);
                const matching = topics.find(topic => keyFromText(topic.title) === knownKey);
                return matching || add(`inferido-${knownKey}`, candidate.title);
            }
            return score >= 0.2 && best ? best : null;
        }
        // A classificação por tema serve apenas à redação: não altera a pauta cadastrada.
        for (const group of ordered) {
            let last = null;
            for (const sentence of splitIntoSentences(group.text)) {
                if (sentence.length < 5) continue;
                const topic = resolve(sentence) || last || add('outros-assuntos','Outros assuntos discutidos');
                const previous = topic.contributions.at(-1);
                if (previous && previous.voice === `${group.recordingId}:${group.speakerIndex}`
                    && previous.source_ids.join('|') === group.source_ids.join('|')) {
                    previous.text = speech.joinText(previous.text, sentence);
                } else {
                    topic.contributions.push({
                        text: sentence, voice: `${group.recordingId}:${group.speakerIndex}`,
                        name: speech.recognizedName(group) || null,
                        role: group.participant_role || '',
                        participant_email: group.participant_email || null,
                        source_ids: group.source_ids
                    });
                }
                last = topic;
            }
        }
        for (const poll of polls) {
            const name = clean(poll.title || poll.description || 'Votação');
            const topic = resolve(name) || add(`votacao-${poll.id}`,name);
            topic.polls.push(poll);
        }
        return topics.filter(t => t.contributions.length || t.polls.length || t.registered);
    }
    function speakerPrefix(person) {
        const name = clean(person.name);
        if (!name) return 'O participante ainda não identificado';
        const role = normalize(person.role);
        if (/^sindica$/.test(role)) return `A síndica ${name}`;
        if (/^sindico$/.test(role)) return `O síndico ${name}`;
        if (/^moradora$/.test(role)) return `A moradora ${name}`;
        if (/^morador$/.test(role)) return `O morador ${name}`;
        if (/^irma$/.test(role)) return `A irmã ${name}`;
        if (/^irmao$/.test(role)) return `O irmão ${name}`;
        if (/^tia$/.test(role)) return `A tia ${name}`;
        if (/^tio$/.test(role)) return `O tio ${name}`;
        return `O participante ${name}`;
    }
    return {removeHesitations,splitIntoSentences,buildTopics,speakerPrefix,keyFromText,matchScore};
});
