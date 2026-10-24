// Where uploads land in the departurzedits Drive:
//   DEPARTURZ Portal / Clients / <code · title> / From client / <what it is>
//   DEPARTURZ Portal / Clients / <code · title> / From DEPARTURZ        (put finished files here; clients see them)
//   DEPARTURZ Portal / Clients / <code · title> / Documents             (contracts, guides, proposals: numbered under the confirmation)
//   DEPARTURZ Portal / Team / <folder>
import { need, clean, today, id as newId } from './util.js';
import { ensureFolder } from './google.js';
import { kv } from './kv.js';
import { patch, add } from './roster.js';

export const IN = 'From client', OUT = 'From DEPARTURZ', DOCS = 'Documents';

export async function folder(name, parent) {
  const key = `folder:${parent}:${name}`;
  const hit = await kv.get(key);
  if (hit) return hit;
  const fid = await ensureFolder(name, parent);
  await kv.set(key, fid, { ex: 60 * 60 * 24 * 30 });
  return fid;
}

export async function projectRoot(project, create = true) {
  if (project.drive_folder_id) return project.drive_folder_id;
  if (!create) return '';
  const fid = await folder(`${project.code} · ${clean(project.title, 80) || 'Project'}`, need('CLIENTS_FOLDER_ID'));
  await patch('clients', 'Projects', project._row, { drive_folder_id: fid });
  project.drive_folder_id = fid;
  return fid;
}

export async function outFolder(project, create = true) {
  const root = await projectRoot(project, create);
  return root ? folder(OUT, root) : '';
}

export async function docsFolder(project, create = true) {
  const root = await projectRoot(project, create);
  return root ? folder(DOCS, root) : '';
}

export async function clientInFolder(project, label) {
  const inbox = await folder(IN, await projectRoot(project));
  return label ? folder(clean(label, 80).replace(/[\/\\]/g, '-'), inbox) : inbox;
}

export async function teamFolder(name) {
  return folder(clean(name, 80).replace(/[\/\\]/g, '-') || 'General', need('TEAM_FOLDER_ID'));
}

// an upload ticket ties a finished upload back to where it was meant to go
export async function ticket(info) {
  const t = newId('up');
  await kv.set('ticket:' + t, JSON.stringify(info), { ex: 60 * 60 * 24 * 7 });
  return t;
}
export async function readTicket(t) {
  const v = await kv.get('ticket:' + clean(t, 60));
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

export const logFile = row => add('team', 'Files', { date: today(), ...row });

export function kindOf(mime, name) {
  const m = String(mime || ''), n = String(name || '').toLowerCase();
  if (m.startsWith('video') || /\.(mp4|mov|mxf|braw|r3d|prproj|drp|fcpxml|xml)$/.test(n)) return 'film';
  if (m.startsWith('image') || /\.(jpe?g|png|heic|tiff?|cr3|arw|nef|dng|psd)$/.test(n)) return 'img';
  if (m.startsWith('audio') || /\.(wav|mp3|aif+|m4a|flac)$/.test(n)) return 'music';
  return 'doc';
}
