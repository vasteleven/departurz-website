// DEPARTURZ assistant: answers visitor questions for the chat in the corner of departurz.com.
// Same setup as the "Ask about Julie" assistant on juliewenah.com.
//
//   POST /api/chat   body: {"messages":[{"role":"user"|"assistant","content":"..."}]}
//                    reply: {"reply":"..."}
//
// Settings (Vercel project > Settings > Environment Variables):
//   ANTHROPIC_API_KEY   required. Until it is set this returns 503 and the site answers from its built-in replies.
//   ANTHROPIC_MODEL     optional, defaults to claude-haiku-5-5 (fast and inexpensive for short answers).
//
// To change what the assistant knows, edit FACTS below (and the matching FACTS in the homepage).

const FACTS = `DEPARTURZ is a production company based in Los Angeles and Houston, working with clients nationally.
Founder: Nathan Olu, who goes by Nate. Tagline: "Where your story takes off." DEPARTURZ crafts departures from the ordinary: every project, from a major TV production to an independent film, gets the same care.
Experience: television, commercial, travel, and branded content.
Services:
1. Web Design: websites designed and built in-house, from a one-page portfolio to a full organization site. Layouts for phones, tablets and desktop, motion and interactive moments, launch support and updates.
2. Production: end-to-end production from concept to final delivery for films, documentaries, commercials, events, and branded content. Concept and planning, cinematography with Nate on set as DP, drone aerials by an FAA Part 107 certified pilot, event coverage, on-set sound with boom and lav mics. Full production crews are available.
3. Post-Production: editing for films, documentaries, multi-cam long form and branded content, with color grading and sound design. Dedicated editors are available. Two revision rounds are included. Delivery through the Client Portal.
4. Sound: music, audio and sound engineering. DJs who get booked for events, live sound for events, on-set sound with boom and lav mics, recording, mixing and mastering, and sound design for film and video. The team includes sound engineers.
Process: 1) Consultation about vision, scope, timeline and budget, then a detailed proposal and service agreement. 2) Production, on set or receiving your footage. 3) Post: assembly, rough cut, fine cut, color, audio. 4) Delivery of final files in every format needed, through the Client Portal.
Selected work: drone edits of New York and Ghana; client content for BESLA (Black Entertainment Sports and Law Association) and the Sapphire Golf Tournament in Houston; the film/series Boiling Point.
Contact: start a project on the contact page (https://www.departurz.com/pages/contact.html). Instagram @departurzinc, YouTube @DEPARTURZ.`;

const RULES = `You are the assistant on the DEPARTURZ website, a production company's site. Answer the visitor's latest message using only the facts below.
Write 1 to 3 short, friendly sentences in plain words, like a helpful person at the studio would. No lists, no markdown, no em dashes.
Never invent prices, dates, availability, clients, gear, or anything not in the facts. For pricing, timelines or availability, say it depends on the project's scope and suggest starting a project so Nate can send a proposal.
If you don't know, say so and point them to the contact page. If the question isn't about DEPARTURZ, video, film, or websites, say briefly that you can only help with DEPARTURZ questions.

FACTS:
${FACTS}`;

// a light per-visitor limit so the key can't be run up by one person
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 30;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST' }); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Assistant not configured' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many questions, try again in a few minutes' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const raw = body && Array.isArray(body.messages) ? body.messages : [];
  const messages = raw.slice(-9)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Send a question' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 300, system: RULES, messages })
    });
    if (!r.ok) return res.status(502).json({ error: 'Assistant unavailable' });
    const data = await r.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!reply) return res.status(502).json({ error: 'Empty answer' });
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(502).json({ error: 'Assistant unavailable' });
  }
}
