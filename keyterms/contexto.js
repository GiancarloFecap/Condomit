'use strict';

const { buildKeyterms } = require('./buildKeyterms');

function nomeEmpresa(texto) {
  const matches = [];
  const input = String(texto || '').slice(0, 12000);
  const regex = /(?:empresa|fornecedora|prestadora|orçamento da empresa|proposta da empresa|cotação da empresa)\s*[:\-]?\s+([\p{Lu}][\p{L}\p{N}&.'-]*(?:\s+[\p{Lu}][\p{L}\p{N}&.'-]*){0,4})/gu;
  for (const found of input.matchAll(regex)) {
    const value = found[1]?.trim();
    if (value && !/^(?:de|do|da|dos|das|para|um|uma|o|a)$/i.test(value)) matches.push(value);
  }
  return matches;
}
function normalizeEmail(value) { return String(value || '').toLowerCase().trim(); }
function condoInfo(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return {}; }
  }
  return value && typeof value === 'object' ? value : {};
}
function ensure(result, table) {
  if (result?.error) throw new Error(`Consulta ao contexto de keyterms falhou (${table}): ${String(result.error.message || 'erro').slice(0, 90)}`);
  return result?.data || [];
}

async function obterContextoAssembleia(admin, row) {
  const id = Number(row?.assembly_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Assembleia inválida para contexto de keyterms.');
  const [meetingResult, agendaResult, attendanceResult, documentResult] = await Promise.all([
    admin.from('scheduled_assemblies').select('id,cep,assembly_type,title,description,created_by').eq('id', id).maybeSingle(),
    admin.from('assembly_agenda_items').select('title,description').eq('assembly_id', id).order('display_order',{ascending:true}).limit(100),
    admin.from('assembly_attendance').select('user_email,participant_name,participant_role').eq('assembly_id', id).limit(400),
    admin.from('assembly_documents').select('title,description').eq('assembly_id', id).limit(100)
  ]);
  if (meetingResult.error) throw meetingResult.error;
  const meeting = meetingResult.data;
  if (!meeting) throw new Error('Assembleia não localizada para a seleção de keyterms.');
  const pauta = ensure(agendaResult,'assembly_agenda_items').map(x => ({ titulo: x.title, descricao: x.description }));
  const attendance = ensure(attendanceResult,'assembly_attendance');
  const docs = ensure(documentResult,'assembly_documents');
  const emails = [...new Set([...attendance.map(x=>normalizeEmail(x.user_email)),normalizeEmail(meeting.created_by)].filter(Boolean))].slice(0,300);
  let people = [];
  if (emails.length) people = ensure(await admin.from('users').select('email,name,condominium,user_type').in('email', emails).limit(300),'users');
  let linked = [];
  if (meeting.cep) {
    const memberships = ensure(await admin.from('user_condominiums').select('user_email').eq('condominium_id', meeting.cep).limit(300),'user_condominiums');
    const unseen = memberships.map(x=>normalizeEmail(x.user_email)).filter(x=>x && !emails.includes(x)).slice(0,200);
    if (unseen.length) linked = ensure(await admin.from('users').select('email,name,condominium,user_type').in('email', unseen).limit(200),'users');
  }
  const users = [...people,...linked];
  const byEmail = new Map(users.map(x => [normalizeEmail(x.email),x]));
  const moradores = [];
  const inserted = new Set();
  const add = (name, email) => {
    const nome = String(name || '').trim();
    const key = normalizeEmail(email) || nome.toLowerCase();
    if (nome && !inserted.has(key)) {moradores.push({nome}); inserted.add(key);}
  };
  for (const person of attendance) add(byEmail.get(normalizeEmail(person.user_email))?.name || person.participant_name, person.user_email);
  for (const person of users) add(person.name, person.email);
  const info = users.map(x=>condoInfo(x.condominium)).find(c=>c.name || c.nome || c.condominium_name || c.nomeCondominio) || {};
  const textContext = [meeting.description, ...pauta.flatMap(p => [p.titulo, p.descricao]), ...docs.flatMap(d => [d.title,d.description])].join('\n');
  return {
    nomeCondominio: info.name || info.nome || info.condominium_name || info.nomeCondominio || '',
    endereco: info.address || info.endereco || '', moradores,
    empresas: nomeEmpresa(textContext), pauta,
    tipoAssembleia: /extraordinaria|extraordinária|age/i.test(meeting.assembly_type) ? 'AGE' : 'AGO'
  };
}

async function prepararKeyterms(admin, row, modelo='nova-3') {
  let contexto;
  try { contexto = await obterContextoAssembleia(admin, row); }
  catch (error) {
    console.warn('[ASSEMBLY KEYTERMS] Contexto indisponível. Usando vocabulário base.', String(error.message || error).slice(0,150));
    contexto = { pauta: [], moradores: [], empresas: [] };
  }
  const lista = buildKeyterms({...contexto, modelo});
  return { contexto, lista };
}

module.exports = { obterContextoAssembleia, prepararKeyterms, nomeEmpresa };
