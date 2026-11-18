(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CondomitSpeakerDraft = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const clean = value => String(value || '').replace(/\s+/g,' ').trim();
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    function titleForRole(role, original) {
        const normalized=clean(role).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        if (normalized === 'sindico') return 'O síndico';
        if (normalized === 'sindica') return 'A síndica';
        if (normalized === 'morador') return 'O morador';
        if (normalized === 'moradora') return 'A moradora';
        return original;
    }
    // Só troca referências formais explícitas da ATA; nunca edita a transcrição bruta.
    function replaceAttributedName(body,{oldName,newName,uniqueUnknownVoice=false,newRole=''}={}) {
        const previous = clean(oldName);
        const updated = clean(newName);
        if (!updated || previous === updated) return {body:String(body || ''),changes:0,requiresRegeneration:previous!==updated};
        if (!previous || /^(?:Falante|Participante não identificado)/i.test(previous)) {
            if (!uniqueUnknownVoice) return {body:String(body || ''),changes:0,requiresRegeneration:true};
            const title = titleForRole(newRole,'O participante');
            let changes=0;
            const revised=String(body || '').replace(/O participante ainda não identificado(?=\s)/g, () => {
                changes++;
                return `${title} ${updated}`;
            });
            return {body:revised,changes,requiresRegeneration:changes===0};
        }
        let changes=0;
        const regexp = new RegExp(`\\b((?:O|A)\\s+(?:síndico|síndica|morador|moradora|participante|irmão|irmã|tio|tia)\\s+)${escape(previous)}(?=[\\s,.;:!?]|$)`,'giu');
        const next = String(body || '').replace(regexp,(_,prefix)=>{ changes++; return titleForRole(newRole,prefix.trim()) + ' ' + updated; });
        return {body:next,changes,requiresRegeneration:changes===0};
    }
    return {replaceAttributedName};
});
