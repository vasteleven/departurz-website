// The two Google Sheets that run the portal. Column names are matched loosely
// ("Client email", "client email" and "client_email" all work), so headers can be retitled to read nicely.
// Columns ending in _at, _date, "date" and "due" are dates.

export const CLIENTS = {
  Clients: ['email', 'name', 'company', 'role', 'city', 'bio', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'website', 'updates', 'thanks', 'offers', 'kit_synced', 'seen_at', 'notes'],
  Projects: ['code', 'client_email', 'title', 'service', 'status', 'progress', 'lead', 'seat', 'start_date', 'delivered_date', 'review_title', 'review_file_id', 'review_date', 'review_length', 'review_state', 'review_notified', 'thanked_at', 'drive_folder_id'],
  Milestones: ['project_code', 'label', 'date', 'state', 'note', 'notified_at'],
  Needs: ['id', 'project_code', 'kind', 'label', 'detail', 'due', 'status', 'text', 'received_at', 'reply', 'reminded_at'],
  Invoices: ['no', 'project_code', 'label', 'amount', 'due', 'status', 'paid_date', 'via', 'ref'],
  Events: ['project_code', 'date', 'type', 'title', 'note', 'by', 'created_at'],
  Documents: ['ref', 'project_code', 'title', 'kind', 'file_id', 'url', 'date', 'status', 'note', 'accepted_at', 'accepted_by', 'notified_at']
};

export const TEAM = {
  Team: ['email', 'name', 'role', 'department', 'city', 'tz', 'since', 'bio', 'skills', 'photo', 'instagram', 'vimeo', 'linkedin', 'website', 'public', 'payout_method', 'payout_detail', 'rate', 'admin', 'active', 'seen_at'],
  Tasks: ['id', 'assignee', 'title', 'project', 'due', 'status', 'by', 'done_at', 'reminded_at'],
  Payouts: ['id', 'email', 'label', 'amount', 'date', 'status', 'via', 'project', 'days', 'extra', 'note'],
  Kudos: ['email', 'from', 'date', 'text', 'sent_at'],
  Channels: ['id', 'name', 'members'],
  Files: ['date', 'by', 'name', 'size', 'mime', 'folder', 'project', 'drive_id']
};

// dropdowns the setup script adds, so the sheets stay tidy
export const CHOICES = {
  'Projects.status': ['Booked', 'Pre-production', 'Shooting', 'In the edit', 'In review', 'Final touches', 'Delivered'],
  'Projects.review_state': ['', 'Waiting', 'Notes sent', 'Approved'],
  'Milestones.state': ['done', 'now', 'next'],
  'Needs.kind': ['files', 'photos', 'video', 'copy', 'script', 'shotlist', 'audio', 'songs', 'location', 'blueprint', 'doc', 'other'],
  'Needs.status': ['open', 'received'],
  'Needs.text': ['yes', 'no'],
  'Invoices.status': ['due', 'sent', 'paid'],
  'Events.type': ['shoot', 'review', 'delivery', 'event', 'note', 'book'],
  'Documents.kind': ['contract', 'proposal', 'guide', 'brief', 'call sheet', 'shot list', 'release', 'invoice', 'other'],
  'Documents.status': ['info', 'to sign', 'signed'],
  'Team.department': ['Directors', 'Editors', 'VFX', 'Colorists', 'Photographers', 'Gaffers', 'Grips', 'Web Designers', 'Sound Engineers'],
  'Team.public': ['yes', 'no'],
  'Clients.updates': ['yes', 'no'], 'Clients.thanks': ['yes', 'no'], 'Clients.offers': ['yes', 'no'],
  'Team.admin': ['yes', 'no'], 'Team.active': ['yes', 'no'],
  'Tasks.status': ['todo', 'doing', 'done'],
  'Payouts.status': ['submitted', 'pending', 'paid']
};
