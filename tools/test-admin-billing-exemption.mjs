// Regressao da interpretacao do status de mensalidade e nivel de plano.
// Executar: node --test tools/test-admin-billing-exemption.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/supabase-client.js', import.meta.url), 'utf8');
const from = source.indexOf('async function getCondomitPlanAccess(');
const to = source.indexOf('\nfunction canCondomitUseRoute(', from);
assert.ok(from >= 0 && to > from, 'getCondomitPlanAccess nao encontrado');
const functionSource = source.slice(from, to);

async function resolveAccess(user, billing) {
  const fakeStore = new Map();
  const context = {
    getStoredCondominiumUser: () => user,
    getCondomitBillingStatus: async () => billing,
    normalizeCondomitPlanName: (raw) => {
      const text = String(raw || '').toLowerCase();
      return text.includes('premium') ? 'Premium'
        : text.includes('essencial') ? 'Essencial'
        : text.includes('pro') ? 'Pro' : '';
    },
    getCondomitPlanLevelFromName: (name) => ({ Essencial: 1, Pro: 2, Premium: 3 }[name] || 0),
    CONDOMIT_PLAN_LABELS: { 1: 'Essencial', 2: 'Pro', 3: 'Premium' },
    fetchCondomitPlanCatalog: async () => [
      { id: 1, nome: 'Essencial' }, { id: 2, nome: 'Pro' }, { id: 3, nome: 'Premium' }
    ],
    sessionStorage: { setItem(key, value) { fakeStore.set(key, value); } },
    localStorage: { setItem(key, value) { fakeStore.set(key, value); } },
    window: { dispatchEvent() {} },
    CustomEvent: class { constructor() {} },
    console
  };
  runInNewContext(functionSource, context);
  return await context.getCondomitPlanAccess(billing);
}

test('morador do condominio ADM isento tem acesso Premium sem pagamento', async () => {
  const user = { email: 'morador@exemplo.com', type: 'morador', condominium: { cep: '99999-999' } };
  const result = await resolveAccess(user, { cep: '99999-999', status: 'exempt', billing_exempt: true, can_use: true, plan_name: 'Premium', plan_id: null });
  assert.equal(result.level, 3);
  assert.equal(result.plan_name, 'Premium');
  assert.equal(user.plan_level, 3);
});

test('trocar de condo ADM Premium para um plano Essencial nao conserva Premium', async () => {
  const user = { email: 'morador@exemplo.com', type: 'morador', plan_name: 'Premium', plan_level: 3, plan: 3, condominium: { cep: '04285-000' } };
  const result = await resolveAccess(user, { cep: '04285-000', status: 'active', can_use: true, plan_name: 'Essencial', plan_id: 1 });
  assert.equal(result.level, 1);
  assert.equal(result.plan_id, 1);
  assert.equal(user.plan_level, 1);
});

test('condominio normal inadimplente nao herda plano Premium de sessao antiga', async () => {
  const user = { email: 'porteiro@exemplo.com', type: 'porteiro', plan_name: 'Premium', plan_level: 3, plan: 3, condominium: { cep: '04285-000' } };
  const result = await resolveAccess(user, { cep: '04285-000', status: 'unpaid', can_use: false, plan_name: null, plan_id: null });
  assert.equal(result.resolved, false);
  assert.equal(result.level, 0);
});

test('isencao SQL fica somente no CEP administrativo e passa pelos dois bloqueios', () => {
  const sql = readFileSync(new URL('../supabase/migrations/051_admin_condominium_billing_exemption.sql', import.meta.url), 'utf8');
  assert.match(sql, /VALUES \('99999999',/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.condomit_get_billing_status\(\)/);
  assert.match(sql, /IF is_admin_account OR public\.condomit_is_billing_exempt_cep\(caller_cep\) THEN/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.condomit_enforce_porter_plan_on_membership\(\)/);
  assert.match(sql, /IF public\.condomit_is_billing_exempt_cep\(NEW\.condominium_id::TEXT\) THEN/);
});
