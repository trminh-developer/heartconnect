import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { Router } from 'express';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';
process.env.SQLITE_STORAGE = ':memory:';

let server: Server, origin: string;
let document: typeof import('../src/docs/openapi').openApiDocument;
let models: typeof import('../src/models');

before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const { createApp } = await import('../src/app');
  server = createApp(() => false).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(origin + '/openapi.json');
  assert.equal(response.status, 200);
  document = await response.json() as typeof document;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (models) await models.sequelize.close();
});

test('Swagger loads local assets and the OpenAPI document even while the database is starting', async () => {
  for (const path of ['/docs', '/docs/']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.match(html, /id="swagger-ui"/);
    assert.ok(!html.includes('https://'), 'Swagger assets must load from this backend');
    const policy = response.headers.get('content-security-policy') || '';
    assert.match(policy, /script-src 'self'/);
    assert.ok(!policy.includes('upgrade-insecure-requests'), 'HTTP localhost assets must not be upgraded to HTTPS');
  }
  for (const [path, contentType] of [
    ['/docs/assets/swagger-ui.css', /text\/css/],
    ['/docs/assets/swagger-ui-bundle.js', /(?:application|text)\/javascript/],
    ['/docs/swagger-initializer.js', /(?:application|text)\/javascript/],
  ] as const) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', contentType);
    await response.arrayBuffer();
  }
  assert.equal((await fetch(origin + '/api/health')).status, 503);
  assert.equal(document.openapi, '3.0.3');
  assert.deepEqual(document.servers, [{ url: '/api', description: 'Backend đang mở trang tài liệu này' }]);
});

const canonical = (path: string) => path.replace(/:[^/]+|\{[^}]+\}/g, '{}');
test('the OpenAPI operations cover every mounted business route without ambiguous path templates', async () => {
  const [{ initAuthModule }, { initPaymentModule }, users, matches, messages, feed, notifications, admin, stories, calls] = await Promise.all([
    import('../src/features/auth/AuthModule'), import('../src/features/payment/di/PaymentModule'),
    import('../src/features/user/UserModule'), import('../src/features/match/MatchModule'),
    import('../src/features/message/MessageModule'), import('../src/features/feed/FeedModule'),
    import('../src/features/notification/NotificationModule'), import('../src/features/admin/AdminModule'), import('../src/features/story/StoryModule'),
    import('../src/features/call/CallModule'),
  ]);
  const actual = new Set<string>();
  for (const [prefix, router] of [
    ['/auth', initAuthModule()], ['/payments', initPaymentModule()],
    ['', users.default], ['', matches.default], ['', messages.default], ['', feed.default], ['', notifications.default], ['', admin.default], ['', stories.default],
    ['', calls.default],
  ] as [string, Router][]) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const path = (prefix + layer.route.path).replace(/^\/api/, '');
      for (const [method, enabled] of Object.entries(layer.route.methods)) if (enabled) actual.add(method + ' ' + canonical(path));
    }
  }
  const documented = new Set<string>(), templates = new Set<string>(), operationIds = new Set<string>();
  for (const [path, methods] of Object.entries(document.paths)) {
    const template = canonical(path);
    assert.ok(!templates.has(template), 'Ambiguous OpenAPI path template: ' + path);
    templates.add(template);
    for (const [method, operation] of Object.entries(methods)) {
      documented.add(method + ' ' + template);
      assert.ok(!operationIds.has(operation.operationId), 'Duplicate operationId');
      operationIds.add(operation.operationId);
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual((operation.parameters ?? []).filter((p: any) => p.in === 'path' && p.required).map((p: any) => p.name).sort(), names);
    }
  }
  assert.deepEqual([...documented].sort(), [...actual].sort());
});

test('all schema references resolve and authentication and placeholder APIs are described explicitly', () => {
  function checkReferences(value: any) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.match(value.$ref, /^#\//);
      const resolved = value.$ref.slice(2).split('/').reduce((current: any, key: string) => current?.[key], document);
      assert.ok(resolved, 'Unresolved reference: ' + value.$ref);
    }
    for (const child of Object.values(value)) checkReferences(child);
  }
  checkReferences(document);
  assert.deepEqual(document.paths['/auth/login'].post.security, []);
  assert.deepEqual(document.paths['/auth/me'].get.security, [{ bearerAuth: [] }, { cookieAuth: [] }]);
  for (const path of ['forgot-password', 'verify-otp', 'reset-password']) assert.equal(document.paths['/auth/' + path].post.deprecated, true);
  assert.ok(document.paths['/auth/login'].post.responses['400']);
  assert.ok(document.paths['/auth/login'].post.responses['200']);
});
