import datetime as dt
import os
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker import recording_path, should_process, transcript_rows, MODEL_ID


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 5, 9, tzinfo=dt.timezone.utc)
        self.row = {'id': 45, 'assembly_id': 101, 'status': 'concluido',
                    'recording_url': 'storage://condomit-assembly-recordings/101/arquivo.mp4',
                    'transcription_status': 'pendente', 'transcription_started_at': None,
                    'transcription_model': None, 'transcription_attempts': 0,
                    'started_at': '2026-11-05T09:00:00+00:00'}

    def test_valid_path(self):
        self.assertEqual(recording_path(self.row), '101/arquivo.mp4')

    def test_reject_traversal(self):
        self.row['recording_url'] = 'storage://condomit-assembly-recordings/101/../../private.mp4'
        with self.assertRaises(ValueError): recording_path(self.row)

    def test_pending(self):
        self.assertTrue(should_process(self.row, self.now))

    def test_never_reprocess_completed_local(self):
        self.row.update(transcription_status='concluido', transcription_model=MODEL_ID)
        self.assertFalse(should_process(self.row, self.now))

    def test_reprocess_old_gemini_even_if_failed(self):
        self.row.update(transcription_status='falhou', transcription_model='gemini-2.5-flash', transcription_attempts=6)
        self.assertTrue(should_process(self.row, self.now))

    def test_wait_for_worker_in_progress(self):
        self.row.update(transcription_status='processando', transcription_model=MODEL_ID,
                        transcription_started_at='2026-11-05T08:59:00+00:00')
        self.assertFalse(should_process(self.row, self.now))

    def test_dont_invent_speaker(self):
        rows = transcript_rows(self.row, '09999999', [{'start': 1.2, 'end': 3.4, 'text':'Bom dia.'}])
        self.assertEqual(rows[0]['participant_name'], 'Falante não identificado')
        self.assertEqual(rows[0]['participant_identity'], None)
        self.assertEqual(rows[0]['transcript'], 'Bom dia.')
        self.assertEqual(rows[0]['spoken_at'], '2026-11-05T09:00:01+00:00')


if __name__ == '__main__': unittest.main()
