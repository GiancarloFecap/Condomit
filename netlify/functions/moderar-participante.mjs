import {
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

    const roomName = getAssemblyRoomName(assembly);
    const targetIdentity = String(body.targetIdentity || '').trim();
    const action = String(body.action || '').trim();

    if (!targetIdentity) {
      throw new Error('O participante alvo é obrigatório.');
    }
    if (String(context.authUser.id) === targetIdentity) {
      throw new Error('Use o botão de sair da chamada para encerrar sua própria participação.');
    }
    if (!['mute_audio', 'remove_participant'].includes(action)) {
      throw new Error('Ação de moderação inválida.');
    }

    if (action === 'mute_audio') {
      const trackSid = String(body.trackSid || '').trim();
      if (!trackSid) {
        throw new Error('trackSid é obrigatório para silenciar o áudio.');
      }
      await roomService.mutePublishedTrack(roomName, targetIdentity, trackSid, true);
      await logAssemblyEvent(assembly.id, 'participant_muted', context.email, {
        roomName,
        targetIdentity,
        trackSid
      });
    }

    if (action === 'remove_participant') {
      await roomService.removeParticipant(roomName, targetIdentity, {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000))
      });
      await logAssemblyEvent(assembly.id, 'participant_removed', context.email, {
        roomName,
        targetIdentity
      });
    }

    return ok({
      success: true,
      action,
      targetIdentity
    }, allowCors('POST, OPTIONS'));
  } catch (error) {
    return fail(400, error.message || 'Não foi possível moderar o participante.', {}, allowCors('POST, OPTIONS'));
  }
}
