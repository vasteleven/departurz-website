// Payments. Card, Apple Pay and Cash App Pay go through Stripe Checkout; PayPal and Venmo through PayPal;
// Square through a Square payment link; Zelle and a $Cashtag are shown to the client, who taps "I sent it".
// Nobody's card or bank details ever pass through the portal.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, env, need, lower, clean, today, esc, money, firstName, id as newId } from './util.js';
import { load, patch } from './roster.js';
import { context } from './client.js';
import { send, NOTIFY } from './mail.js';

const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const cents = n => Math.round(num(n) * 100);

export function payConfig() {
  return {
    stripe: !!env('STRIPE_SECRET_KEY'),
    cashapp: !!env('STRIPE_SECRET_KEY') && env('STRIPE_CASHAPP', 'yes') !== 'no',
    paypal: env('PAYPAL_CLIENT_ID') && env('PAYPAL_SECRET') ? env('PAYPAL_CLIENT_ID') : '',
    square: !!(env('SQUARE_ACCESS_TOKEN') && env('SQUARE_LOCATION_ID')),
    zelle: env('ZELLE_HANDLE', ''),
    cashtag: env('CASHTAG', '')
  };
}

// the invoices a client picked, checked against what they actually owe
async function owed(user, b) {
  const ctx = await context(user.email, b.project);
  if (!ctx.project) throw new HttpError(409, 'There is no project on your account yet.');
  const code = String(ctx.project.code);
  const open = ctx.c.Invoices.filter(i => String(i.project_code) === code && !['paid'].includes(lower(i.status)) && num(i.amount) > 0);
  const want = Array.isArray(b.invoices) && b.invoices.length ? b.invoices.map(String) : open.map(i => String(i.no));
  const rows = open.filter(i => want.includes(String(i.no)));
  if (!rows.length) throw new HttpError(400, 'Nothing is due right now.');
  return { ctx, rows, total: rows.reduce((a, i) => a + num(i.amount), 0) };
}

export async function markPaid(nos, via, ref, emailHint) {
  const c = await load('clients', true);
  const rows = c.Invoices.filter(i => nos.includes(String(i.no)) && lower(i.status) !== 'paid');
  if (!rows.length) return 0;
  for (const i of rows) await patch('clients', 'Invoices', i._row, { status: 'paid', paid_date: today(), via, ref: clean(ref, 120) });
  const p = c.Projects.find(x => String(x.code) === String(rows[0].project_code));
  const to = emailHint || (p && String(p.client_email).split(/[\s,;]+/)[0]);
  const cl = c.Clients.find(r => lower(r.email) === lower(to)) || {};
  const total = rows.reduce((a, i) => a + num(i.amount), 0);
  const portal = env('PORTAL_URL', 'https://departurz.com').replace(/\/$/, '');
  const conf = p ? String(p.code) : String(rows[0].project_code);
  if (to) await send({ to, subject: `Payment received: ${money(total)} · ${conf}`, heading: 'Payment received', html: `<p>Hi ${esc(firstName(cl.name))},</p><p>We received <b>${esc(money(total))}</b> by ${esc(via)} for ${rows.map(i => `<b>${esc(i.label || i.no)}</b> (${esc(i.no)})`).join(', ')}. Thank you.</p><p>It's filed under your confirmation number <b>${esc(conf)}</b>, with your receipt, in the portal.</p>`, cta: { label: 'Open your receipt', url: `${portal}/portal-app.html#/client/fare` } });
  await send({ to: NOTIFY(), subject: `Paid: ${money(total)} by ${via} (${p ? p.code : rows[0].project_code})`, heading: 'Payment in', html: `<p>${esc(cl.company || cl.name || to || 'A client')} paid <b>${esc(money(total))}</b> by ${esc(via)}.</p><p>${rows.map(i => esc(i.no + ' · ' + (i.label || ''))).join('<br>')}</p>${ref ? `<p style="color:#6B6A66">Reference: ${esc(ref)}</p>` : ''}` });
  return rows.length;
}

/* ---------- Stripe: card, Apple Pay, Cash App Pay ---------- */
async function stripe(path, params, method = 'POST') {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method, headers: { Authorization: 'Bearer ' + need('STRIPE_SECRET_KEY'), ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, (j.error && j.error.message) || 'Stripe did not respond.');
  return j;
}

