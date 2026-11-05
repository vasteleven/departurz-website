// Small project helpers shared by the client side, the crew side, the review rooms and the daily emails.
import { lower, clean, today } from './util.js';

export const day = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
export const isActive = p => !/deliver|landed|complete|closed|cancel/i.test(String(p.status || ''));

export function evType(label) {
  const s = String(label || '').toLowerCase();
  if (/shoot|film|record|session|drone/.test(s)) return 'shoot';
  if (/review|cut|draft|notes/.test(s)) return 'review';
  if (/deliver|final|launch|premiere/.test(s)) return 'delivery';
  return 'event';
}

export function milestones(c, code) {
  const td = today();
  const rows = c.Milestones.filter(m => String(m.project_code) === String(code));
  rows.sort((a, b) => (day(a.date) || '9999').localeCompare(day(b.date) || '9999'));
  let hasNow = rows.some(m => lower(m.state) === 'now');
  return rows.map(m => {
    let s = lower(m.state);
    if (!['done', 'now', 'next'].includes(s)) {
      if (day(m.date) && day(m.date) < td) s = 'done';
      else if (!hasNow) { s = 'now'; hasNow = true; } else s = 'next';
    }
    return { label: clean(m.label, 120), date: day(m.date), state: s, note: clean(m.note, 600) };
  });
}

