// The shop: product list, Stripe checkout, the after-payment check (with download links for digital items),
// and the first-drop sign-up.
//   GET  /api/shop?r=catalog              the products the page shows
//   POST /api/shop?r=checkout {items}     [{ id, size, qty }] -> a Stripe Checkout link
//   GET  /api/shop?r=check&session=...    after paying: what was bought, and download links for digital items
//   POST /api/shop?r=notify {email,name}  first-drop list: added to Kit (tag "Shop: first drop"), or emailed to DEPARTURZ
// Uses the same STRIPE_SECRET_KEY as the portal. STRIPE_API_BASE can point at a test double.
import { json, body, origin, env, need, clean, isEmail, esc, HttpError } from './_lib/util.js';
import { PRODUCTS, SHIPPING, publicCatalog } from './_lib/catalog.js';
import { send, NOTIFY } from './_lib/mail.js';
import { subscribe } from './_lib/kit.js';
import { limited, kv } from './_lib/kv.js';

const cents = n => Math.round(Number(n) * 100);

async function stripe(path, params, method = 'POST') {
  const base = String(env('STRIPE_API_BASE', 'https://api.stripe.com/v1')).replace(/\/$/, '');
  const r = await fetch(base + '/' + path, {
    method, headers: { Authorization: 'Bearer ' + need('STRIPE_SECRET_KEY'), ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, (j.error && j.error.message) || 'Stripe did not respond.');
  return j;
}

async function slow(key, max, seconds) {
  try { return await limited(key, max, seconds); } catch (e) { return false; }   // no Redis: don't block the shop
}
const ipOf = request => String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x';

async function checkout(request) {
  if (await slow('shop:' + ipOf(request), 20, 600)) throw new HttpError(429, 'Too many tries. Give it a few minutes.');
  const b = await body(request);
  const want = (Array.isArray(b.items) ? b.items : []).slice(0, 20);
  if (!want.length) throw new HttpError(400, 'Your bag is empty.');
  const site = origin(request);
  const p = { mode: 'payment', success_url: site + '/shop?paid={CHECKOUT_SESSION_ID}', cancel_url: site + '/shop', billing_address_collection: 'auto' };
  let i = 0, total = 0, physical = false;
  const picked = [];
  for (const w of want) {
    const prod = PRODUCTS.find(x => x.id === clean(w.id, 60));
    if (!prod || prod.soldOut) throw new HttpError(400, 'One of those items is no longer available.');
    const size = clean(w.size, 20);
    if ((prod.sizes || []).length && !prod.sizes.includes(size)) throw new HttpError(400, 'Pick a size for ' + prod.name + '.');
    const qty = Math.max(1, Math.min(10, parseInt(w.qty, 10) || 1));
    const k = `line_items[${i}]`;
    p[k + '[quantity]'] = String(qty);
    p[k + '[price_data][currency]'] = 'usd';
    p[k + '[price_data][unit_amount]'] = String(cents(prod.price));
    p[k + '[price_data][product_data][name]'] = prod.name + (size ? ' (' + size + ')' : '');
    if (prod.images && prod.images[0]) p[k + '[price_data][product_data][images][0]'] = site + '/' + prod.images[0].replace(/^\//, '');
    if (prod.blurb) p[k + '[price_data][product_data][description]'] = prod.blurb.slice(0, 300);
    total += prod.price * qty; physical = physical || prod.kind === 'physical';
    picked.push([prod.id, size, qty].join('|'));
    i++;
  }
  if (physical) {
    if (SHIPPING.price == null) throw new HttpError(503, 'Shipping isn\'t set up yet. Try again soon.');
    (SHIPPING.countries || ['US']).forEach((c, n) => { p[`shipping_address_collection[allowed_countries][${n}]`] = c; });
    const free = SHIPPING.freeOver != null && total >= SHIPPING.freeOver;
    p['shipping_options[0][shipping_rate_data][type]'] = 'fixed_amount';
    p['shipping_options[0][shipping_rate_data][display_name]'] = free ? 'Free shipping' : SHIPPING.label;
    p['shipping_options[0][shipping_rate_data][fixed_amount][amount]'] = String(free ? 0 : cents(SHIPPING.price));
    p['shipping_options[0][shipping_rate_data][fixed_amount][currency]'] = 'usd';
    p['phone_number_collection[enabled]'] = 'true';
  }
  p['metadata[source]'] = 'shop';
  p['metadata[items]'] = picked.join(',').slice(0, 480);
  const s = await stripe('checkout/sessions', p);
  return json({ ok: true, url: s.url });
}

async function check(request) {
  const id = clean(new URL(request.url).searchParams.get('session'), 200);
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, 'That order link isn\'t right.');
  const s = await stripe('checkout/sessions/' + encodeURIComponent(id), null, 'GET');
  if (s.metadata && s.metadata.source !== 'shop') throw new HttpError(404, 'Order not found.');
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  const ids = String((s.metadata && s.metadata.items) || '').split(',').filter(Boolean).map(t => t.split('|')[0]);
  const bought = ids.map(x => PRODUCTS.find(p => p.id === x)).filter(Boolean);
  const downloads = paid ? bought.filter(p => p.kind === 'digital' && p.deliver).map(p => ({ name: p.name, url: p.deliver })) : [];
  const email = s.customer_details && s.customer_details.email;
  // email the download links once, so buyers keep them after closing the page
  if (paid && downloads.length && email) {
    let first = true;
    try { first = (await kv.set('shop:sent:' + id, '1', { nx: true, ex: 60 * 60 * 24 * 90 })) === 'OK'; } catch (e) { first = true; }
    if (first) await send({
      to: email, subject: 'Your DEPARTURZ downloads', heading: 'Your downloads',
      html: '<p>Thanks for your order. Here are your files:</p>' + downloads.map(d => `<p><a href="${esc(d.url)}">${esc(d.name)}</a></p>`).join('') + '<p>Keep this email; the links stay the same.</p>'
    }).catch(() => {});
  }
  return json({ ok: true, paid, name: (s.customer_details && s.customer_details.name) || '', email: email || '',
    items: bought.map(p => p.name), downloads, ships: bought.some(p => p.kind === 'physical') });
}

async function notify(request) {
  if (await slow('shopnotify:' + ipOf(request), 5, 600)) throw new HttpError(429, 'Too many tries. Give it a few minutes.');
  const b = await body(request);
  if (b.website) return json({ ok: true });                       // honeypot
  const email = clean(b.email, 200), name = clean(b.name, 120);
  if (!isEmail(email)) throw new HttpError(400, 'That email doesn\'t look right.');
  let done = false;
  try { done = !!(await subscribe({ email, name, tags: ['Shop: first drop'] })); } catch (e) { done = false; }
  if (!done) done = await send({ to: NOTIFY(), subject: 'Shop first drop: ' + email, heading: 'New first-drop sign-up',
    html: `<p><b>${esc(name || 'Someone')}</b> (${esc(email)}) wants to hear when the shop's first drop is out.</p>` }).catch(() => false);
  if (!done) throw new HttpError(503, 'not_configured');
  return json({ ok: true });
}

async function route(request) {
  const r = new URL(request.url).searchParams.get('r') || '';
  try {
    if (request.method === 'GET' && r === 'catalog') return json({ ok: true, products: publicCatalog(), shipping: { price: SHIPPING.price, freeOver: SHIPPING.freeOver } }, 200, { 'Cache-Control': 'public, max-age=60' });
    if (request.method === 'GET' && r === 'check') return await check(request);
    if (request.method === 'POST' && r === 'checkout') return await checkout(request);
    if (request.method === 'POST' && r === 'notify') return await notify(request);
    return json({ ok: false, error: 'Not found.' }, 404);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return json({ ok: false, error: status === 500 ? 'Something went wrong. Try again.' : e.message }, status);
  }
}
export const GET = route;
export const POST = route;
