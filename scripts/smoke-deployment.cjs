// Read-only deployment checks, including protected routes without a session.
// Usage: npm run smoke:deployment -- https://heartconnect.vercel.app [expected-backend-commit]
const base = (process.argv[2] || 'https://heartconnect.vercel.app').replace(/\/+$/, '');
const expectedCommit = process.argv[3];
const checks = [
  ['GET', '/api/health', 200], ['GET', '/api/users/recommended?limit=1', 200],
  ['GET', '/api/users/search?q=smoke-deployment-check', 200], ['GET', '/api/feed/all?limit=1', 200],
  ['GET', '/api/payments/methods', 200],
  ['GET', '/api/calls/config', 401], ['GET', '/api/calls/incoming', 401], ['POST', '/api/calls', 401],
  ['GET', '/api/stories', 401], ['POST', '/api/stories', 401],
  ['GET', '/api/users/discover', 401], ['PUT', '/api/users/smoke-test', 401],
  ['POST', '/api/users/report', 401], ['POST', '/api/users/smoke-test/verification', 401],
  ['GET', '/api/messages/conversations/smoke-test', 401], ['GET', '/api/messages/smoke-test', 401],
  ['POST', '/api/messages', 401], ['PUT', '/api/messages/smoke-test/read', 401],
  ['GET', '/api/matches/smoke-test', 401], ['POST', '/api/matches/like', 401],
  ['GET', '/api/notifications/smoke-test', 401], ['GET', '/api/notifications/unread-count/smoke-test', 401],
  ['GET', '/api/admin/overview', 401], ['GET', '/api/admin/analytics', 401],
  ['GET', '/api/admin/users', 401], ['GET', '/api/admin/feed', 401],
  ['GET', '/api/admin/reports', 401], ['GET', '/api/admin/verifications', 401], ['GET', '/api/admin/settings', 401],
  ['POST', '/api/payments/bank/create', 401], ['GET', '/api/payments/bank/pending', 401],
];
async function check([method, pathname, expected]) {
  try {
    const response = await fetch(base + pathname, {
      method, signal: AbortSignal.timeout(45000),
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    });
    const json = await response.json().catch(() => null);
    let ok = response.status === expected && json !== null;
    let error = ok ? undefined : json?.error || 'Unexpected status or non-JSON response';
    if (pathname === '/api/health' && ok) {
      ok = json.status === 'OK' && json.apiVersion === 2 && (!expectedCommit || json.commit === expectedCommit);
      if (!ok) error = 'Backend is running an old API or a different commit';
    }
    if (pathname === '/api/payments/methods' && ok) {
      ok = Array.isArray(json.plans) && json.plans.length === 3;
      if (!ok) error = 'Payment methods or premium plans are missing';
    }
    return { method, pathname, expected, status: response.status, ok, ...(error ? { error } : {}), ...(pathname === '/api/health' ? { commit: json?.commit ?? null, apiVersion: json?.apiVersion ?? null } : {}) };
  } catch (error) { return { method, pathname, expected, ok: false, error: error.message }; }
}
(async () => {
  const results = [];
  for (let offset = 0; offset < checks.length; offset += 4) results.push(...await Promise.all(checks.slice(offset, offset + 4).map(check)));
  for (const result of results) console.log(JSON.stringify(result));
  const failed = results.filter(result => !result.ok).length;
  console.log(JSON.stringify({ base, checked: results.length, passed: results.length - failed, failed }));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
