"""Processamento privado e independente de transcrições da Condomit.

Este processo NÃO usa Gemini, APIs de fala pagas, navegador do morador ou
funções Netlify de longa duração. Executa em um host persistente autorizado.

Os textos automáticos são evidências PARA REVISÃO e não uma ata oficial.
"""
from __future__ import annotations

import argparse
import datetime as dt
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from typing import Any

import requests

LOG = logging.getLogger('condomit.transcricao')
BUCKET = 'condomit-assembly-recordings'
MODEL_NAME = os.getenv('WHISPER_MODEL', 'small').strip()
MODEL_ID = f'faster-whisper:{MODEL_NAME}'
POLL_SECONDS = max(5, int(os.getenv('POLL_SECONDS', '20')))
WINDOW_SECONDS = max(60, min(900, int(os.getenv('WINDOW_SECONDS', '240'))))
MAX_VIDEO_BYTES = max(100_000_000, int(os.getenv('MAX_VIDEO_BYTES', '2147483648')))
MAX_RETRIES = max(1, int(os.getenv('MAX_RETRIES', '3')))
BATCH_SIZE = 50
MODEL = None


def utcnow() -> dt.datetime:
    return dt.datetime.now(tz=dt.timezone.utc)


def iso(value: dt.datetime) -> str:
    return value.isoformat(timespec='seconds')


def parse_dt(value: str | None) -> dt.datetime:
    if not value:
        return dt.datetime.fromtimestamp(0, tz=dt.timezone.utc)
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return dt.datetime.fromtimestamp(0, tz=dt.timezone.utc)


def recording_path(row: dict[str, Any]) -> str:
    prefix = f'storage://{BUCKET}/{int(row["assembly_id"])}/'
    raw = str(row.get('recording_url') or '')
    if not raw.startswith(prefix):
        raise ValueError('Endereço privado da gravação inválido.')
    filename = raw[len(prefix):]
    if not re.fullmatch(r'[a-zA-Z0-9_.-]+\.mp4', filename) or '..' in filename:
        raise ValueError('Nome de arquivo da gravação inválido.')
    return f'{int(row["assembly_id"])}/{filename}'


def should_process(row: dict[str, Any], now: dt.datetime | None = None) -> bool:
    now = now or utcnow()
    if row.get('status') != 'concluido' or not row.get('recording_url'):
        return False
    status = str(row.get('transcription_status') or 'pendente')
    last = parse_dt(row.get('transcription_started_at'))
    age = (now - last).total_seconds()
    previous_model = str(row.get('transcription_model') or '')
    previous_is_worker = previous_model.startswith('faster-whisper:')
    attempts = int(row.get('transcription_attempts') or 0)
    if status == 'concluido':
        # Migrações de Gemini já finalizadas são refeitas a partir do vídeo.
        return not previous_is_worker and os.getenv('REPROCESSAR_GEMINI', 'true').lower() == 'true'
    if status == 'pendente':
        return True
    if status in ('processando', 'enfileirado'):
        # Na versão antiga, esses estados eram controlados pela Netlify/Gemini.
        return age > (7200 if previous_is_worker else 1200)
    if status == 'falhou':
        if not previous_is_worker:
            return True  # inclusive erros 403 antigos e tentativas Gemini esgotadas
        return attempts < MAX_RETRIES and age >= min(3600, 30 * (2 ** min(attempts, 6)))
    return False


