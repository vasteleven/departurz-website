// Email through Resend (the same account the contact form uses). Every message goes out in the DEPARTURZ look.
import { env, esc } from './util.js';

export const NOTIFY = () => env('NOTIFY_EMAIL', 'wecreate@departurz.com');
// the wordmark in the email header is an image from the live site (most email apps can't show SVG)
const siteUrl = () => String(env('PORTAL_URL', 'https://departurz.com')).replace(/\/+$/, '');

export async function send({ to, subject, heading, html, text, cta, replyTo, cc }) {
  const key = env('RESEND_API_KEY');
  if (!key) { console.log('[mail skipped: no RESEND_API_KEY]', to, subject); return false; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('PORTAL_FROM', 'DEPARTURZ <portal@departurz.com>'),
      to: Array.isArray(to) ? to : [to],
      ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html: layout(heading || subject, html, cta),
      text: text || stripTags(html) + (cta ? `\n\n${cta.label}: ${cta.url}` : '')
    })
  });
  if (!r.ok) console.log('[mail failed]', r.status, await r.text().catch(() => ''));
  return r.ok;
}

const stripTags = h => String(h || '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

function layout(heading, html, cta) {
  return `<!doctype html><html><body style="margin:0;background:#F1EFEA;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#0A0A0A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden">
<tr><td style="background:#0A0A0A;padding:20px 26px;color:#F2F0EB;font-weight:900;letter-spacing:.08em;font-size:18px;line-height:17px"><img src="${esc(siteUrl())}/logo/wordmark-email.png" width="200" height="17" alt="DEPARTURZ" style="display:block;border:0;width:200px;height:17px;color:#F2F0EB;font-weight:900;letter-spacing:.08em;font-size:16px"></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#3FB8EE,#9E80F2);background-color:#6FA0F1;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 26px 8px"><h1 style="margin:0 0 14px;font-size:28px;line-height:1.05;text-transform:uppercase;letter-spacing:-.01em">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#2A2A28">${html}</div>
${cta ? `<p style="margin:24px 0 8px"><a href="${esc(cta.url)}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:18px 26px 26px;font-size:12px;color:#6B6A66">DEPARTURZ · Los Angeles · Houston · Where your story takes off.</td></tr>
</table></td></tr></table></body></html>`;
}