export async function stripeCheckout(user, b, origin) {
  const { ctx, rows } = await owed(user, b);
  const p = {
    mode: 'payment', customer_email: user.email,
    success_url: `${origin}/portal-app.html?paid=stripe&session={CHECKOUT_SESSION_ID}#/client/fare`,
    cancel_url: `${origin}/portal-app.html#/client/fare`,
    'metadata[invoices]': rows.map(i => i.no).join(','), 'metadata[email]': user.email, 'metadata[project]': String(ctx.project.code),
    'payment_intent_data[metadata][invoices]': rows.map(i => i.no).join(','),
    'payment_intent_data[description]': `DEPARTURZ ${ctx.project.code}`
  };
  rows.forEach((i, k) => {
    p[`line_items[${k}][quantity]`] = '1';
    p[`line_items[${k}][price_data][currency]`] = 'usd';
    p[`line_items[${k}][price_data][unit_amount]`] = String(cents(i.amount));
    p[`line_items[${k}][price_data][product_data][name]`] = `${i.label || 'Invoice'} (${i.no})`;
  });
  if (b.method === 'cashapp') p['payment_method_types[0]'] = 'cashapp';
  const s = await stripe('checkout/sessions', p);
  return { url: s.url };
}

export async function stripeCheck(user, sessionId) {
  const s = await stripe('checkout/sessions/' + encodeURIComponent(clean(sessionId, 200)), null, 'GET');
  if (lower(s.metadata && s.metadata.email) !== user.email) throw new HttpError(403, 'That payment belongs to another account.');
  if (s.payment_status !== 'paid') return { paid: false };
  const via = s.payment_method_types && s.payment_method_types.length === 1 && s.payment_method_types[0] === 'cashapp' ? 'Cash App Pay' : 'Card';
  await markPaid(String(s.metadata.invoices || '').split(','), via, s.payment_intent || s.id, user.email);
  return { paid: true };
}

// Stripe calls this when a payment finishes, even if the client closed the tab
export async function stripeWebhook(raw, sig) {
  const secret = need('STRIPE_WEBHOOK_SECRET');
  const parts = Object.fromEntries(String(sig || '').split(',').map(kv => kv.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const all = String(sig || '').split(',').filter(x => x.trim().startsWith('v1=')).map(x => x.trim().slice(3));
  if (!parts.t || !all.length) throw new HttpError(400, 'Missing signature');
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) throw new HttpError(400, 'Old event');
  const want = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest();
  if (!all.some(v => { const got = Buffer.from(v, 'hex'); return got.length === want.length && timingSafeEqual(got, want); })) throw new HttpError(400, 'Bad signature');
  const ev = JSON.parse(raw);
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
    const s = ev.data.object;
    if (s.payment_status === 'paid' && s.metadata && s.metadata.invoices) await markPaid(String(s.metadata.invoices).split(','), (s.payment_method_types || []).join(',') === 'cashapp' ? 'Cash App Pay' : 'Card', s.payment_intent || s.id, s.metadata.email);
  }
  return { received: true };
}

/* ---------- PayPal and Venmo ---------- */
const PP = () => (env('PAYPAL_ENV', 'live') === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
async function paypal(path, body) {
  const t = await fetch(PP() + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(need('PAYPAL_CLIENT_ID') + ':' + need('PAYPAL_SECRET')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok) throw new HttpError(502, 'PayPal sign-in failed. Check PAYPAL_CLIENT_ID and PAYPAL_SECRET.');
  const r = await fetch(PP() + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tj.access_token, 'Content-Type': 'application/json', 'PayPal-Request-Id': newId('pp') }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, (j.details && j.details[0] && j.details[0].description) || j.message || 'PayPal did not respond.');
  return j;
}
export async function paypalCreate(user, b) {
  const { ctx, rows, total } = await owed(user, b);
  const o = await paypal('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: String(ctx.project.code), custom_id: rows.map(i => i.no).join(',').slice(0, 127), description: `DEPARTURZ ${ctx.project.code}`.slice(0, 127), amount: { currency_code: 'USD', value: total.toFixed(2) } }]
  });
  return { id: o.id };
}
export async function paypalCapture(user, b) {
  const o = await paypal(`/v2/checkout/orders/${encodeURIComponent(clean(b.id, 60))}/capture`);
  const u = (o.purchase_units || [])[0] || {};
  const cap = ((u.payments || {}).captures || [])[0] || {};
  if (o.status !== 'COMPLETED' || cap.status !== 'COMPLETED') return { paid: false };
  const nos = String(u.custom_id || '').split(',').filter(Boolean);
  // make sure these invoices really belong to whoever is signed in
  const { c, mine } = await context(user.email);
  const codes = mine.map(p => String(p.code));
  const ok = nos.filter(no => c.Invoices.some(i => String(i.no) === no && codes.includes(String(i.project_code))));
  const via = o.payment_source && o.payment_source.venmo ? 'Venmo' : 'PayPal';
  await markPaid(ok, via, cap.id, user.email);
  return { paid: true };
}

