'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const API_KEY = String(process.env.CONDOMIT_API_KEY || '').trim();

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-condomit-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function response(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function cep(value) { const v=String(value||'').replace(/\D/g,''); return v.length===8?v:''; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers, body:'' };
  if (event.httpMethod !== 'GET') return response(405,{error:'Método não permitido.'});
  if (!API_KEY) return response(503,{error:'CONDOMIT_API_KEY não configurada no Netlify.'});
  if (String(event.headers['x-condomit-api-key'] || '') !== API_KEY) return response(401,{error:'Chave da API inválida.'});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return response(503,{error:'Supabase não configurado no servidor.'});

  const targetCep = cep(event.queryStringParameters?.cep);
  const resource = String(event.queryStringParameters?.resource || 'metrics').toLowerCase();
  if (!targetCep) return response(400,{error:'Informe um CEP válido com 8 dígitos.'});

  const db = createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    if (resource === 'metrics') {
      const [tickets, maintenance, alerts, docs] = await Promise.all([
        db.from('service_tickets').select('id,status',{count:'exact',head:false}).eq('cep',targetCep),
        db.from('maintenance_items').select('id,status',{count:'exact',head:false}).eq('cep',targetCep),
        db.from('emergency_alerts').select('id,active',{count:'exact',head:false}).eq('cep',targetCep),
        db.from('condominium_documents').select('id',{count:'exact',head:false}).eq('cep',targetCep)
      ]);
      const firstError=[tickets,maintenance,alerts,docs].find(x=>x.error)?.error;if(firstError)throw firstError;
      return response(200,{cep:targetCep,documents:docs.data.length,open_tickets:tickets.data.filter(x=>!['resolvido','cancelado'].includes(x.status)).length,pending_maintenance:maintenance.data.filter(x=>x.status!=='concluida').length,active_emergencies:alerts.data.filter(x=>x.active).length,generated_at:new Date().toISOString()});
    }
    if (resource === 'calendar') {
      const {data,error}=await db.from('condominium_calendar_events').select('id,event_type,title,description,starts_at,ends_at').eq('cep',targetCep).gte('starts_at',new Date().toISOString()).order('starts_at').limit(100);if(error)throw error;return response(200,{cep:targetCep,items:data});
    }
    if (resource === 'assets') {
      const {data,error}=await db.from('condominium_assets').select('id,name,asset_type,location,status,qr_code').eq('cep',targetCep).order('name').limit(500);if(error)throw error;return response(200,{cep:targetCep,items:data});
    }
    return response(400,{error:'Recurso inválido. Use metrics, calendar ou assets.'});
  } catch (error) {
    console.error('[public-api]',error);
    return response(500,{error:'Não foi possível consultar o recurso.',details:error.message||String(error)});
  }
};