class Api:
    def __init__(self, url: str, key: str):
        if not url.startswith('https://') or not key:
            raise RuntimeError('Configure SUPABASE_URL (HTTPS) e SUPABASE_SERVICE_ROLE_KEY.')
        self.url = url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'apikey': key, 'Authorization': f'Bearer {key}',
            'Accept': 'application/json', 'Content-Type': 'application/json',
        })

    def request(self, method: str, path: str, **kwargs):
        response = self.session.request(method, self.url + path, timeout=kwargs.pop('timeout', 45), **kwargs)
        response.raise_for_status()
        if response.status_code == 204 or not response.content:
            return []
        return response.json()

    def list_jobs(self) -> list[dict[str, Any]]:
        select = 'id,assembly_id,status,recording_url,started_at,created_at,duration_seconds,file_size_bytes,transcription_status,transcription_model,transcription_attempts,transcription_cursor_seconds,transcription_started_at,transcription_error'
        base = {'select': select, 'status': 'eq.concluido', 'limit': '80'}
        # Prioriza gravações inéditas e evita que milhares de registros antigos
        # já transcritos esgotem a paginação do banco.
        pending = self.request('GET', '/rest/v1/assembly_recordings', params={
            **base, 'transcription_status': 'eq.pendente', 'order': 'created_at.asc',
        })
        if pending:
            return pending
        interrupted = self.request('GET', '/rest/v1/assembly_recordings', params={
            **base, 'transcription_status': 'in.(enfileirado,processando,falhou)',
            'order': 'transcription_started_at.asc.nullsfirst',
        })
        if any(should_process(row) for row in interrupted):
            return interrupted
        if os.getenv('REPROCESSAR_GEMINI', 'true').lower() == 'true':
            legacy = self.request('GET', '/rest/v1/assembly_recordings', params={
                **base, 'transcription_status': 'eq.concluido',
                'transcription_model': 'not.like.faster-whisper:%',
                'order': 'created_at.asc',
            })
            if legacy:
                return legacy
        return []

    def patch(self, recording_id: int, data: dict[str, Any], *, filters: dict[str, str] | None = None) -> list[dict[str, Any]]:
        where = {'id': f'eq.{recording_id}', **(filters or {})}
        response = self.session.patch(self.url + '/rest/v1/assembly_recordings', params=where, json=data,
                                      headers={'Prefer': 'return=representation'}, timeout=45)
        response.raise_for_status()
        return response.json()

    def claim(self, row: dict[str, Any]) -> bool:
        status = str(row.get('transcription_status') or 'pendente')
        previous_worker = str(row.get('transcription_model') or '').startswith('faster-whisper:')
        attempt = int(row.get('transcription_attempts') or 0) + 1 if previous_worker else 1
        where = {'status': 'eq.concluido', 'transcription_status': f'eq.{status}'}
        if status in ('processando', 'enfileirado') and row.get('transcription_started_at'):
            where['transcription_started_at'] = f'eq.{row["transcription_started_at"]}'
        if row.get('transcription_model'):
            where['transcription_model'] = f'eq.{row["transcription_model"]}'
        else:
            where['transcription_model'] = 'is.null'
        now = iso(utcnow())
        patch = {
            'transcription_status': 'processando',
            'transcription_started_at': now,
            'transcription_error': None,
            'transcription_model': MODEL_ID,
            'transcription_attempts': attempt,
            'transcription_finished_at': None,
            'transcription_cursor_seconds': 0,
        }
        return bool(self.patch(int(row['id']), patch, filters=where))

    def assembly_cep(self, assembly_id: int) -> str:
        data = self.request('GET', '/rest/v1/scheduled_assemblies', params={
            'select': 'cep', 'id': f'eq.{assembly_id}', 'limit': 1,
        })
        if not data or not data[0].get('cep'):
            raise RuntimeError('Assembleia ou condomínio não encontrado.')
        return str(data[0]['cep'])

    def download_private_video(self, row: dict[str, Any], destination: Path):
        path = recording_path(row)
        from urllib.parse import quote
        encoded = quote(path, safe='/')
        remote = self.url + f'/storage/v1/object/authenticated/{BUCKET}/{encoded}'
        count = 0
        with self.session.get(remote, stream=True, timeout=(15, 180)) as response:
            response.raise_for_status()
            header_size = int(response.headers.get('Content-Length') or '0')
            if header_size > MAX_VIDEO_BYTES:
                raise RuntimeError('MP4 excede o limite configurado para processamento.')
            with destination.open('wb') as output:
                for piece in response.iter_content(chunk_size=1024 * 1024):
                    if not piece:
                        continue
                    count += len(piece)
                    if count > MAX_VIDEO_BYTES:
                        raise RuntimeError('MP4 excede o limite configurado para processamento.')
                    output.write(piece)
        if count < 1024:
            raise RuntimeError('MP4 está vazio ou incompleto no armazenamento.')

    def delete_window(self, recording_id: int, start: float, end: float):
        return self.request('DELETE', '/rest/v1/assembly_transcripts', params={
            'recording_id': f'eq.{recording_id}',
            'transcript_source': 'eq.recording_video_whisper',
            'start_seconds': f'gte.{start:.2f}', 'end_seconds': f'lt.{end:.2f}',
        })

    def insert_transcripts(self, rows: list[dict[str, Any]]):
        for at in range(0, len(rows), BATCH_SIZE):
            self.request('POST', '/rest/v1/assembly_transcripts', json=rows[at:at+BATCH_SIZE],
                         headers={'Prefer': 'return=minimal'})

    def cleanup_old_gemini(self, recording_id: int):
        # Preserva transcrições humanas e outras gravações; remove só Gemini deste vídeo.
        self.request('DELETE', '/rest/v1/assembly_transcripts', params={
            'recording_id': f'eq.{recording_id}', 'transcript_source': 'eq.recording_gemini',
        })


