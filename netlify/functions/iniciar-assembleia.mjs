import {
  adminSupabase,
  allowCors,
  buildAssemblyMetadata,
  ensureAssemblyAccess,
  ensureRoomExists,
  ensureSyndico,
  getAssemblyByPublicId,
  getAssemblyRoomName,
  getAuthenticatedContext,
  handleOptions,
  logAssemblyEvent,
  ok,
  parseJsonBody,
  persistAssemblyRoomName,
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

    if (assembly.status !== 'agendada') {
      return fail(409, 'A assembleia só pode ser iniciada quando estiver agendada.', {}, allowCors('POST, OPTIONS'));
    }

    const roomName = getAssemblyRoomName(assembly);
    const startedAt = new Date().toISOString();
    const metadata = await buildAssemblyMetadata(assembly);

    await ensureRoomExists(roomName, metadata);
    await persistAssemblyRoomName(assembly, roomName);

    const { data, error } = await adminSupabase
      .from('scheduled_assemblies')
      .update({
        status: 'em_andamento',
        started_at: startedAt,
        ended_at: null,
        livekit_room_name: roomName
      })
      .eq('id', assembly.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error('Não foi possível iniciar a assembleia.');
    }

    await logAssemblyEvent(assembly.id, 'assembly_started', context.email, {
      roomName,
      startedAt
    });

    return ok({
      assembly: data,
      room: roomName
    }, allowCors('POST, OPTIONS'));
  } catch (error) {
    return fail(400, error.message || 'Não foi possível iniciar a assembleia.', {}, allowCors('POST, OPTIONS'));
  }
}
