// Runs once a day (see vercel.json). Sends the letters nobody should have to remember to send:
//  - clients: items due from them (3 days and 1 day before, on the day, then gentle overdue nudges copied to wecreate@)
//  - clients: project updates when a stop on their timeline is done, a cut is ready for notes, and a thank-you when it lands
//  - crew: deadline reminders (2 days and 1 day before, on the day, then overdue nudges copied to wecreate@)
//  - crew: thank-you notes added to the Kudos tab
//  - Kit: enrolls any client not yet subscribed; checks open Square payment links
import { env, json, lower, today, daysBetween, esc, firstName, money } from './_lib/util.js';
import { load, patch, emails, isOff } from './_lib/roster.js';
import { send, NOTIFY } from './_lib/mail.js';
import { subscribe, setTag, TAGS } from './_lib/kit.js';
import { day, isActive, milestones, needId, syncDocs } from './_lib/client.js';
import { squareSweep } from './_lib/pay.js';
import { outFolder, docsFolder, clientInFolder } from './_lib/files.js';

const OVERDUE = [1, 3, 7, 14, 21, 28];
const portal = () => env('PORTAL_URL', 'https://departurz.com').replace(/\/$/, '') + '/portal-app.html';
const when = (d, td) => { const n = daysBetween(td, d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} ago`; };
const pretty = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

async function clientLetters(td, log) {
  const c = await load('clients', true);
  const person = e => c.Clients.find(r => lower(r.email) === lower(e)) || {};
  for (const p of c.Projects) {
    const to = emails(p.client_email);
    if (!to.length) continue;
    const lead = person(to[0]);
    const hi = `<p>Hi ${esc(firstName(lead.name))},</p>`;
    const active = isActive(p);

    // 0. every active project gets its Drive folders (From client, From DEPARTURZ) ready for files
    if (active && !p.drive_folder_id) {
      try { await outFolder(p); await clientInFolder(p); await docsFolder(p); log.push(`folders ${p.code}`); } catch (e) { log.push(`folders ${p.code} failed: ${e.message}`); }
    }

    // 0b. documents dropped into the Documents folder get their number; anything new is announced once
    if (active) {
      try {
        const docs = (await syncDocs(c, p)).filter(d => !d.notified_at && (!day(d.date) || daysBetween(d.date, td) <= 14));
        if (docs.length) {
          const sign = docs.filter(d => String(d.status).toLowerCase() === 'to sign');
          await send({
            to, subject: `${sign.length ? 'Please review: ' + sign[0].title : 'New in your portal: ' + (docs.length === 1 ? docs[0].title : docs.length + ' documents')} · ${p.code}`,
            heading: sign.length ? 'Ready for your signature' : 'New documents',
            html: hi + `<p>${sign.length ? 'There\'s something for you to review and accept.' : 'We added this to your portal.'} Everything is filed under your confirmation number <b>${esc(p.code)}</b>.</p><ul>${docs.map(d => `<li><b>${esc(d.title)}</b> <span style="color:#6B6A66">${esc(d.ref)}${String(d.status).toLowerCase() === 'to sign' ? ' · needs your signature' : ''}</span></li>`).join('')}</ul>`,
            cta: { label: 'Open Documents', url: portal() + '#/client/docs' }
          });
          const fresh = await load('clients', true);
          for (const d of docs) { const r = fresh.Documents.find(x => x.ref === d.ref); if (r) await patch('clients', 'Documents', r._row, { notified_at: td }); }
          log.push(`docs ${p.code}: ${docs.length}`);
        }
      } catch (e) { log.push(`docs ${p.code} failed: ${e.message}`); }
    }

    // 1. what we still need from them
    if (active) {
      const due = c.Needs.filter(n => String(n.project_code) === String(p.code) && lower(n.status) !== 'received' && day(n.due) && day(n.reminded_at) !== td)
        .filter(n => { const d = daysBetween(td, n.due); return [3, 1, 0].includes(d) || (d < 0 && OVERDUE.includes(-d)); });
      if (due.length) {
        const late = due.some(n => n.due < td);
        await send({
          to, cc: late ? NOTIFY() : undefined,
          subject: (late ? `Still waiting on ${due.length === 1 ? due[0].label : due.length + ' items'} for ${p.title || p.code}` : `Coming up: ${due.length === 1 ? due[0].label : due.length + ' items'} for ${p.title || p.code}`) + ` · ${p.code}`,
          heading: late ? 'A friendly nudge' : 'Heads up',
          html: hi + `<p>${late ? 'We are holding a spot in the schedule for these. The sooner they land, the sooner we keep moving:' : 'A quick reminder of what we need from you for <b>' + esc(p.title || p.code) + '</b>:'}</p><ul>${due.map(n => `<li><b>${esc(n.label)}</b>${n.detail ? ' · ' + esc(n.detail) : ''}<br><span style="color:${n.due < td ? '#C2412D' : '#6B6A66'}">Due ${esc(pretty(n.due))} (${when(n.due, td)})</span></li>`).join('')}</ul><p>Upload or paste them in your portal under Check-in. Any size works.</p>`,
          cta: { label: 'Open Check-in', url: portal() + '#/client/checkin' }
        });
        for (const n of due) await patch('clients', 'Needs', n._row, { reminded_at: td });
        log.push(`needs ${p.code}: ${due.length}`);
      }
    }

    // 2. timeline updates (only stops finished in the last two weeks, so a fresh setup doesn't flood anyone)
    if (!isOff(lead.updates)) {
      const ms = milestones(c, p.code);
      const rows = c.Milestones.filter(m => String(m.project_code) === String(p.code));
      const fresh = ms.filter((m, i) => m.state === 'done' && m.date && daysBetween(m.date, td) <= 14 && daysBetween(m.date, td) >= 0)
        .filter(m => { const r = rows.find(x => x.label === m.label && day(x.date) === m.date); return r && !r.notified_at; });
      if (fresh.length) {
        const next = ms.find(m => m.state === 'now' || m.state === 'next');
        await send({
          to, subject: `${p.title || 'Your project'}: ${fresh.map(m => m.label).join(', ')} done · ${p.code}`,
          heading: 'Project update',
          html: hi + fresh.map(m => `<p><b style="font-size:17px">${esc(m.label)}: done.</b>${m.note ? '<br>' + esc(m.note) : ''}</p>`).join('') + (next ? `<p style="color:#6B6A66">Next stop: <b style="color:#0A0A0A">${esc(next.label)}</b>${next.date ? ', ' + esc(pretty(next.date)) : ''}.</p>` : ''),
          cta: { label: 'See your timeline', url: portal() + '#/client/timeline' }
        });
        for (const m of fresh) { const r = rows.find(x => x.label === m.label && day(x.date) === m.date); if (r) await patch('clients', 'Milestones', r._row, { notified_at: td }); }
        log.push(`updates ${p.code}: ${fresh.length}`);
      }
    }

    // 3. a cut is ready for their notes
    if (p.review_file_id && String(p.review_notified) !== String(p.review_file_id)) {
      await send({ to, subject: `Ready for your notes: ${p.review_title || 'a new cut'} · ${p.code}`, heading: 'Your cut is ready', html: hi + `<p><b>${esc(p.review_title || 'A new cut')}</b> of ${esc(p.title || 'your project')} is up. Watch it, then approve it or send notes with timecodes right from the portal.</p>`, cta: { label: 'Watch it now', url: portal() + '#/client/timeline' } });
      await patch('clients', 'Projects', p._row, { review_notified: String(p.review_file_id), review_state: p.review_state || 'Waiting' });
      log.push(`review ${p.code}`);
    }

    // 4. delivered: a thank-you, and a door left open for the next one
    const delivered = (day(p.delivered_date) && p.delivered_date <= td) || /deliver|landed|complete/i.test(String(p.status || ''));
    if (delivered && !p.thanked_at) {
      if (!isOff(lead.thanks)) {
        await send({
          to, subject: `Thank you, ${firstName(lead.name)}`, heading: 'It landed. Thank you.',
          html: hi + `<p>${esc(p.title || 'Your project')} is delivered, and we loved making it with you. Everything is in your portal and stays there for you to download any time.</p><p>If it made you proud, the best thank-you is telling someone who needs a story told. And when you're ready for the next one, you're first in line${isOff(lead.offers) ? '' : ': returning clients get 10% off and first pick of dates'}.</p><p>With gratitude,<br>Nate and the DEPARTURZ crew</p>`,
          cta: { label: 'Book your next date', url: portal() + '#/client/calendar' }
        });
      }
      for (const e of to) await setTag(e, 'Portal: delivered', true).catch(() => {});
      await patch('clients', 'Projects', p._row, { thanked_at: td });
      log.push(`thanks ${p.code}`);
    }
  }

  // 5. Kit: anyone with a login who isn't subscribed yet
  if (env('KIT_API_KEY')) {
    let n = 0;
    for (const r of c.Clients.filter(r => r.email && !r.kit_synced).slice(0, 25)) {
      const codes = c.Projects.filter(p => emails(p.client_email).includes(lower(r.email))).map(p => 'Project ' + p.code);
      const tags = [TAGS.client, ...codes, ...(isOff(r.updates) ? [] : [TAGS.updates]), ...(isOff(r.thanks) ? [] : [TAGS.thanks]), ...(isOff(r.offers) ? [] : [TAGS.offers])];
      try { await subscribe({ email: r.email, name: r.name, tags }); await patch('clients', 'Clients', r._row, { kit_synced: td }); n++; } catch (e) { log.push('kit failed ' + r.email + ': ' + e.message); }
    }
    if (n) log.push(`kit: ${n}`);
  }
}

async function crewLetters(td, log) {
  const t = await load('team', true);
  const active = t.Team.filter(r => r.email && !isOff(r.active));
  const find = a => active.find(r => lower(r.email) === lower(a) || lower(r.name) === lower(a));

  // 6. deadlines
  const byPerson = {};
  for (const x of t.Tasks) {
    if (!x.title || lower(x.status) === 'done' || !day(x.due) || day(x.reminded_at) === td) continue;
    const d = daysBetween(td, x.due);
    if (!([2, 1, 0].includes(d) || (d < 0 && OVERDUE.includes(-d)))) continue;
    const who = find(x.assignee);
    if (!who) continue;
    (byPerson[who.email] = byPerson[who.email] || { who, items: [] }).items.push(x);
  }
  for (const { who, items } of Object.values(byPerson)) {
    const late = items.filter(x => x.due < td);
    await send({
      to: who.email, cc: late.length ? NOTIFY() : undefined,
      subject: late.length ? `Overdue: ${late.length === 1 ? late[0].title : late.length + ' tasks'}${items.length > late.length ? ` (+${items.length - late.length} due soon)` : ''}` : `Due soon: ${items.length === 1 ? items[0].title : items.length + ' tasks'}`,
      heading: late.length === items.length ? 'These are past due' : late.length ? 'Past due, and coming up' : 'On your call sheet',
      html: `<p>Hi ${esc(firstName(who.name))},</p><p>${late.length ? "Checking in on these. If something is blocking you, reply and tell us. We'd rather know early." : 'A quick look at what is coming up:'}</p><ul>${items.map(x => `<li><b>${esc(x.title)}</b>${x.project ? ' · ' + esc(x.project) : ''}<br><span style="color:${x.due < td ? '#C2412D' : '#6B6A66'}">Due ${esc(pretty(x.due))} (${when(x.due, td)})</span></li>`).join('')}</ul><p>Tick them off in the crew portal when they're done.</p>`,
      cta: { label: 'Open Deadlines', url: portal() + '#/team/callsheet' }
    });
    for (const x of items) await patch('team', 'Tasks', x._row, { reminded_at: td });
    log.push(`tasks ${who.email}: ${items.length}`);
  }

  // 7. thank-you notes added straight to the Kudos tab
  for (const k of t.Kudos) {
    if (k.sent_at || !k.text || (day(k.date) && k.date > td)) continue;
    const who = find(k.email);
    if (!who) continue;
    await send({ to: who.email, subject: `A thank-you from ${k.from || 'Nate'}`, heading: `Thank you, ${firstName(who.name)}`, html: `<p style="font-size:17px;line-height:1.6">${esc(k.text).replace(/\n/g, '<br>')}</p><p>${esc(k.from || 'Nate')}<br>DEPARTURZ</p>` });
    await patch('team', 'Kudos', k._row, { sent_at: td, date: day(k.date) || td });
    log.push(`kudos ${who.email}`);
  }
}

export async function GET(request) {
  const secret = env('CRON_SECRET');
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Not allowed' }, 401);
  const td = today(), log = [];
  for (const [name, job] of [['clients', () => clientLetters(td, log)], ['crew', () => crewLetters(td, log)], ['square', () => squareSweep().then(n => n && log.push(`square paid: ${n}`))]]) {
    try { await job(); } catch (e) { console.error('[cron]', name, e.stack || e); log.push(`${name} failed: ${e.message}`); }
  }
  return json({ day: td, sent: log });
}