def ffmpeg(args: list[str]):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', *args],
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=7200)


def duration_seconds(wav: Path) -> float:
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'default=noprint_wrappers=1:nokey=1', str(wav)],
                            capture_output=True, text=True, check=True, timeout=30)
    return float(result.stdout.strip())


def load_model():
    global MODEL
    if MODEL is None:
        from faster_whisper import WhisperModel
        LOG.info('Carregando modelo de reconhecimento local: %s', MODEL_NAME)
        MODEL = WhisperModel(MODEL_NAME,
                             device=os.getenv('WHISPER_DEVICE', 'cpu'),
                             compute_type=os.getenv('WHISPER_COMPUTE_TYPE', 'int8'),
                             download_root=os.getenv('HF_HOME', '/models'))
    return MODEL


def transcribe_window(wav: Path, *, start: float, end: float, total: float) -> list[dict[str, Any]]:
    """Introduz contexto de 1,5s nas bordas; atribui cada trecho a apenas uma janela."""
    context = 1.5
    read_start = max(0, start - context)
    read_end = min(total, end + context)
    chunk = wav.with_name('audio_chunk.wav')
    ffmpeg(['-ss', f'{read_start:.3f}', '-t', f'{read_end-read_start:.3f}', '-i', str(wav),
            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(chunk)])
    model = load_model()
    segments, _ = model.transcribe(str(chunk), language=os.getenv('WHISPER_LANGUAGE', 'pt'),
                                   beam_size=5, best_of=5, vad_filter=True,
                                   vad_parameters={'min_silence_duration_ms': 550},
                                   condition_on_previous_text=False,
                                   no_speech_threshold=0.6,
                                   log_prob_threshold=-1.0,
                                   compression_ratio_threshold=2.4)
    output = []
    for seg in segments:
        begin = read_start + float(seg.start)
        finish = min(total, read_start + float(seg.end))
        center = (begin + finish) / 2
        if center < start or center >= end:
            continue
        if finish <= begin:
            continue
        # Quanto menor a confiança, mais importante consultar o áudio original.
        # Evita registrar como fala um trecho que o detector considera silêncio.
        if float(getattr(seg, 'no_speech_prob', 0) or 0) >= .78:
            continue
        text = re.sub(r'\s+', ' ', str(seg.text or '')).strip()
        if not text:
            continue
        if float(getattr(seg, 'avg_logprob', 0) or 0) < -1.0:
            text = '[inaudível]'
        output.append({'start': round(max(0, begin), 2), 'end': round(finish, 2), 'text': text[:4000]})
    chunk.unlink(missing_ok=True)
    return output


