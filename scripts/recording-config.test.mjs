import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingNotice } from './report-recording-config.mjs';
test('recording configuration is an informational CI notice, with no blocking production gate', () => {
  assert.match(recordingNotice('RadioRecording: { Enabled: true }'), /ENABLED/);
  assert.match(recordingNotice('RadioRecording: { Enabled: false }'), /disabled/);
  assert.match(recordingNotice(''), /not detected/);
  assert.doesNotMatch(recordingNotice('RadioRecording: { Enabled: true }'), /::warning|::error/);
});
