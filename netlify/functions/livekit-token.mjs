import {
  allowCors,
  buildAssemblyMetadata,
  createLiveKitToken,
  ensureAssemblyAccess,
  ensureRoomExists,
  getAssemblyByPublicId,
  getAssemblyRoomName,
  getAuthenticatedContext,
  handleOptions,
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
    const body = await parseJsonBody(event);
    const assembly = await getAssemblyByPublicId(body.assemblyId);
    ensureAssemblyAccess(context, assembly);

    if (assembly.status === 'cancelada') {
      return fail(403, 'Esta assembleia foi cancelada.', {}, allowCors('POST, OPTIONS'));
    }
    if (assembly.status === 'encerrada') {
      return fail(403, 'Esta assembleia já foi encerrada.', {}, allowCors('POST, OPTIONS'));
    }
    if (context.role !== 'sindico' && assembly.status !== 'em_andamento') {
      return fail(403, 'A assembleia ainda não foi iniciada pelo síndico.', {}, allowCors('POST, OPTIONS'));
    }

    const roomName = getAssemblyRoomName(assembly);
    await persistAssemblyRoomName(assembly, roomName);

    if (context.role === 'sindico' || assembly.status === 'em_andamento') {
      const metadata = await buildAssemblyMetadata(assembly);
      await ensureRoomExists(roomName, metadata);
    }

    const token = await createLiveKitToken(context, assembly, roomName);

    return ok({
      livekitUrl: process.env.LIVEKIT_URL,
      token,
      room: roomName,
      assembly: {
        id: assembly.public_id || assembly.id,
        numericId: assembly.id,
        title: assembly.title,
        status: assembly.status,
        date: assembly.date,
        startTime: assembly.start_time,
        startedAt: assembly.started_at,
        endedAt: assembly.ended_at
      },
      participant: {
        identity: String(context.authUser.id),
        name: context.displayName,
        email: context.email,
        role: context.role,
        cep: context.condominiumCep
      }
    }, allowCors('POST, OPTIONS'));
  } catch (error) {
    return fail(401, error.message || 'Não foi possível gerar o token da assembleia.', {}, allowCors('POST, OPTIONS'));
  }
}
