import {
  adminSupabase,
  allowCors,
  ensureAssemblyAccess,
  ensureSyndico,
  getAssemblyByPublicId,
  getAssemblyState,
  getAuthenticatedContext,
  getOpenAttendanceByIdentity,
  handleOptions,
  logAssemblyEvent,
  ok,
  parseJsonBody,
  fail
} from './_assembly-shared.mjs';

function limitText(value, max) {
  return String(value || '').trim().slice(0, max);
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions('POST, OPTIONS');
  }

  if (event.httpMethod !== 'POST') {
    return fail(405, 'Método não permitido.', {}, allowCors('POST, OPTIONS'));
  }

  try {
    const context = await getAuthenticatedContext(event);
    const body = await parseJsonBody(event);
    const action = String(body.action || '').trim();
    const assembly = await getAssemblyByPublicId(body.assemblyId);
    ensureAssemblyAccess(context, assembly);

    if (!action) {
      throw new Error('A ação da assembleia é obrigatória.');
    }

    if (action === 'get_state') {
      return ok(await getAssemblyState(context, assembly), allowCors('POST, OPTIONS'));
    }

    if (action === 'attendance_join') {
      const existing = await getOpenAttendanceByIdentity(assembly.id, context.email);
      if (existing) {
        return ok({ attendance: existing, alreadyOpen: true }, allowCors('POST, OPTIONS'));
      }

      const { data, error } = await adminSupabase
        .from('assembly_attendance')
        .insert({
          assembly_id: assembly.id,
          user_email: context.email,
          participant_name: context.displayName,
          participant_role: context.role,
          joined_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível registrar a entrada na assembleia.');
      await logAssemblyEvent(assembly.id, 'attendance_join', context.email, { attendanceId: data.id });
      return ok({ attendance: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'attendance_heartbeat') {
      const existing = await getOpenAttendanceByIdentity(assembly.id, context.email);
      if (!existing) {
        return ok({ heartbeat: false }, allowCors('POST, OPTIONS'));
      }

      await adminSupabase
        .from('assembly_attendance')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('id', existing.id);

      return ok({ heartbeat: true, attendanceId: existing.id }, allowCors('POST, OPTIONS'));
    }

    if (action === 'attendance_leave') {
      const existing = await getOpenAttendanceByIdentity(assembly.id, context.email);
      if (!existing) {
        return ok({ attendanceClosed: false }, allowCors('POST, OPTIONS'));
      }

      const leftAt = new Date();
      const joinedAt = new Date(existing.joined_at);
      const totalSeconds = Math.max(0, Math.floor((leftAt.getTime() - joinedAt.getTime()) / 1000));
      const { data, error } = await adminSupabase
        .from('assembly_attendance')
        .update({
          left_at: leftAt.toISOString(),
          total_seconds: totalSeconds
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível registrar a saída da assembleia.');
      await logAssemblyEvent(assembly.id, 'attendance_leave', context.email, { attendanceId: data.id, totalSeconds });
      return ok({ attendance: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'send_chat_message') {
      const message = limitText(body.message, 2000);
      if (!message) {
        throw new Error('Digite uma mensagem antes de enviar.');
      }

      const { data, error } = await adminSupabase
        .from('assembly_chat_messages')
        .insert({
          assembly_id: assembly.id,
          user_email: context.email,
          participant_name: context.displayName,
          message
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível enviar a mensagem no chat.');
      return ok({ message: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'raise_hand') {
      const existing = await adminSupabase
        .from('assembly_speaking_requests')
        .select('*')
        .eq('assembly_id', assembly.id)
        .eq('user_email', context.email)
        .eq('status', 'aguardando')
        .limit(1)
        .maybeSingle();

      if (existing.data) {
        return ok({ request: existing.data, alreadyWaiting: true }, allowCors('POST, OPTIONS'));
      }

      const { data, error } = await adminSupabase
        .from('assembly_speaking_requests')
        .insert({
          assembly_id: assembly.id,
          user_email: context.email,
          participant_name: context.displayName,
          status: 'aguardando'
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível registrar o pedido de fala.');
      await logAssemblyEvent(assembly.id, 'hand_raised', context.email, { requestId: data.id });
      return ok({ request: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'lower_hand') {
      const { data, error } = await adminSupabase
        .from('assembly_speaking_requests')
        .update({
          status: 'finalizado',
          answered_at: new Date().toISOString()
        })
        .eq('assembly_id', assembly.id)
        .eq('user_email', context.email)
        .eq('status', 'aguardando')
        .select('*');

      if (error) throw new Error('Não foi possível abaixar a mão.');
      return ok({ requests: data || [] }, allowCors('POST, OPTIONS'));
    }

    if (action === 'resolve_speaking_request') {
      ensureSyndico(context);
      const requestId = Number(body.requestId || 0);
      const nextStatus = String(body.status || '').trim();
      if (!requestId || !['autorizado', 'recusado', 'finalizado'].includes(nextStatus)) {
        throw new Error('Dados inválidos para resolver o pedido de fala.');
      }

      const { data, error } = await adminSupabase
        .from('assembly_speaking_requests')
        .update({
          status: nextStatus,
          answered_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .eq('assembly_id', assembly.id)
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível atualizar o pedido de fala.');
      await logAssemblyEvent(assembly.id, 'speaking_request_updated', context.email, {
        requestId,
        status: nextStatus
      });
      return ok({ request: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'create_poll') {
      ensureSyndico(context);
      const title = limitText(body.title, 255);
      const description = limitText(body.description, 1000);
      const options = Array.isArray(body.options) ? body.options.map((item) => limitText(item, 255)).filter(Boolean) : [];
      if (title.length < 3 || options.length < 2) {
        throw new Error('Informe uma pergunta e pelo menos duas opções válidas.');
      }

      const pollInsert = await adminSupabase
        .from('assembly_polls')
        .insert({
          assembly_id: assembly.id,
          title,
          description: description || null,
          status: 'aberta',
          created_by: context.email
        })
        .select('*')
        .single();

      if (pollInsert.error || !pollInsert.data) {
        throw new Error('Não foi possível criar a votação.');
      }

      const optionsPayload = options.map((optionText, index) => ({
        poll_id: pollInsert.data.id,
        option_text: optionText,
        display_order: index + 1
      }));

      const optionsInsert = await adminSupabase
        .from('assembly_poll_options')
        .insert(optionsPayload)
        .select('*');

      if (optionsInsert.error) {
        throw new Error('A votação foi criada, mas houve erro ao salvar as opções.');
      }

      await logAssemblyEvent(assembly.id, 'poll_created', context.email, {
        pollId: pollInsert.data.id
      });

      return ok({
        poll: pollInsert.data,
        options: optionsInsert.data || []
      }, allowCors('POST, OPTIONS'));
    }

    if (action === 'close_poll') {
      ensureSyndico(context);
      const pollId = Number(body.pollId || 0);
      if (!pollId) throw new Error('pollId é obrigatório.');

      const { data, error } = await adminSupabase
        .from('assembly_polls')
        .update({
          status: 'encerrada',
          closed_at: new Date().toISOString()
        })
        .eq('id', pollId)
        .eq('assembly_id', assembly.id)
        .select('*')
        .single();

      if (error || !data) throw new Error('Não foi possível encerrar a votação.');
      await logAssemblyEvent(assembly.id, 'poll_closed', context.email, { pollId });
      return ok({ poll: data }, allowCors('POST, OPTIONS'));
    }

    if (action === 'cast_vote') {
      if (context.role === 'porteiro') {
        throw new Error('Porteiros não podem votar nesta assembleia.');
      }

      const pollId = Number(body.pollId || 0);
      const optionId = Number(body.optionId || 0);
      if (!pollId || !optionId) {
        throw new Error('Selecione uma opção válida para votar.');
      }

      const pollResult = await adminSupabase
        .from('assembly_polls')
        .select('*')
        .eq('id', pollId)
        .eq('assembly_id', assembly.id)
        .limit(1)
        .maybeSingle();

      if (pollResult.error || !pollResult.data || pollResult.data.status !== 'aberta') {
        throw new Error('Esta votação não está aberta para novos votos.');
      }

      const insert = await adminSupabase
        .from('assembly_votes')
        .insert({
          poll_id: pollId,
          assembly_id: assembly.id,
          user_email: context.email,
          option_id: optionId
        })
        .select('*')
        .single();

      if (insert.error || !insert.data) {
        if (String(insert.error?.message || '').toLowerCase().includes('duplicate')) {
          throw new Error('Seu voto já foi registrado nesta votação.');
        }
        throw new Error('Não foi possível registrar o voto.');
      }

      await logAssemblyEvent(assembly.id, 'poll_vote_cast', context.email, {
        pollId,
        optionId
      });

      return ok({ vote: insert.data }, allowCors('POST, OPTIONS'));
    }

    throw new Error('Ação de assembleia não reconhecida.');
  } catch (error) {
    return fail(400, error.message || 'Não foi possível processar a ação da assembleia.', {}, allowCors('POST, OPTIONS'));
  }
}
