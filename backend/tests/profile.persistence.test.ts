import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
test('profile edits are committed to disk and searchable after a separate backend process starts', async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, 'heartconnect-profile-persistence-'));
  assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
  const environment = { ...process.env, NODE_ENV: 'test', USE_MOCK_DB: 'true', REQUIRE_PERSISTENT_DB: '',
    SQLITE_STORAGE: path.join(directory, 'profile.sqlite'), JWT_SECRET: 'profile-persistence-test', SENTRY_DSN: '' };
  const common = `
    const assert = require('node:assert/strict');
    const { once } = require('node:events');
    const jwt = require('jsonwebtoken');
    const models = require('./src/models/index.ts');
    const { createApp } = require('./src/app.ts');
    const id = '1c1b726a-a022-42e5-9638-965b6805def1';
    async function run(work) {
      let server;
      try {
        await models.sequelize.sync();
        server = createApp().listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port + '/api';
        const token = jwt.sign({ id }, process.env.JWT_SECRET);
        await work(base, { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
      } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await models.sequelize.close();
      }
    }
  `;
  try {
    await execute(process.execPath, ['--import', 'tsx', '--eval', common + `
      run(async (base, headers) => {
        await models.User.create({ id, username: 'persistent-person', email: 'persistence@example.test', password: 'unused-test-hash',
          first_name: 'Old name', last_name: '', last_active: new Date() });
        const saved = await fetch(base + '/users/' + id, { method: 'PUT', headers, body: JSON.stringify({
          firstName: 'Đặng', lastName: 'Thùy Linh', bio: 'Saved through the profile API', profession: 'Developer',
          location: { city: 'Đà Nẵng', country: 'Việt Nam' },
        }) });
        const body = await saved.json();
        assert.equal(saved.status, 200, body.error);
        const stored = await models.User.findByPk(id);
        assert.equal(stored.get('bio'), 'Saved through the profile API');
        assert.equal(stored.get('city'), 'Đà Nẵng');
        console.log('profile-committed');
      }).catch(error => { console.error(error); process.exitCode = 1; });
    `], { cwd: path.resolve(__dirname, '..'), env: environment, windowsHide: true, timeout: 45000 });
    const reopened = await execute(process.execPath, ['--import', 'tsx', '--eval', common + `
      run(async (base, headers) => {
        const response = await fetch(base + '/auth/me', { headers });
        assert.equal(response.status, 200);
        const user = await response.json();
        assert.equal(user.first_name, 'Đặng'); assert.equal(user.last_name, 'Thùy Linh');
        assert.equal(user.bio, 'Saved through the profile API'); assert.equal(user.profession, 'Developer');
        assert.equal(user.city, 'Đà Nẵng');
        for (const query of ['persistent-person', 'dang thuy linh']) {
          const result = await fetch(base + '/users/search?q=' + encodeURIComponent(query));
          assert.equal(result.status, 200);
          assert.ok((await result.json()).some(profile => profile.id === id));
        }
        console.log('profile-survived-backend-restart');
      }).catch(error => { console.error(error); process.exitCode = 1; });
    `], { cwd: path.resolve(__dirname, '..'), env: environment, windowsHide: true, timeout: 45000 });
    assert.match(reopened.stdout, /profile-survived-backend-restart/);
  } finally {
    // This is the exact task-created directory validated above, never a user database.
    await rm(directory, { recursive: true, force: true });
  }
});
