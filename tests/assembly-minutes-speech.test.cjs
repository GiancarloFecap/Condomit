'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupRows, joinText, formalParagraph } = require('../scripts/assembly/minutes-speech');

function row(text, start, end, speaker, id, name = `Falante ${speaker + 1}`, email = 'transcricao-video@condomit.invalid') {
    return {
        id, recording_id: 9, participant_name: name,
        participant_email: email, participant_identity: `__deepgram_speaker__:${speaker}`,
        transcript: text, start_seconds: start, end_seconds: end,
        spoken_at: new Date(Date.parse('2026-11-05T12:48:37Z') + start * 1000).toISOString()
    };
}

test('agrupa fala contínua, remove fragmentação e preserva a sequência', () => {
    const rows = [
        row('Foi apresentado 1 proposta de manutenção', 0, 3, 0, 1),
        row('no valor de 8500', 3.4, 5.1, 0, 2),
        row('reais.', 5.3, 6.1, 0, 3),
        row('Em seguida,', 6.6, 7.4, 0, 4),
        row('discutimos a reforma da piscina.', 7.5, 9.9, 0, 5)
    ];
    const groups = groupRows(rows);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].source_ids, ['1','2','3','4','5']);
    assert.match(groups[0].text, /manutenção no valor de 8500 reais\. Em seguida, discutimos/);
    assert.equal(groups[0].participant_name, 'Participante não identificado');
    assert.doesNotMatch(formalParagraph(groups[0]), /Às|Falante \d|declarou:/i);
});

test('identifica uma pessoa apenas se o banco informar vínculo reconhecido', () => {
    const groups = groupRows([row('A entrega ocorreu.', 0, 2, 0, 1, 'Maria Ferreira', 'maria@example.com')]);
    assert.equal(groups[0].participant_name, 'Maria Ferreira');
    assert.match(formalParagraph(groups[0]), /^Maria Ferreira apresentou/);
});

test('não mistura vozes diferentes nem gravações distintas', () => {
    const rows = [row('Bom dia.', 0, 1, 0, 1), row('Bom dia a todos.', 1.2, 3.8, 1, 2), row('Podemos iniciar.', 4, 5, 0, 3)];
    assert.equal(groupRows(rows).length, 3);
    assert.equal(groupRows([rows[0], { ...rows[0], id: 3, recording_id: 10, spoken_at: '2026-11-05T12:48:50Z' }]).length, 2);
});

test('separa pausas longas e textos extremamente longos', () => {
    const rows = [row('Tema de manutenção.', 0, 2, 0, 1), row('Outro tema após pausa.', 21, 25, 0, 2)];
    assert.equal(groupRows(rows).length, 2);
    assert.equal(groupRows([row('A'.repeat(2400), 0, 100, 0, 1), row('B'.repeat(2400), 101, 140, 0, 2)]).length, 2);
});

test('corrige fechamento isolado com conectivo sem alterar conteúdo relevante', () => {
    assert.equal(joinText('Outros sugeriram adiar a obra enquanto.', 'Alguns concordaram.'), 'Outros sugeriram adiar a obra enquanto alguns concordaram.');
});
