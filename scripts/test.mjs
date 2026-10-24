// npm test: runs the portal end to end against pretend Google, Drive and email. Nothing real is touched.
import assert from 'node:assert/strict';

Object.assign(process.env, {
  DPZ_TEST: '1', SESSION_SECRET: 'test-secret-test-secret-test-secret', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_DRIVE_CLIENT_ID: 'x',
  GOOGLE_REFRESH_TOKEN: 'x', RESEND_API_KEY: 'x', PORTAL_URL: 'http://test.local', CRON_SECRET: 'cron', UPSTASH_REDIS_REST_URL: '', KV_REST_API_URL: '',
  CLIENTS_SHEET_ID: '', TEAM_SHEET_ID: '', KIT_API_KEY: ''
});
const mock = await import('./mock-google.mjs');
mock.install('http://test.local');
let pass = 0;
const ok = (name, fn) => fn().then(() => { pass++; console.log('  ✓ ' + name); }, e => { console.error('  ✗ ' + name + '\n    ' + (e.stack || e)); process.exitCode = 1; });

/* 1. setup builds the sheets and folders */
process.argv.push('--admin', 'nate@departurz.example', '--name', 'Nate');
await ok('setup creates both sheets, folders and the admin', async () => {
  await import('./setup.mjs');
  const c = mock.store.sheets[process.env.CLIENTS_SHEET_ID], t = mock.store.sheets[process.env.TEAM_SHEET_ID];
  assert.deepEqual(Object.keys(c), ['Clients', 'Projects', 'Milestones', 'Needs', 'Invoices', 'Events', 'Documents']);
  assert.equal(t.Team[1][0], 'nate@departurz.example');
  assert.equal(c.Projects[1][0], 'DPZ-0001');
  assert.ok(process.env.CLIENTS_FOLDER_ID && process.env.TEAM_FOLDER_ID);
});

/* 2. now run the API on the richer demo data */
const { demo } = await import('./demo-data.mjs');
const d = demo();
mock.seedSheet('clients-sheet', d.clients); mock.seedSheet('team-sheet', d.team);
process.env.CLIENTS_SHEET_ID = 'clients-sheet'; process.env.TEAM_SHEET_ID = 'team-sheet';
const proj = mock.addFolder('DPZ-0142 · Lumen', process.env.CLIENTS_FOLDER_ID);
const cut = mock.addFile('Teaser v1.mp4', mock.addFolder('From DEPARTURZ', proj), 1000, 'video/mp4');
const P = mock.store.sheets['clients-sheet'].Projects; P[1][P[0].indexOf('drive_folder_id')] = proj; P[1][P[0].indexOf('review_file_id')] = cut;

