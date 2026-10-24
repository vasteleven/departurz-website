// Vercel serverless function: the contact page's boarding pass posts here and the inquiry is emailed to DEPARTURZ.
// Set RESEND_API_KEY in the Vercel project (resend.com, free tier is fine) and verify departurz.com in Resend.
// Optional: CONTACT_TO (default wecreate@departurz.com) and CONTACT_FROM (default "DEPARTURZ site <site@departurz.com>").
// Without a key it answers 503, and the page falls back to opening the visitor's email app.

const hits = new Map();   // light rate limit: 5 sends per 10 minutes per IP

const clean = (v, max) => String(v || '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: 'not_configured' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 600000);
  if (list.length >= 5) return res.status(429).json({ ok: false, error: 'slow_down' });
  list.push(now); hits.set(ip, list);

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true });            // honeypot
  const p = {
    name: clean(b.name, 120), email: clean(b.email, 200), company: clean(b.company, 160),
    services: Array.isArray(b.services) ? b.services.map(s => clean(s, 40)).slice(0, 6) : [],
    when: clean(b.when, 60), budget: clean(b.budget, 60), message: clean(b.message, 5000)
  };
  if (!p.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) || !p.message) return res.status(400).json({ ok: false, error: 'missing' });

  const rows = [['Name', p.name], ['Email', p.email], ['Company', p.company], ['Service', p.services.join(', ')], ['Timing', p.when], ['Budget', p.budget]].filter(r => r[1]);
  const text = rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + p.message;
  const html = '<table style="font:14px/1.5 Arial,sans-serif">' + rows.map(r => '<tr><td style="color:#6B6A66;padding-right:14px">' + r[0] + '</td><td><b>' + esc(r[1]) + '</b></td></tr>').join('') +
               '</table><p style="font:15px/1.6 Arial,sans-serif;white-space:pre-wrap">' + esc(p.message) + '</p>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'DEPARTURZ site <site@departurz.com>',
        to: [process.env.CONTACT_TO || 'wecreate@departurz.com'],
        reply_to: p.email,
        subject: 'New project: ' + p.name + (p.services.length ? ' (' + p.services.join(', ') + ')' : ''),
        text, html
      })
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'send_failed' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
