// Sample rows for trying the portal locally (npm run dev). Dates are relative to today.
import { CLIENTS, TEAM } from '../api/_lib/schema.js';

const D = n => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rows = (cols, objs) => [cols, ...objs.map(o => cols.map(c => (o[c] === undefined ? '' : o[c])))];

export function demo() {
  const clients = {
    Clients: rows(CLIENTS.Clients, [
      { email: 'jordan@lumencoffee.example', name: 'Jordan Rivera', company: 'Lumen Coffee Co.', role: 'Head of Brand', city: 'Los Angeles, CA', bio: 'We roast in the Arts District and pour in three cafés across LA.', instagram: '@lumencoffee', tiktok: '@lumencoffee', updates: 'yes', thanks: 'yes', offers: 'yes' }
    ]),
    Projects: rows(CLIENTS.Projects, [
      { code: 'DPZ-0142', client_email: 'jordan@lumencoffee.example', title: 'Lumen Coffee brand film', service: 'Production + Post-Production', status: 'In the edit', lead: 'Nate', seat: '1A', start_date: D(-35), review_title: 'Teaser 15s, draft v1', review_date: D(-2), review_length: '0:15' },
      { code: 'DPZ-0150', client_email: 'press@ghanadoc.example', title: 'Ghana documentary', service: 'Post-Production', status: 'In the edit', lead: 'Nate' }
    ]),
    Milestones: rows(CLIENTS.Milestones, [
      { project_code: 'DPZ-0142', label: 'Booked', date: D(-35), state: 'done', note: 'Deposit received. Welcome aboard.', notified_at: D(-35) },
      { project_code: 'DPZ-0142', label: 'Pre-production', date: D(-24), state: 'done', note: 'Shot list and locations locked.', notified_at: D(-24) },
      { project_code: 'DPZ-0142', label: 'Shoot day', date: D(-12), state: 'done', note: 'Wrapped at the Arts District roastery. 2 cameras, drone, 41 setups.' },
      { project_code: 'DPZ-0142', label: 'Edit + color', date: D(0), state: 'now', note: 'Assembly cut done. Color grade and sound design this week.' },
      { project_code: 'DPZ-0142', label: 'Your review', date: D(7), state: 'next', note: 'First cut lands here. Two rounds of notes included.' },
      { project_code: 'DPZ-0142', label: 'Final delivery', date: D(15), state: 'next', note: '4K master plus three social cutdowns.' }
    ]),
    Needs: rows(CLIENTS.Needs, [
      { id: 'n1', project_code: 'DPZ-0142', kind: 'files', label: 'Logo files', detail: 'SVG or PNG, light and dark versions', due: D(-6), status: 'received' },
      { id: 'n2', project_code: 'DPZ-0142', kind: 'songs', label: 'Song list', detail: 'Up to 3 tracks you love, or your licensed music', due: D(-1), status: 'open' },
      { id: 'n3', project_code: 'DPZ-0142', kind: 'copy', label: 'On-screen copy', detail: 'Tagline, lower thirds and the end card line', due: D(3), status: 'open' },
      { id: 'n4', project_code: 'DPZ-0142', kind: 'script', label: 'Voiceover script', detail: 'Final approved version', due: D(5), status: 'open', text: 'no' },
      { id: 'n5', project_code: 'DPZ-0142', kind: 'photos', label: 'Product photos', detail: 'High-res bags and cups for the end card', due: D(9), status: 'open' }
    ]),
    Invoices: rows(CLIENTS.Invoices, [
      { no: 'DPZ-0142-P1', project_code: 'DPZ-0142', label: 'Deposit (50%)', amount: 3250, status: 'paid', paid_date: D(-35), via: 'Apple Pay' },
      { no: 'DPZ-0142-P2', project_code: 'DPZ-0142', label: 'Balance (50%)', amount: 3250, status: 'due', due: D(15) },
      { no: 'DPZ-0142-P3', project_code: 'DPZ-0142', label: 'Add-on: 3 social cutdowns', amount: 600, status: 'due', due: D(15) }
    ]),
    Documents: rows(CLIENTS.Documents, [
      { ref: 'DPZ-0142-D1', project_code: 'DPZ-0142', title: 'Service agreement', kind: 'contract', url: 'https://example.com/agreement', date: D(-37), status: 'signed', accepted_at: D(-36), accepted_by: 'Jordan Rivera <jordan@lumencoffee.example> · signed in the portal', notified_at: D(-37) },
      { ref: 'DPZ-0142-D2', project_code: 'DPZ-0142', title: 'Proposal and budget', kind: 'proposal', url: 'https://example.com/proposal', date: D(-38), status: 'info', notified_at: D(-38) },
      { ref: 'DPZ-0142-D3', project_code: 'DPZ-0142', title: 'Call sheet, shoot day', kind: 'call sheet', url: 'https://example.com/callsheet', date: D(-14), status: 'info', notified_at: D(-14) },
      { ref: 'DPZ-0142-D4', project_code: 'DPZ-0142', title: 'Location release, roastery', kind: 'release', url: 'https://example.com/release', date: D(-1), status: 'to sign', note: 'Covers filming inside the Arts District roastery.' }
    ]),
    Events: rows(CLIENTS.Events, [
      { project_code: 'DPZ-0142', date: D(22), type: 'event', title: 'Café launch party', by: 'jordan@lumencoffee.example' },
      { project_code: 'DPZ-0142', date: D(2), type: 'note', title: 'New bag design arrives', by: 'jordan@lumencoffee.example' }
    ])
  };
  const team = {
    Team: rows(TEAM.Team, [
      { email: 'nate@departurz.example', name: 'Nate', role: 'Director', city: 'Los Angeles', tz: 'America/Los_Angeles', since: 2019, admin: 'yes', active: 'yes', rate: '' },
      { email: 'amara@crew.example', name: 'Amara Okafor', role: 'Editor', department: 'Editors', public: 'yes', city: 'Lagos, Nigeria', tz: 'Africa/Lagos', since: 2025, bio: 'Story-first editor. Documentaries, brand films and music videos.', skills: 'Premiere Pro, DaVinci Resolve, Story editing', instagram: '@amara.cuts', payout_method: 'Wise', payout_detail: 'NGN account ending 4410', rate: 350, active: 'yes' },
      { email: 'kofi@crew.example', name: 'Kofi Mensah', role: 'Colorist', city: 'Accra', tz: 'Africa/Accra', active: 'yes' },
      { email: 'hana@crew.example', name: 'Hana Sato', role: 'Drone + camera', city: 'Tokyo', tz: 'Asia/Tokyo', active: 'yes' }
    ]),
    Tasks: rows(TEAM.Tasks, [
      { id: 't1', assignee: 'amara@crew.example', title: 'Lumen teaser v2: pour lands later, opener -12f', project: 'Lumen Coffee', due: D(1), status: 'doing', by: 'Nate' },
      { id: 't2', assignee: 'Amara Okafor', title: 'Export XML for color', project: 'Lumen Coffee', due: D(2), status: 'todo', by: 'Kofi Mensah' },
      { id: 't3', assignee: 'amara@crew.example', title: 'Ghana doc: market scene under 3:00', project: 'Ghana doc', due: D(-1), status: 'todo', by: 'Nate' },
      { id: 't4', assignee: 'amara@crew.example', title: 'Assembly cut, Lumen brand film', project: 'Lumen Coffee', due: D(-4), status: 'done', by: 'Nate' }
    ]),
    Payouts: rows(TEAM.Payouts, [
      { id: 'p1', email: 'amara@crew.example', label: 'Lumen Coffee, assembly cut (3 days)', amount: 1050, date: D(-4), status: 'paid', via: 'Wise' },
      { id: 'p2', email: 'amara@crew.example', label: 'Lumen teaser + v2', amount: 700, date: D(8), status: 'pending' }
    ]),
    Kudos: rows(TEAM.Kudos, [
      { email: 'amara@crew.example', from: 'Nate', date: D(-1), text: 'Thank you for the late night on the teaser. The client said it gave them chills.', sent_at: D(-1) }
    ]),
    Channels: rows(TEAM.Channels, [{ id: 'general', name: 'general', members: 'all' }, { id: 'lumen', name: 'lumen-coffee', members: 'all' }]),
    Files: rows(TEAM.Files, [])
  };
  return { clients, team };
}