const api = await import('../api/p.js');
const { bust } = await import('../api/_lib/roster.js');
bust();
const call = async (method, path, body, cookie) => {
  const u = new URL('http://test.local/api/p'); const [r, q] = path.split('?'); u.searchParams.set('r', r);
  if (q) new URLSearchParams(q).forEach((v, k) => u.searchParams.set(k, v));
  const isForm = typeof body === 'string';
  const res = await api[method](new Request(u, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': isForm ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }));
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
};
async function signIn(email) {
  await call('POST', 'auth/email', { email });
  const m = mock.store.mail.filter(x => x.to[0] === email).pop();
  const t = decodeURIComponent(m.html.match(/t=([^"&]+)/)[1]);
  const r = await call('POST', 'auth/verify', 't=' + encodeURIComponent(t));
  assert.equal(r.status, 303);
  const again = await call('POST', 'auth/verify', 't=' + encodeURIComponent(t));
  assert.match(again.headers.get('location'), /expired/, 'a link only works once');
  return r.headers.get('set-cookie').split(';')[0];
}

let C, T, N;
await ok('email sign-in for a client, crew member and admin', async () => {
  const before = mock.store.mail.length;
  await call('POST', 'auth/email', { email: 'nobody@else.com' });
  assert.equal(mock.store.mail.length, before, 'no email for strangers');
  C = await signIn('jordan@lumencoffee.example'); T = await signIn('amara@crew.example'); N = await signIn('nate@departurz.example');
});
await ok('signed-out requests are refused', async () => { assert.equal((await call('GET', 'portal')).status, 401); });
await ok('client portal data', async () => {
  const r = await call('GET', 'portal', null, C);
  assert.equal(r.data.side, 'client');
  assert.equal(r.data.data.project.code, 'DPZ-0142');
  assert.equal(r.data.data.deliverables[0].tag, 'Review');
  assert.equal(r.data.data.invoices.filter(i => i.status === 'due').length, 2);
});
await ok('crew and admin portal data', async () => {
  const t = await call('GET', 'portal', null, T); assert.equal(t.data.side, 'team'); assert.equal(t.data.data.admin, undefined);
  const n = await call('GET', 'portal', null, N); assert.ok(n.data.data.admin); assert.ok(n.data.data.channels.some(c => c.kind === 'client'));
  assert.equal((await call('GET', 'portal?as=jordan@lumencoffee.example', null, T)).status, 403);
  assert.equal((await call('GET', 'portal?as=jordan@lumencoffee.example', null, N)).data.side, 'client');
});
await ok('chat: client thread, crew DMs, and nobody reads what isn\'t theirs', async () => {
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'Hi' }, C)).status, 200);
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'Hey!' }, N)).status, 200);
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'x' }, T)).status, 403);
  assert.equal((await call('GET', 'messages?c=ch-general', null, C)).status, 403);
  const m = await call('GET', 'messages?c=client-DPZ-0142', null, C);
  assert.deepEqual(m.data.msgs.map(x => x.from), ['me', 'Nate']);
  assert.equal((await call('POST', 'messages', 'c=x&text=y', C)).status, 415, 'non-JSON posts are refused');
});
await ok('uploads land in the project folder and check-in items get marked', async () => {
  const s = await call('POST', 'upload/start', { need: 'n2', name: 'songs.txt', size: 10, type: 'text/plain' }, C);
  const sid = s.data.url.split('/').pop();
  const fin = JSON.parse(mock.handleUpload(sid, 'bytes 0-9/10', 10).body);
  assert.equal((await call('POST', 'upload/done', { ticket: s.data.ticket, id: fin.id }, T)).status, 403, 'tickets are per person');
  assert.equal((await call('POST', 'upload/done', { ticket: s.data.ticket, id: fin.id }, C)).status, 200);
  assert.equal((await call('POST', 'needs/submit', { id: 'n2', files: [{ id: fin.id, name: 'songs.txt' }] }, C)).status, 200);
  const r = await call('GET', 'portal', null, C);
  assert.equal(r.data.data.needs.find(n => n.id === 'n2').status, 'received');
  assert.equal((await call('GET', 'file?id=' + fin.id, null, C)).status, 200);
  assert.equal((await call('GET', 'file?id=' + cut, null, C)).status, 200);
});
await ok('documents are numbered under the confirmation and can be accepted', async () => {
  const docs = Object.values(mock.store.files).find(f => f.name === 'Documents' && f.parents.includes(proj)).id;   // made on the first portal load
  const guide = mock.addFile('Domain setup guide.pdf', docs, 1000, 'application/pdf');
  const r = await call('GET', 'portal', null, C);
  const d = r.data.data.documents;
  assert.deepEqual(d.map(x => x.ref), ['DPZ-0142-D1', 'DPZ-0142-D2', 'DPZ-0142-D3', 'DPZ-0142-D4', 'DPZ-0142-D5']);
  assert.equal(d[4].kind, 'guide');
  assert.equal((await call('GET', 'file?id=' + guide, null, C)).status, 200);
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D4', name: 'Jordan Rivera' }, C)).status, 400, 'must tick the box');
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D4', name: 'Jordan Rivera', agree: true }, C)).status, 200);
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D1', name: 'Jordan Rivera', agree: true }, C)).status, 409);
  const again = await call('GET', 'portal', null, C);
  assert.equal(again.data.data.documents.length, 5, 'no duplicates on the next load');
  assert.equal(again.data.data.documents[3].status, 'signed');
});
await ok('crew actions and admin pay', async () => {
  assert.equal((await call('POST', 'tasks/toggle', { id: 't2' }, T)).data.status, 'done');
  assert.equal((await call('POST', 'tasks/toggle', { id: 't2' }, C)).status, 403);
  const h = await call('POST', 'hours', { project: 'Lumen', days: 1, extra: 0, note: 'v2' }, T);
  assert.equal(h.data.amount, 350);
  assert.equal((await call('POST', 'admin/payout/approve', { id: h.data.id }, T)).status, 403);
  assert.equal((await call('POST', 'admin/payout/approve', { id: h.data.id }, N)).status, 200);
  assert.equal((await call('POST', 'admin/payout/paid', { id: h.data.id }, N)).status, 200);
  assert.equal((await call('POST', 'payout-method', { method: 'Wise', detail: '0123456789012' }, T)).status, 400, 'no full account numbers');
});
await ok('About page crew: only published profiles, no emails, photos for the right people', async () => {
  const r = await call('GET', 'crew');
  assert.deepEqual(r.data.crew.map(m => [m.name, m.department]), [['Amara Okafor', 'editors']]);
  assert.ok(!JSON.stringify(r.data).includes('@crew.example'), 'emails stay private');
  const s = await call('POST', 'upload/start', { folder: 'Profile photos', name: 'me.jpg', size: 10, type: 'image/jpeg' }, T);
  const fin = JSON.parse(mock.handleUpload(s.data.url.split('/').pop(), 'bytes 0-9/10', 10).body);
  await call('POST', 'upload/done', { ticket: s.data.ticket, id: fin.id }, T);
  assert.equal((await call('POST', 'profile', { photo: fin.id }, N)).status, 400, 'nobody else can use your upload');
  assert.equal((await call('POST', 'profile', { photo: fin.id }, T)).status, 200);
  const photo = (await call('GET', 'crew')).data.crew[0].photo;
  assert.equal((await call('GET', photo.replace('/api/p/', ''))).status, 200);
});
await ok('daily letters go out once', async () => {
  const cron = await import('../api/cron.js');
  assert.equal((await cron.GET(new Request('http://test.local/api/cron'))).status, 401);
  const a = await (await cron.GET(new Request('http://test.local/api/cron', { headers: { authorization: 'Bearer cron' } }))).json();
  assert.ok(a.sent.length > 0, 'something was due');
  const b = await (await cron.GET(new Request('http://test.local/api/cron', { headers: { authorization: 'Bearer cron' } }))).json();
  assert.deepEqual(b.sent, [], 'nothing sent twice');
});
await ok('sign out ends the session', async () => {
  await call('POST', 'auth/logout', {}, C);
  assert.equal((await call('GET', 'portal', null, C)).status, 401);
});
console.log(`\n  ${pass} checks passed${process.exitCode ? ', some failed' : ''}.\n`);
