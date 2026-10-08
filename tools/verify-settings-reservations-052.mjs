import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('pages/configuracoes.html');
const page = read('pages/index.html');
const settings = read('scripts/configuracoes.js');
const modal = read('scripts/config-access-012.js');
const sql = read('supabase/migrations/052_clear_reservations_when_changing_condominium.sql');
const groups = ['account', 'security', 'reservations', 'condominium', 'about'];
for (const id of groups) {
  assert.match(html, new RegExp(`id="settings-tab-${id}"`), `Missing tab ${id}`);
  assert.match(html, new RegExp(`id="settings-panel-${id}"`), `Missing tab panel ${id}`);
}
assert.match(html, /data-config-profile-link/);
assert.match(html, /data-min-plan="Pro"/);
assert.match(html, /id="settings-panel-condominium"[\s\S]*?openChangeCondominiumModal\(\)/);
assert.match(settings, /function initSettingsTabs/);
for (const key of ['tabs_account','tabs_security','tabs_reservations','tabs_condominium','tabs_about']) {
  assert.equal(settings.match(new RegExp(key + ':', 'g')).length, 2, `Missing Portuguese/English translation ${key}`);
}
assert.doesNotMatch(page, /id="refDataStatus"/);
assert.match(modal, /todas as suas reservas anteriores serão excluídas permanentemente/);
assert.match(modal, /window\.confirm\(text\)/);
assert.match(sql, /AFTER UPDATE OF condominium ON public\.users/);
assert.match(sql, /NOT public\.condomit_same_cep\(previous_cep, next_cep\)/);
assert.match(sql, /DELETE FROM public\.reserva/);
console.log('OK - 5 settings tabs, bilingual labels, reservation access restriction and condominium grouping.');
console.log('OK - dashboard status removed; migration 052 deletes reservations only on successful CEP changes.');