/* ---------- Square ---------- */
const SQ = () => (env('SQUARE_ENV', 'production') === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com');
async function square(path, body, method = 'POST') {
  const r = await fetch(SQ() + path, { method, headers: { Authorization: 'Bearer ' + need('SQUARE_ACCESS_TOKEN'), 'Square-Version': env('SQUARE_VERSION', '2025-01-23'), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, (j.errors && j.errors[0] && j.errors[0].detail) || 'Square did not respond.');
  return j;
}
export async function squareLink(user, b, origin) {
  const { ctx, rows, total } = await owed(user, b);
  const j = await square('/v2/online-checkout/payment-links', {
    idempotency_key: newId('sq'),
    quick_pay: { name: `DEPARTURZ ${ctx.project.code}: ${rows.map(i => i.label || i.no).join(', ')}`.slice(0, 255), price_money: { amount: cents(total), currency: 'USD' }, location_id: need('SQUARE_LOCATION_ID') },
    checkout_options: { redirect_url: `${origin}/portal-app.html?paid=square#/client/fare` },
    pre_populated_data: { buyer_email: user.email }
  });
  const link = j.payment_link || {};
  for (const i of rows) await patch('clients', 'Invoices', i._row, { ref: 'sq:' + link.order_id });
  return { url: link.url };
}
export async function squarePaid(orderId) {
  const j = await square('/v2/orders/' + encodeURIComponent(orderId), null, 'GET');
  const o = j.order || {};
  return (o.tenders || []).length > 0 && (!o.net_amount_due_money || Number(o.net_amount_due_money.amount) === 0);
}
// checks any open Square links (on return from Square, and once a day)
export async function squareSweep(onlyEmail) {
  if (!payConfig().square) return 0;
  const c = await load('clients', true);
  const codes = onlyEmail ? c.Projects.filter(p => String(p.client_email).toLowerCase().includes(onlyEmail)).map(p => String(p.code)) : null;
  const open = c.Invoices.filter(i => lower(i.status) !== 'paid' && String(i.ref || '').startsWith('sq:') && (!codes || codes.includes(String(i.project_code))));
  const orders = [...new Set(open.map(i => String(i.ref).slice(3)))];
  let n = 0;
  for (const oid of orders) if (await squarePaid(oid).catch(() => false)) n += await markPaid(open.filter(i => String(i.ref).slice(3) === oid).map(i => String(i.no)), 'Square', oid, onlyEmail);
  return n;
}

/* ---------- Zelle and Cash App by hand ---------- */
export async function manual(user, b) {
  const { ctx, rows, total } = await owed(user, b);
  const via = b.method === 'cashapp' ? 'Cash App' : 'Zelle';
  for (const i of rows) await patch('clients', 'Invoices', i._row, { status: 'sent', via });
  await send({ to: NOTIFY(), replyTo: user.email, subject: `Check ${via}: ${money(total)} from ${(ctx.me && (ctx.me.company || ctx.me.name)) || user.email}`, heading: `${via} payment to confirm`, html: `<p><b>${esc((ctx.me && (ctx.me.company || ctx.me.name)) || user.email)}</b> says they sent <b>${esc(money(total))}</b> by ${via} for ${rows.map(i => esc(i.no)).join(', ')}.</p><p>Once it shows up, set those invoices to <b>paid</b> in the Clients sheet (Invoices tab).</p>` });
  return { ok: true };
}
