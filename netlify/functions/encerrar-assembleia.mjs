import {
  adminSupabase,
  allowCors,
  ensureAssemblyAccess,
  ensureSyndico,
  getAssemblyByPublicId,
  getAssemblyRoomName,
  getAuthenticatedContext,
  handleOptions,
  logAssemblyEvent,
  ok,
  parseJsonBody,
  roomService,
  fail
} from './_assembly-shared.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return handleOptions('POST, OPTIONS');
  }

  if (event.httpMethod !== 'POST') {
    return fail(405, 'Método não permitido.', {}, allowCors('POST, OPTIONS'));
  }

  try {
    const context = await getAuthenticatedContext(event);
    ensureSyndico(context);

    const body = await parseJsonBody(event);
    const assembly = await getAssemblyByPublicId(body.assemblyId);
    ensureAssemblyAccess(context, assembly);

    if (assembly.status === 'encerrada') {
      return fail(409, 'Esta assembleia já foi encerrada.', {}, allowCors('POST, OPTIONS'));
    }
    if (assembly.status === 'cancelada') {
      return fail(409, 'Esta assembleia foi cancelada e não pode ser encerrada.', {}, allowCors('POST, OPTIONS'));
    }

    const endedAt = new Date().toISOString();
    const roomName = getAssemblyRoomName(assembly);

    const { data, error } = await adminSupabase
      .from('scheduled_assemblies')
      .update({
        status: 'encerrada',
        ended_at: endedAt,
        livekit_room_name: roomName
      })
      .eq('id', assembly.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error('Não foi possível encerrar a assembleia.');
    }

    await Promise.all([
      adminSupabase
        .from('assembly_polls')
        .update({ status: 'encerrada', closed_at: endedAt })
        .eq('assembly_id', assembly.id)
        .eq('status', 'aberta'),
      adminSupabase
        .from('assembly_speaking_requests')
        .update({ status: 'finalizado', answered_at: endedAt })
        .eq('assembly_id', assembly.id)
        .in('status', ['aguardando', 'autorizado']),
      adminSupabase
        .from('assembly_attendance')
        .update({ left_at: endedAt })
        .eq('assembly_id', assembly.id)
        .is('left_at', null)
    ]);

    try {
      await roomService.deleteRoom(roomName);
    } catch (_) {}

    await logAssemblyEvent(assembly.id, 'assembly_ended', context.email, {
      roomName,
      endedAt
    });

    return ok({
      assembly: data,
      room: roomName
    }, allowCors('POST, OPTIONS'));
  } catch (error) {
    return fail(400, error.message || 'Não foi possível encerrar a assembleia.', {}, allowCors('POST, OPTIONS'));
  }
}
