// Who can see what on the crew side.
//   owner   (Team tab, admin = owner; "yes" from the first setup means the same): everything, including money.
//   manager (admin = manager): crew tasks, crew and client files, client review notes and calendar bookings. No money,
//           no client messages.
//   crew    (everyone else): only the projects they're on (Projects tab, crew column), shown by code or code name,
//           never by client.
import { HttpError, lower, clean } from './util.js';
import { load, emails, roleOf } from './roster.js';
import { isActive } from './projects.js';

export async function teamContext(email) {
  const [t, c] = await Promise.all([load('team'), load('clients')]);
  const row = t.Team.find(r => lower(r.email) === email);
  if (!row) throw new HttpError(403, 'You are not on the crew list.');
  const role = roleOf(row);
  return { t, c, row, role, owner: role === 'owner', staff: role !== 'crew', admin: role === 'owner', name: row.name || email.split('@')[0], email };
}

// the crew column takes emails or first names, separated by commas
const inList = (v, ctx) => {
  const s = String(v || '');
  return emails(s).includes(ctx.email) || s.toLowerCase().split(/\s*[,;\n]\s*/).map(x => x.trim()).filter(Boolean).includes(lower(ctx.name));
};
export const onProject = (p, ctx) => inList(p.crew, ctx) || (!!p.lead && lower(p.lead) === lower(ctx.name));
export const labelOf = p => clean(p.code_name, 80) || String(p.code);
// the project's folder name in the Drive (only the owner browses the Drive itself)
export const projFolder = p => `${p.code}${p.title ? ' · ' + clean(p.title, 60) : ''}`;
export const projLabel = (p, ctx) => (ctx.staff ? [String(p.code), p.title].filter(Boolean).join(' · ') : labelOf(p));
// owner and managers see every active project; crew only the ones they're on
export const myProjects = ctx => ctx.c.Projects.filter(isActive).filter(p => ctx.staff || onProject(p, ctx));
export const crewOn = (t, p) => t.Team.filter(r => r.email && onProject(p, { email: lower(r.email), name: r.name || '' }));

export function isClientEmail(c, e) {
  const x = lower(e);
  return !!x && (c.Clients.some(r => lower(r.email) === x) || c.Projects.some(p => emails(p.client_email).includes(x)));
}
export const ownerName = () => process.env.OWNER_NAME || 'Nate';
