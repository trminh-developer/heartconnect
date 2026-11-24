import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_API_URL, resolveApiBaseUrl } from '../../frontend/src/config/network';

test('hosted and development frontends keep login cookies on their API proxy with either legacy or current configuration', () => {
  for (const hostname of ['heartconnect.vercel.app', 'localhost', '127.0.0.1', '192.168.1.10', 'heartconnect.devtunnels.ms']) {
    for (const configured of [undefined, '/api', DEFAULT_API_URL, 'https://heartconnect-qa29.onrender.com/api/']) {
      assert.equal(resolveApiBaseUrl(configured, false, hostname), '/api', `${hostname}: ${configured}`);
    }
  }
  assert.equal(resolveApiBaseUrl(undefined, true, 'dev.example.test'), '/api');
});

test('a custom frontend domain uses the current API while preserving an explicit custom backend', () => {
  assert.equal(resolveApiBaseUrl(undefined, false, 'heartconnect.example.test'), 'https://heartconnect-api.vercel.app/api');
  assert.equal(resolveApiBaseUrl('https://heartconnect-qa29.onrender.com/api', false, 'heartconnect.example.test'), DEFAULT_API_URL);
  assert.equal(resolveApiBaseUrl('/api', false, 'heartconnect.example.test'), '/api');
  assert.equal(resolveApiBaseUrl('https://custom-api.example.test/api/', false, 'heartconnect.example.test'), 'https://custom-api.example.test/api');
});