def transcript_rows(row: dict[str, Any], cep: str, snippets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    started = parse_dt(row.get('started_at'))
    # Não atribua fala a um morador sem diarização e evidência verificável.
    return [{
        'assembly_id': int(row['assembly_id']), 'recording_id': int(row['id']), 'cep': cep,
        'participant_email': 'transcricao-video@condomit.invalid',
        'participant_name': 'Falante não identificado', 'participant_role': 'não identificado',
        'participant_identity': None, 'source': 'recording_video_whisper',
        'transcript_source': 'recording_video_whisper', 'transcript': snippet['text'],
        'spoken_at': iso(started + dt.timedelta(seconds=snippet['start'])),
        'start_seconds': snippet['start'], 'end_seconds': snippet['end'],
        'confidence': None,
    } for snippet in snippets]


def transcribe_recording(api: Api, row: dict[str, Any]):
    recording_id = int(row['id'])
    LOG.info('Iniciando processamento da gravação %s da assembleia %s', recording_id, row['assembly_id'])
    if not api.claim(row):
        LOG.info('Gravação %s já reivindicada por outro processo', recording_id)
        return
    try:
        cep = api.assembly_cep(int(row['assembly_id']))
        with tempfile.TemporaryDirectory(prefix='condomit-recording-') as tmp:
            folder = Path(tmp)
            video = folder/'recording.mp4'
            wav = folder/'recording.wav'
            api.download_private_video(row, video)
            ffmpeg(['-i', str(video), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(wav)])
            total = duration_seconds(wav)
            if not 1 <= total <= 24*3600:
                raise RuntimeError('Duração de áudio inválida (máximo de 24 horas).')
            LOG.info('Vídeo %s contém %.0f segundos de áudio', recording_id, total)
            cursor = 0.0
            counter = 0
            while cursor < total:
                end = min(total, cursor+WINDOW_SECONDS)
                entries = transcribe_window(wav, start=cursor, end=end, total=total)
                # Reexecuções substituem apenas os trechos desta janela/gravação.
                api.delete_window(recording_id, cursor, end)
                api.insert_transcripts(transcript_rows(row, cep, entries))
                counter += len(entries)
                api.patch(recording_id, {'transcription_cursor_seconds': round(end,2),
                                         'transcription_total_seconds': round(total,2),
                                         'transcription_started_at': iso(utcnow())},
                          filters={'transcription_status': 'eq.processando',
                                   'transcription_model': f'eq.{MODEL_ID}'})
                LOG.info('Gravação %s: %.0f/%.0f segundos; %s trechos até agora', recording_id, end, total, counter)
                cursor = end
            # Remove histórico da API antiga somente após completar todas as janelas locais.
            api.cleanup_old_gemini(recording_id)
            api.patch(recording_id, {'transcription_status':'concluido', 'transcription_finished_at':iso(utcnow()),
                                     'transcription_cursor_seconds':round(total,2),
                                     'transcription_total_seconds':round(total,2),
                                     'transcription_model': MODEL_ID, 'transcription_error': None,
                                     'transcription_attempts':0},
                      filters={'transcription_status': 'eq.processando',
                               'transcription_model': f'eq.{MODEL_ID}'})
            LOG.info('Gravação %s concluída; %s trechos automáticos (exigem revisão)', recording_id, counter)
    except Exception as exc:
        # Nunca registrar conteúdo da gravação, URL assinada ou segredos nos logs.
        LOG.exception('Transcrição não concluída para gravação %s (%s)', recording_id, type(exc).__name__)
        api.patch(recording_id, {
            'transcription_status': 'falhou',
            'transcription_error': f'Processamento local interrompido ({type(exc).__name__}). Confira os logs do worker.',
            'transcription_started_at': iso(utcnow()),
        }, filters={'transcription_status':'eq.processando','transcription_model':f'eq.{MODEL_ID}'})


def main():
    parser = argparse.ArgumentParser(description='Worker privado da transcrição de assembleias Condomit')
    parser.add_argument('--once', action='store_true', help='Executa uma rodada e termina (útil para testes/cron)')
    args = parser.parse_args()
    logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO').upper(),
                        format='%(asctime)s %(levelname)s %(name)s %(message)s')
    api = Api(os.environ.get('SUPABASE_URL', ''), os.environ.get('SUPABASE_SERVICE_ROLE_KEY', ''))
    while True:
        try:
            rows = api.list_jobs()
            eligible = [row for row in rows if should_process(row)]
            if eligible:
                transcribe_recording(api, eligible[0])
            elif args.once:
                LOG.info('Nenhuma gravação elegível nesta rodada')
        except Exception as exc:
            LOG.exception('Erro na consulta de trabalhos (%s)', type(exc).__name__)
            if args.once:
                raise
        if args.once:
            break
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
