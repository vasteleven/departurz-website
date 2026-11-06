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
await ok('setup creates the sheets, folders, books and the owner', async () => {
  await import('./setup.mjs');
  const c = mock.store.sheets[process.env.CLIENTS_SHEET_ID], t = mock.store.sheets[process.env.TEAM_SHEET_ID];
  assert.deepEqual(Object.keys(c), ['Clients', 'Projects', 'Milestones', 'Needs', 'Invoices', 'Events', 'Documents', 'Reviews']);
  assert.ok(Object.keys(t).includes('Cuts'));
  assert.equal(t.Team[1][0], 'nate@departurz.example');
  assert.equal(t.Team[1][t.Team[0].indexOf('admin')], 'owner');
  const books = mock.store.sheets[process.env.BOOKS_SHEET_ID];
  assert.deepEqual(Object.keys(books), ['Summary', 'Money in', 'Crew pay', 'Expenses', 'Settings']);
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

let C, T, N, R, H;
await ok('email sign-in for a client, crew member and admin', async () => {
  const before = mock.store.mail.length;
  await call('POST', 'auth/email', { email: 'nobody@else.com' });
  assert.equal(mock.store.mail.length, before, 'no email for strangers');
  C = await signIn('jordan@lumencoffee.example'); T = await signIn('amara@crew.example'); N = await signIn('nate@departurz.example');
  R = await signIn('rae@departurz.example'); H = await signIn('hana@crew.example');
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
await ok('privacy: crew never see the client, the client never sees the crew', async () => {
  const a = (await call('GET', 'portal', null, T)).data.data;
  const txt = JSON.stringify(a);
  assert.ok(!/lumen|jordan|ghana/i.test(txt), 'no client name, email or project title anywhere in a crew member\'s data');
  assert.ok(!a.channels.some(c => c.kind === 'client'), 'no client threads');
  assert.deepEqual(a.projects.map(p => p.label), ['Project Ember'], 'only their own project, by code name');
  assert.ok(a.events.some(e => /^Project Ember: Pickup shots/.test(e.title)), 'confirmed shoot days reach the crew');
  assert.ok(!a.events.some(e => /Studio session|launch party/i.test(e.title)), 'unconfirmed client requests do not');
  const h = (await call('GET', 'portal', null, H)).data.data;
  assert.deepEqual(h.projects.map(p => p.code), ['DPZ-0150']);
  assert.ok(!JSON.stringify(h).includes('DPZ-0142'), 'nothing from projects they are not on');
  const c = (await call('GET', 'portal', null, C)).data.data;
  assert.equal(c.project.lead, 'Nate');
  assert.ok(!/amara|kofi|hana|rae/i.test(JSON.stringify(c)), 'no crew names on the client side');
});
await ok('roles: the manager runs the Desk but never sees money or client messages', async () => {
  const r = (await call('GET', 'portal', null, R)).data.data;
  assert.equal(r.admin, undefined, 'no money');
  assert.equal(r.me.access, 'manager');
  assert.ok(!r.channels.some(c => c.kind === 'client'), 'no client threads');
  assert.ok(r.desk.requests.length >= 2 && r.desk.tasks.length && r.desk.crew.length);
  assert.ok(!JSON.stringify(r.desk).match(/amount|\$\d/), 'nothing about money on the Desk');
  const n = (await call('GET', 'portal', null, N)).data.data;
  assert.ok(n.desk && n.admin && 'books' in n.admin, 'the owner gets the Desk, the money and the books');
  assert.equal((await call('POST', 'admin/payout/approve', { id: 'p2' }, R)).status, 403);
  assert.equal((await call('POST', 'books/sync', {}, R)).status, 403);
  assert.equal((await call('GET', 'portal?as=jordan@lumencoffee.example', null, R)).status, 403);
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'x' }, R)).status, 403);
  assert.equal((await call('POST', 'desk/task', { title: 'x', assignee: 'hana@crew.example' }, T)).status, 403, 'crew cannot assign');
});
await ok('desk: bookings, tasks and who is on a project', async () => {
  const req = (await call('GET', 'portal', null, R)).data.data.desk.requests.find(e => /Studio session/.test(e.title));
  const before = mock.store.mail.length;
  assert.equal((await call('POST', 'desk/booking', { id: req.id, action: 'confirm' }, R)).data.status, 'confirmed');
  assert.ok(mock.store.mail.slice(before).some(m => m.to[0] === 'jordan@lumencoffee.example' && /Confirmed: Studio session/.test(m.subject)));
  const a = (await call('GET', 'portal', null, T)).data.data;
  assert.ok(a.events.some(e => e.title === 'Project Ember: Studio session'), 'confirmed bookings reach the crew');
  const cl = (await call('GET', 'portal', null, C)).data.data;
  assert.equal(cl.events.find(e => e.title === 'Studio session').status, 'confirmed');
  assert.equal((await call('POST', 'desk/task', { title: 'Grade the market scene', assignee: 'hana@crew.example', project: 'DPZ-0150' }, R)).status, 200);
  assert.ok(mock.store.mail.some(m => m.to[0] === 'hana@crew.example' && /New task: Grade the market scene/.test(m.subject)));
  assert.ok((await call('GET', 'portal', null, H)).data.data.tasks.some(t => t.title === 'Grade the market scene'));
  assert.equal((await call('POST', 'desk/project', { code: 'DPZ-0150', crew: ['hana@crew.example', 'amara@crew.example'], codeName: 'Project Kente' }, R)).status, 200);
  const a2 = (await call('GET', 'portal', null, T)).data.data;
  assert.deepEqual(a2.projects.map(p => p.label).sort(), ['Project Ember', 'Project Kente']);
});
await ok('review room: the client watches, notes on the frame, and asks for changes', async () => {
  const list = (await call('GET', 'room', null, C)).data;
  assert.equal(list.room, 'client');
  assert.equal(list.items.length, 1, 'the earlier single cut moved into the room');
  const key = list.items[0].key;
  const it = (await call('GET', 'room/item?key=' + key, null, C)).data;
  assert.equal(it.type, 'video');
  const k = new URL(it.media, 'http://test.local').searchParams.get('k');
  const u = new URL('http://test.local/api/p'); u.searchParams.set('r', 'media'); u.searchParams.set('k', k);
  const piece = await api.GET(new Request(u, { headers: { range: 'bytes=0-99' } }));
  assert.equal(piece.status, 206); assert.equal((await piece.arrayBuffer()).byteLength, 100);
  assert.equal((await call('GET', 'media?k=' + k.replace(/.$/, k.endsWith('A') ? 'B' : 'A'))).status, 403, 'tampered links are refused');
  assert.equal((await call('POST', 'room/note', { item: key, text: 'Logo comes in late here', t: 4.2 }, C)).data.note.who, 'You');
  assert.equal((await call('POST', 'room/note', { item: key, text: 'x' }, T)).status, 403, 'editors read client notes, they do not write them');
  const ed = (await call('GET', 'room?room=editors', null, T)).data;
  const seen = (await call('GET', 'room/item?key=' + key, null, T)).data;
  assert.equal(seen.notes[0].who, 'Client', 'editors see the note signed Client');
  assert.ok(ed.items.some(i => i.key === key));
  assert.equal((await call('GET', 'room/item?key=' + key, null, H)).status, 404, 'not on the project, not in the room');
  assert.equal((await call('GET', 'room', null, T)).status, 403, 'the client room is for Nate and managers');
  const before = mock.store.mail.length;
  assert.equal((await call('POST', 'room/decide', { item: key, action: 'changes' }, C)).data.status, 'changes');
  assert.ok(mock.store.mail.slice(before).some(m => /^Changes:/.test(m.subject) && /0:04/.test(m.html)));
  assert.equal((await call('POST', 'room/decide', { item: key, action: 'approve' }, C)).status, 403, 'decided once');
});
await ok('editors room: a cut goes to Nate, then to the client', async () => {
  assert.equal((await call('POST', 'upload/start', { cut: 'DPZ-0142', name: 'Teaser v2.mp4', size: 10, type: 'video/mp4' }, H)).status, 403, 'only crew on the project');
  const s = await call('POST', 'upload/start', { cut: 'DPZ-0142', name: 'Teaser v2.mp4', size: 10, type: 'video/mp4', note: 'Pour lands later now' }, T);
  const fin = JSON.parse(mock.handleUpload(s.data.url.split('/').pop(), 'bytes 0-9/10', 10).body);
  const done = (await call('POST', 'upload/done', { ticket: s.data.ticket, id: fin.id }, T)).data;
  assert.ok(done.cut);
  assert.ok(mock.store.mail.some(m => /^New cut: Teaser v2 \(DPZ-0142\)/.test(m.subject)));
  const key = 'cut:' + done.cut;
  assert.equal((await call('GET', 'room/item?key=' + key, null, C)).status, 404, 'clients never see the editors room');
  assert.equal((await call('POST', 'room/note', { item: key, text: 'Trim the opener', t: 1 }, N)).status, 200);
  assert.equal((await call('POST', 'room/decide', { item: key, action: 'approve' }, R)).status, 403, 'only Nate approves cuts');
  assert.equal((await call('POST', 'room/send', { item: key }, R)).status, 403, 'only Nate sends to clients');
  const before = mock.store.mail.length;
  const sent = (await call('POST', 'room/send', { item: key, title: 'Teaser 15s' }, N)).data;
  assert.ok(sent.review && sent.emailed);
  assert.ok(mock.store.mail.slice(before).some(m => m.to[0] === 'jordan@lumencoffee.example' && /Ready for your notes: Teaser 15s v1/.test(m.subject)));
  const room = (await call('GET', 'room', null, C)).data;
  assert.equal(room.items.length, 2);
  assert.equal(room.rounds.used, 1);
  const n = (await call('GET', 'room/item?key=' + room.items[0].key, null, C)).data;
  assert.equal(n.notes.length, 0, 'editors-room notes never travel to the client');
  assert.equal((await call('POST', 'room/decide', { item: room.items[0].key, action: 'approve' }, C)).data.status, 'approved');
});
await ok('books: rebuilt from paid invoices and crew pay, and downloadable for Numbers', async () => {
  const r = await call('POST', 'books/sync', {}, N);
  assert.equal(r.status, 200);
  const b = mock.store.sheets[r.data.id];
  assert.equal(b['Money in'].length, 2, 'one paid invoice');
  assert.match(String(b['Money in'][1][7]), /^=IFERROR/);
  assert.ok(b.Summary.some(row => String(row[1] || '').startsWith('=SUMIFS(')));
  const x = await call('GET', 'books/xlsx', null, N);
  assert.equal(x.status, 200); assert.match(x.headers.get('content-disposition'), /DEPARTURZ Books/);
  assert.equal((await call('GET', 'books/xlsx', null, R)).status, 403);
});
await ok('the /setup page: locked by the setup key, then Google connects the Drive and builds everything', async () => {
  process.env.SETUP_KEY = 'a-long-setup-phrase-for-tests';
  const st = (await call('GET', 'setup/status')).data;
  assert.equal(st.key, true); assert.equal(st.google, true);
  assert.equal((await call('POST', 'setup/start', { key: 'wrong', email: 'nate@departurz.example' })).status, 403);
  const s = await call('POST', 'setup/start', { key: 'a-long-setup-phrase-for-tests', email: 'nate@departurz.example', name: 'Nate' });
  const u = new URL(s.data.url);
  assert.equal(u.hostname, 'accounts.google.com'); assert.match(u.searchParams.get('scope'), /auth\/drive/);
  assert.equal((await call('GET', 'setup/google?state=nope&code=x')).status, 400, 'unknown state is refused');
  const done = await call('GET', 'setup/google?state=' + u.searchParams.get('state') + '&code=abc');
  assert.equal(done.status, 200); assert.match(done.data, /The portal is set up/); assert.match(done.data, /departurzedits@gmail\.com/);
  const { kv } = await import('../api/_lib/kv.js');
  const cfg = JSON.parse(await kv.get('cfg:portal'));
  assert.equal(cfg.GOOGLE_REFRESH_TOKEN, 'rt-abc'); assert.equal(cfg.CLIENTS_SHEET_ID, 'clients-sheet');
  assert.equal((await call('GET', 'setup/google?state=' + u.searchParams.get('state') + '&code=abc')).status, 400, 'a setup link works once');
  process.env.GOOGLE_REFRESH_TOKEN = 'x';
});
await ok('chat: client thread, crew DMs, and nobody reads what isn\'t theirs', async () => {
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'Hi' }, C)).status, 200);
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'Hey!' }, N)).status, 200);
  assert.equal((await call('POST', 'messages', { c: 'client-DPZ-0142', text: 'x' }, T)).status, 403);
  assert.equal((await call('GET', 'messages?c=ch-general', null, C)).status, 403);
  const m = await call('GET', 'messages?c=client-DPZ-0142', null, C);
  assert.deepEqual(m.data.msgs.slice(-2).map(x => x.from), ['me', 'Nate']);
  assert.ok(m.data.msgs.some(x => /^Asked for changes on Teaser 15s, draft v1/.test(x.text)), 'review decisions land in their thread');
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
  // the portal guide is always first; the thank-you letter only comes once the project is delivered
  assert.deepEqual(d.map(x => x.ref), ['DPZ-0142-GUIDE', 'DPZ-0142-D1', 'DPZ-0142-D2', 'DPZ-0142-D3', 'DPZ-0142-D4', 'DPZ-0142-D5']);
  assert.equal(d[0].url, '/docs/DEPARTURZ-Portal-Guide.pdf');
  assert.equal(d[5].kind, 'guide');
  assert.ok(!d.some(x => x.ref.endsWith('-THANKS')), 'no thank-you letter before delivery');
  const { delivered } = await import('../api/_lib/client.js');
  assert.ok(delivered({ status: 'Delivered' }) && !delivered({ status: 'In the edit' }));
  assert.notEqual((await call('POST', 'docs/accept', { ref: 'DPZ-0142-GUIDE', name: 'Jordan Rivera', agree: true }, C)).status, 200, 'the guide is not a sheet row');
  assert.equal((await call('GET', 'file?id=' + guide, null, C)).status, 200);
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D4', name: 'Jordan Rivera' }, C)).status, 400, 'must tick the box');
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D4', name: 'Jordan Rivera', agree: true }, C)).status, 200);
  assert.equal((await call('POST', 'docs/accept', { ref: 'DPZ-0142-D1', name: 'Jordan Rivera', agree: true }, C)).status, 409);
  const again = await call('GET', 'portal', null, C);
  assert.equal(again.data.data.documents.length, 6, 'no duplicates on the next load');
  assert.equal(again.data.data.documents[4].status, 'signed');
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
  const morning = mock.store.mail.filter(m => /^Your day/.test(m.subject));
  assert.equal(morning.length, 1); assert.equal(morning[0].to[0], 'nate@departurz.example');
  assert.match(morning[0].html, /Booking request: <b>Café launch party/);
  const b = await (await cron.GET(new Request('http://test.local/api/cron', { headers: { authorization: 'Bearer cron' } }))).json();
  assert.deepEqual(b.sent, [], 'nothing sent twice');
});
await ok('sign out ends the session', async () => {
  await call('POST', 'auth/logout', {}, C);
  assert.equal((await call('GET', 'portal', null, C)).status, 401);
});
console.log(`\n  ${pass} checks passed${process.exitCode ? ', some failed' : ''}.\n`);
