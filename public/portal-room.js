/* DEPARTURZ screening rooms: the client review room and the editors room.
   The room is a picture (or a looping video made from it) of a screening room whose big screen and two desk monitors
   are flat green. WebGL keys the green out and paints whatever is being reviewed onto the screen and the right monitor;
   the left monitor shows an editing app with the same video playing in its viewer. Everything about the room lives in
   room/scene.json, so a new room is just new pictures: the green screens are found automatically.
   portal-app.html mounts it with DPZRoom.mount(element, options). */
(function () {
'use strict';

/* ---------- styles ---------- */
const STYLE = `
.rm{--rm-ink:#0A0A0A;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.rm-col{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.rm-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.rm-head select{height:40px;border-radius:99px;border:1px solid var(--line2);padding:0 34px 0 14px;font:inherit;font-size:14px;font-weight:600;background:var(--card);max-width:100%}
.rm-head .grow{flex:1}
.rm-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:99px;background:var(--stone);font-size:12.5px;font-weight:600;white-space:nowrap}
.rm-chip.ok{background:#E4F5EA;color:#1D6B3A}.rm-chip.ch{background:#FDEEDC;color:#8A4A0B}.rm-chip.wt{background:#EFEAFE;color:var(--vink,#4A2FA0)}
.rm-chip.dark{background:#1C1B20;color:#E6E3DC}
.rm-stage{position:relative;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#050506;box-shadow:0 30px 60px -36px rgba(0,0,0,.6);user-select:none;-webkit-user-select:none;touch-action:manipulation}
.rm-stage canvas,.rm-stage .rm-fallback{position:absolute;inset:0;width:100%;height:100%;display:block}
.rm-stage.arm{cursor:crosshair}
.rm-stage .rm-loading{position:absolute;inset:0;display:grid;place-items:center;color:#9C9A94;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.rm-over{position:absolute;inset:0;pointer-events:none}
.rm-pin{position:absolute;width:26px;height:26px;margin:-26px 0 0 -13px;pointer-events:auto;cursor:pointer;border:0;padding:0;background:none}
.rm-pin i{position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--grad,linear-gradient(90deg,#3FB8EE,#9E80F2));box-shadow:0 4px 10px rgba(0,0,0,.45)}
.rm-pin b{position:relative;display:grid;place-items:center;height:22px;font-size:11px;font-weight:800;color:#0A0A0A}
.rm-pin.new i{background:#fff}
.rm-pin.done{opacity:.45}
.rm-tools{position:absolute;right:12px;top:12px;display:flex;gap:8px;pointer-events:auto}
.rm-tools button,.rm-bar button{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;border:0;background:rgba(20,20,24,.72);color:#fff;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.rm-tools button:hover,.rm-bar button:hover{background:rgba(40,40,46,.9)}
.rm-tag{position:absolute;left:12px;top:12px;max-width:calc(100% - 120px);padding:6px 11px;border-radius:10px;background:rgba(20,20,24,.72);color:#F2F0EB;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.rm-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:7px 13px;border-radius:99px;background:#fff;color:#0A0A0A;font-size:12.5px;font-weight:700;white-space:nowrap;box-shadow:0 10px 24px -10px rgba(0,0,0,.6)}
.rm-bar{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:#111114;color:#E6E3DC}
.rm-bar button{background:#1E1E23;width:38px;height:38px;flex:none}
.rm-bar .t{font-family:var(--f-mono,ui-monospace,monospace);font-size:12.5px;white-space:nowrap;min-width:92px;text-align:center}
.rm-bar .t.hint{font-family:inherit;font-size:13px;flex:1;min-width:0;text-align:left;padding-left:6px;color:#9C9A94;white-space:normal;line-height:1.35}
.rm-scrub{position:relative;flex:1;height:38px;cursor:pointer;touch-action:none}
.rm-scrub .tr{position:absolute;left:0;right:0;top:17px;height:4px;border-radius:4px;background:#2C2C33}
.rm-scrub .fi{position:absolute;left:0;top:17px;height:4px;border-radius:4px;background:var(--grad,linear-gradient(90deg,#3FB8EE,#9E80F2))}
.rm-scrub .hd{position:absolute;top:12px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff}
.rm-scrub .mk{position:absolute;top:6px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#9E80F2;box-shadow:0 0 0 2px #111114}
.rm-scrub .mk.c{background:#3FB8EE}.rm-scrub .mk.done{background:#55555D}
.rm-pages{display:flex;align-items:center;gap:8px;flex:1;justify-content:center;font-size:13px;font-weight:600}
.rm-decide{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.rm-decide .msg{flex:1;min-width:200px;font-size:13.5px;color:var(--mute)}
.rm-side{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.rm-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r,18px);padding:16px}
.rm-card h3{margin:0 0 10px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.rm-vers{display:grid;gap:8px;max-height:280px;overflow:auto}
.rm-ver{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;text-align:left;padding:8px;border-radius:12px;border:1px solid transparent;background:var(--paper);cursor:pointer;font:inherit;color:inherit}
.rm-ver:hover{border-color:var(--line2)}
.rm-ver[aria-current="true"]{border-color:var(--ink);background:#fff}
.rm-ver .ic{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--ink);color:#fff;font-size:11px;font-weight:800}
.rm-ver .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-ver .sb{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-notes{display:grid;gap:8px;max-height:420px;overflow:auto;margin:0 -4px;padding:0 4px}
.rm-note{display:grid;gap:4px;padding:10px 12px;border-radius:12px;background:var(--paper);border:1px solid var(--line)}
.rm-note.done{opacity:.55}.rm-note.done .tx{text-decoration:line-through}
.rm-note.client{border-left:3px solid #3FB8EE}.rm-note.team{border-left:3px solid #9E80F2}
.rm-note .nt{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mute)}
.rm-note .nt b{color:var(--ink);font-size:13px}
.rm-note .tc{border:0;border-radius:8px;padding:2px 7px;background:var(--ink);color:#fff;font-family:var(--f-mono,ui-monospace,monospace);font-size:11.5px;cursor:pointer}
.rm-note .tx{font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.rm-note .acts{display:flex;gap:10px}
.rm-note .acts button{border:0;background:none;padding:0;font:inherit;font-size:12px;font-weight:600;color:var(--mute);cursor:pointer}
.rm-note .acts button:hover{color:var(--ink)}
.rm-compose{display:grid;gap:8px;margin-top:10px}
.rm-compose textarea{min-height:70px;max-height:200px;resize:vertical;padding:11px 13px;border:1px solid var(--line2);border-radius:14px;font:inherit;font-size:14.5px;outline:none;background:var(--paper)}
.rm-compose textarea:focus{border-color:var(--ink);box-shadow:0 0 0 3px rgba(158,128,242,.18)}
.rm-compose .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rm-tog{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:99px;border:1px solid var(--line2);background:var(--card);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink)}
.rm-tog[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.rm-closed{font-size:13px;color:var(--mute);margin:10px 0 0}
.rm-empty{padding:36px 20px;text-align:center;color:var(--mute);font-size:14px}
.rm-full{position:fixed;inset:0;z-index:90;display:grid;grid-template-rows:minmax(0,1fr) auto;background:#000}
.rm-full .box{position:relative;display:grid;place-items:center;overflow:hidden}
.rm-full .box video,.rm-full .box img,.rm-full .box canvas{max-width:100%;max-height:100%;display:block}
.rm-full .wrap{position:relative;display:inline-block;max-width:100%;max-height:100%}
.rm-full .close{position:absolute;right:14px;top:calc(14px + env(safe-area-inset-top,0px));z-index:2;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;border:0;background:rgba(30,30,34,.8);color:#fff;cursor:pointer}
.rm-full .rm-bar{border-radius:0;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))}
.rm-q:empty{display:none}
@media (max-width:1100px){.rm{grid-template-columns:minmax(0,1fr)}.rm-notes{max-height:none}.rm-side .rm-card:last-child{order:-1}}
@media (max-width:560px){.rm-decide .msg{flex-basis:calc(100% - 120px)}.rm-decide .btn{flex:1}.rm-stage{border-radius:12px}.rm-bar .t{min-width:0;font-size:11.5px}.rm-tag{font-size:11.5px}.rm-head select{width:100%}}
`;

/* ---------- helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };
const ago = iso => { if (!iso) return ''; const d = (Date.now() - new Date(iso)) / 60000; if (d < 1) return 'just now'; if (d < 60) return Math.round(d) + 'm ago'; if (d < 1440) return Math.round(d / 60) + 'h ago'; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const day = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const SV = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  play: SV('<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>'), pause: SV('<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" stroke="none"/>'),
  full: SV('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), close: SV('<path d="M6 6l12 12M18 6L6 18"/>'),
  sound: SV('<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6"/>'), mute: SV('<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>'),
  left: SV('<path d="M15 18l-6-6 6-6"/>'), right: SV('<path d="M9 18l6-6-6-6"/>'), pin: SV('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  up: SV('<path d="M12 19V5M5 12l7-7 7 7"/>'), clock: SV('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), back: SV('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>')
};
const KINDICON = { video: 'FILM', image: 'IMG', pdf: 'PDF', audio: 'AUD', file: 'FILE' };
const STATUS = { waiting: ['wt', 'Waiting'], changes: ['ch', 'Changes asked'], approved: ['ok', 'Approved'] };
const CAP = 4 * 1024 * 1024 - 65536;

function injectCss() { if (document.getElementById('rm-css')) return; const s = document.createElement('style'); s.id = 'rm-css'; s.textContent = STYLE; document.head.appendChild(s); }

/* ---------- geometry: a quad on the picture <-> the unit square ---------- */
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
function homography(src, dst) {           // 3x3, row-major, maps src points onto dst points
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  return solve(A, b).concat(1);
}
const apply = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
const colMajor = H => new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]);
// where content (x, y in 0..1) sits inside a box of aspect boxA when it's fitted without cropping
function fit(mediaA, boxA) { return mediaA > boxA ? { sx: 1, sy: boxA / mediaA } : { sx: mediaA / boxA, sy: 1 }; }

// the three green screens in the room picture: the biggest is the big screen, the other two are the monitors by x.
// Each side is fitted as a straight line (RANSAC), so a corner hidden behind a monitor or a head is still found.
function findQuads(img) {
  const w = Math.min(1280, img.naturalWidth || img.width), h = Math.round(w * (img.naturalHeight || img.height) / (img.naturalWidth || img.width));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) { const r = px[j], g = px[j + 1], b = px[j + 2]; mask[i] = g > 90 && g - Math.max(r, b) > 60 ? 1 : 0; }
  const lab = new Int32Array(w * h), stack = new Int32Array(w * h), comps = [];
  let next = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = ++next; let top = 0, area = 0, sx = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[top++] = s; lab[s] = id;
    while (top) {
      const p = stack[--top], x = p % w, y = (p / w) | 0; area++; sx += x;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack[top++] = p + w; }
    }
    if (area > w * h * 0.003) comps.push({ id, area, cx: sx / area, x0, x1, y0, y1 });
  }
  comps.sort((a, b) => b.area - a.area);
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  // v = a*u + c through the most points (within 1.5 px), then least squares on those
  function line(U, V) {
    let best = null, bestN = -1;
    for (let k = 0; k < 300; k++) {
      const i = rand(U.length), j = rand(U.length); if (U[i] === U[j]) continue;
      const a = (V[j] - V[i]) / (U[j] - U[i]), c = V[i] - a * U[i];
      let n = 0; for (let q = 0; q < U.length; q++) if (Math.abs(V[q] - (a * U[q] + c)) < 1.5) n++;
      if (n > bestN) { bestN = n; best = [a, c]; }
    }
    let su = 0, sv = 0, suu = 0, suv = 0, n = 0;
    for (let q = 0; q < U.length; q++) if (Math.abs(V[q] - (best[0] * U[q] + best[1])) < 1.5) { su += U[q]; sv += V[q]; suu += U[q] * U[q]; suv += U[q] * V[q]; n++; }
    const a = (n * suv - su * sv) / (n * suu - su * su || 1);
    return [a, (sv - a * su) / n];
  }
  const meet = (H, V) => { const y = (H[0] * V[1] + H[1]) / (1 - H[0] * V[0]); return [V[0] * y + V[1], y]; };   // y=a x+c meets x=a y+c
  function quad(c) {
    const cu = [], ct = [], cb = [], rv = [], rl = [], rr = [];
    const ax = Math.round(c.x0 + 0.1 * (c.x1 - c.x0)), bx = Math.round(c.x1 - 0.1 * (c.x1 - c.x0));
    const ay = Math.round(c.y0 + 0.1 * (c.y1 - c.y0)), by = Math.round(c.y1 - 0.1 * (c.y1 - c.y0));
    for (let x = ax; x <= bx; x++) { let t = -1, b = -1; for (let y = c.y0; y <= c.y1; y++) if (lab[y * w + x] === c.id) { if (t < 0) t = y; b = y + 1; } if (t >= 0) { cu.push(x); ct.push(t); cb.push(b); } }
    for (let y = ay; y <= by; y++) { let l = -1, r = -1; for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === c.id) { if (l < 0) l = x; r = x + 1; } if (l >= 0) { rv.push(y); rl.push(l); rr.push(r); } }
    const T = line(cu, ct), B = line(cu, cb), L = line(rv, rl), R = line(rv, rr);
    const pts = [meet(T, L), meet(T, R), meet(B, R), meet(B, L)];
    // nudge each corner out a pixel and a half so no green fringe is left at the edges
    const mx = pts.reduce((a, p) => a + p[0], 0) / 4, my = pts.reduce((a, p) => a + p[1], 0) / 4;
    return pts.map(([x, y]) => { const dx = x - mx, dy = y - my, Ln = Math.hypot(dx, dy) || 1; return [(x + dx / Ln * 1.5) / w, (y + dy / Ln * 1.5) / h]; });
  }
  const [screen, ...rest] = comps.slice(0, 3);
  rest.sort((a, b) => a.cx - b.cx);
  return { screen: screen && quad(screen), left: rest[0] && quad(rest[0]), right: rest[1] && quad(rest[1]) };
}

/* ---------- the renderer ---------- */
const VS = `attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;varying vec2 v;
uniform sampler2D uBase,uMedia,uEditor,uAmb;uniform mat3 uHs,uHl,uHr;uniform vec3 uHave;uniform float uMA,uEA;uniform vec4 uView;uniform vec3 uKey;uniform vec3 uQA;
vec2 loc(mat3 H,vec2 p){vec3 q=H*vec3(p,1.);return q.xy/q.z;}
float inq(vec2 l){float m=.025;return step(-m,l.x)*step(l.x,1.+m)*step(-m,l.y)*step(l.y,1.+m);}
vec3 fitm(vec2 l,float ba){vec2 u=l;if(uMA>ba)u.y=(l.y-.5)*(uMA/ba)+.5;else u.x=(l.x-.5)*(ba/uMA)+.5;
 if(u.x<0.||u.x>1.||u.y<0.||u.y>1.){vec2 c=l;if(uMA>ba)c.x=(l.x-.5)*(ba/uMA)+.5;else c.y=(l.y-.5)*(uMA/ba)+.5;
  vec3 a=texture2D(uAmb,c).rgb;float e=min(min(u.x,1.-u.x),min(u.y,1.-u.y));return mix(a*.3,a*.42,smoothstep(-.25,-.02,e));}
 return texture2D(uMedia,u).rgb;}
void main(){vec4 b=texture2D(uBase,v);float gr=b.g-max(b.r,b.b);float k=smoothstep(uKey.x,uKey.y,gr);vec3 c=b.rgb;
 if(gr>0.)c.g=mix(c.g,max(c.r,c.b),uKey.z*smoothstep(0.,uKey.x,gr));
 vec3 m=vec3(0.);float hit=0.;
 if(uHave.z>.5){vec2 l=loc(uHr,v);if(inq(l)>.5){m=fitm(clamp(l,0.,1.),uQA.z);hit=1.;}}
 if(hit<.5&&uHave.y>.5){vec2 l=loc(uHl,v);if(inq(l)>.5){l=clamp(l,0.,1.);
  if(l.x>=uView.x&&l.x<=uView.z&&l.y>=uView.y&&l.y<=uView.w){vec2 q=(l-uView.xy)/(uView.zw-uView.xy);m=fitm(q,uEA*(uView.z-uView.x)/(uView.w-uView.y));}
  else m=texture2D(uEditor,l).rgb;hit=1.;}}
 if(hit<.5&&uHave.x>.5){vec2 l=loc(uHs,v);if(inq(l)>.5){m=fitm(clamp(l,0.,1.),uQA.x);hit=1.;}}
 gl_FragColor=vec4(mix(c,m,k*hit),1.);}`;

class Stage {
  constructor(el, scene) {
    this.el = el; this.scene = scene; this.media = null; this.mediaA = 16 / 9; this.dirty = true;
    this.canvas = document.createElement('canvas'); el.prepend(this.canvas);
    const gl = this.gl = this.canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl');
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = n => gl.getUniformLocation(pr, n);
    this.tex = [0, 1, 2, 3].map(i => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); return t; });
    gl.uniform1i(this.u('uBase'), 0); gl.uniform1i(this.u('uMedia'), 1); gl.uniform1i(this.u('uEditor'), 2); gl.uniform1i(this.u('uAmb'), 3);
    // a tiny, soft copy of what's playing lights the parts of the screen the picture doesn't cover (no black bars)
    this.amb = document.createElement('canvas'); this.amb.width = 48; this.amb.height = 27;
    this.ambX = this.amb.getContext('2d'); try { this.ambX.filter = 'blur(2px)'; } catch (e) {}
    const q = scene.quads, I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.H = { screen: q.screen ? homography(q.screen, UNIT) : I, left: q.left ? homography(q.left, UNIT) : I, right: q.right ? homography(q.right, UNIT) : I };
    this.F = { screen: q.screen ? homography(UNIT, q.screen) : I };
    gl.uniformMatrix3fv(this.u('uHs'), false, colMajor(this.H.screen)); gl.uniformMatrix3fv(this.u('uHl'), false, colMajor(this.H.left)); gl.uniformMatrix3fv(this.u('uHr'), false, colMajor(this.H.right));
    gl.uniform3f(this.u('uHave'), q.screen ? 1 : 0, q.left && scene.editor ? 1 : 0, q.right ? 1 : 0);
    const k = scene.cfg.key || {}; gl.uniform3f(this.u('uKey'), k.low ?? 0.1, k.high ?? 0.3, k.spill ?? 0.9);
    const qa = scene.cfg.aspect || {}; gl.uniform3f(this.u('uQA'), qa.screen || 16 / 9, qa.left || 16 / 9, qa.right || 16 / 9);
    const vw = (scene.cfg.editor && scene.cfg.editor.viewer) || [0, 0, 1, 1]; gl.uniform4f(this.u('uView'), vw[0], vw[1], vw[2], vw[3]);
    gl.uniform1f(this.u('uEA'), scene.editor ? scene.editor.naturalWidth / scene.editor.naturalHeight : 16 / 9);
    this.put(0, scene.still); if (scene.editor) this.put(2, scene.editor);
    this.resize = () => { const r = this.el.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); const W = Math.min(2560, Math.round(r.width * d)), Hh = Math.round(W * 9 / 16); if (this.canvas.width !== W) { this.canvas.width = W; this.canvas.height = Hh; this.dirty = true; } };
    this.resize(); this.ro = new ResizeObserver(this.resize); this.ro.observe(el);
    this.loop = () => { this.raf = requestAnimationFrame(this.loop); this.draw(); };
    this.raf = requestAnimationFrame(this.loop);
  }
  put(unit, src) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[unit]); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) {} this.dirty = true; }
  setBase(video) { this.baseVideo = video; }
  setMedia(src, aspect) { this.media = src; this.mediaA = aspect || 16 / 9; this.gl.uniform1f(this.u('uMA'), this.mediaA); if (src && !(src instanceof HTMLVideoElement)) { this.put(1, src); this.ambient(src); } this.dirty = true; }
  ambient(src) { try { this.ambX.clearRect(0, 0, 48, 27); this.ambX.drawImage(src, -4, -4, 56, 35); this.put(3, this.amb); } catch (e) {} }
  touch() { this.dirty = true; }
  draw() {
    if (document.hidden) return;
    const gl = this.gl, bv = this.baseVideo, mv = this.media instanceof HTMLVideoElement ? this.media : null;
    let any = this.dirty;
    if (bv && bv.readyState >= 2 && !bv.paused) { this.put(0, bv); any = true; }
    if (mv && mv.readyState >= 2 && (!mv.paused || this.dirty || mv.seeking || this.lastT !== mv.currentTime)) { this.put(1, mv); if ((this.ambN = (this.ambN || 0) + 1) % 3 === 1 || mv.paused) this.ambient(mv); this.lastT = mv.currentTime; any = true; }
    if (this.media && this.media.tagName === 'CANVAS' && this.media.live) { this.put(1, this.media); this.ambient(this.media); any = true; }
    if (!any) return;
    this.dirty = false;
    gl.uniform1f(this.u('uMA'), this.mediaA);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (this.onDraw) this.onDraw();
  }
  // a point on the stage (0..1) → where it lands on the reviewed content (0..1), or null when it's off the big screen
  toContent(x, y) {
    const q = this.scene.quads; if (!q.screen) return null;
    for (const k of ['left', 'right']) if (q[k]) { const l = apply(this.H[k], x, y); if (l[0] >= 0 && l[0] <= 1 && l[1] >= 0 && l[1] <= 1) return null; }
    const [u, v] = apply(this.H.screen, x, y); if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const f = fit(this.mediaA, (this.scene.cfg.aspect || {}).screen || 16 / 9);
    const cx = (u - 0.5) / f.sx + 0.5, cy = (v - 0.5) / f.sy + 0.5;
    return cx < 0 || cx > 1 || cy < 0 || cy > 1 ? null : [cx, cy];
  }
  fromContent(cx, cy) {
    const f = fit(this.mediaA, (this.scene.cfg.aspect || {}).screen || 16 / 9);
    return apply(this.F.screen, (cx - 0.5) * f.sx + 0.5, (cy - 0.5) * f.sy + 0.5);
  }
  destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); this.canvas.remove(); }
}

/* ---------- the room picture, loaded once ---------- */
let SCENE = null;
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function loadScene(base) {
  if (SCENE) return SCENE;
  SCENE = (async () => {
    const cfg = await fetch(base + 'room/scene.json', { cache: 'no-cache' }).then(r => r.json());
    const [still, editor] = await Promise.all([loadImg(base + cfg.still), cfg.editor ? loadImg(base + cfg.editor.image).catch(() => null) : null]);
    const quads = cfg.quads || findQuads(still);
    return { cfg, still, editor, quads, base };
  })();
  return SCENE;
}

// what the screens show when nothing is picked, and for things that don't play (audio, other files)
function card(title, sub, progress) {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1600, 900); g.addColorStop(0, '#0E0E12'); g.addColorStop(1, '#17121F'); x.fillStyle = g; x.fillRect(0, 0, 1600, 900);
  const gr = x.createLinearGradient(560, 0, 1040, 0); gr.addColorStop(0, '#3FB8EE'); gr.addColorStop(1, '#9E80F2');
  x.fillStyle = gr; x.fillRect(560, 446, 480, 6);
  x.fillStyle = '#F2F0EB'; x.textAlign = 'center'; x.font = '800 92px Arial, Helvetica, sans-serif'; x.fillText(title, 800, 410, 1400);
  x.fillStyle = '#9C9A94'; x.font = '500 40px Arial, Helvetica, sans-serif'; if (sub) x.fillText(sub, 800, 530, 1400);
  c.draw = p => { if (p == null) return; x.fillStyle = '#2C2C33'; x.fillRect(300, 640, 1000, 10); x.fillStyle = gr; x.fillRect(300, 640, 1000 * p, 10);
    for (let i = 0; i < 64; i++) { const h = 20 + 60 * Math.abs(Math.sin(i * 1.7 + p * 40)) * (0.4 + 0.6 * Math.abs(Math.sin(i * .37))); x.fillStyle = i / 64 < p ? '#9E80F2' : '#3A3A42'; x.fillRect(300 + i * 15.8, 720 - h / 2 + 30, 9, h); } };
  if (progress != null) c.draw(progress);
  return c;
}

/* ---------- fetching a whole file through the 4 MB pieces ---------- */
async function fetchWhole(url, size, whole) {
  if (whole || !size || size <= CAP) { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('That file could not be loaded.'); return new Uint8Array(await r.arrayBuffer()); }
  const out = new Uint8Array(size);
  for (let a = 0; a < size; a += CAP) {
    const r = await fetch(url, { credentials: 'same-origin', headers: { Range: `bytes=${a}-${Math.min(size, a + CAP) - 1}` } });
    if (!r.ok) throw new Error('That file could not be loaded.');
    out.set(new Uint8Array(await r.arrayBuffer()), a);
  }
  return out;
}
let PDFJS = null;
function pdfjs() {
  if (PDFJS) return PDFJS;
  PDFJS = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { PDFJS = null; rej(new Error('The PDF viewer did not load. Check your connection.')); };
    document.head.appendChild(s);
  });
  return PDFJS;
}

/* ===================== the room ===================== */
function mount(el, o) {
  injectCss();
  const S = { list: null, item: null, notes: [], key: '', project: o.project || '', pin: null, arm: false, useTime: true, page: 1, pages: 1, full: false, busy: false };
  let stage = null, media = null, pdf = null, baseVideo = null, dead = false, fallback = false;
  const room = o.room;                                  // 'client' | 'editors'
  const me = o.side;                                    // 'client' | 'team'
  el.innerHTML = `<div class="rm">
    <div class="rm-col">
      <div class="rm-head" id="rmHead"></div>
      <div class="rm-stage" id="rmStage"><div class="rm-loading">Dimming the lights…</div><div class="rm-over" id="rmOver"></div></div>
      <div class="rm-bar" id="rmBar"></div>
      <div class="rm-decide" id="rmDecide"></div>
      <div class="files-q rm-q" data-q="room"></div>
    </div>
    <div class="rm-side"><section class="rm-card"><h3 id="rmVerT">Versions</h3><div class="rm-vers" id="rmVers"></div></section>
      <section class="rm-card"><h3 id="rmNotesT">Notes</h3><div class="rm-notes" id="rmNotes"></div><div id="rmCompose"></div></section></div>
  </div>`;
  const $ = s => el.querySelector(s);
  const stageEl = $('#rmStage'), over = $('#rmOver');

  /* ----- data ----- */
  async function loadList(pick) {
    const q = new URLSearchParams(); if (room === 'editors') q.set('room', 'editors'); if (S.project) q.set('project', S.project);
    S.list = o.live ? await o.api('room?' + q) : o.sample.list(S.project);
    S.project = S.list.project;
    head(); versions();
    const want = pick || S.key;
    const first = S.list.items.find(i => i.key === want) || S.list.items.find(i => i.status === 'waiting' && (room === 'client' || i.kind === 'cut')) || S.list.items[0];
    if (first) await open(first.key); else { S.item = null; clearMedia(); stage && stage.setMedia(card('Nothing to review yet', room === 'editors' ? 'Upload a cut and Nate gets a heads-up' : 'New cuts show up right here'), 16 / 9); notes(); bar(); decide(); }
  }
  async function open(key) {
    S.key = key; S.pin = null; S.arm = false; S.page = 1;
    versions();
    clearMedia();
    stage && stage.setMedia(card('Loading…', ''), 16 / 9);
    try {
      S.item = o.live ? await o.api('room/item?key=' + encodeURIComponent(key)) : o.sample.item(key);
    } catch (e) { o.toast(e.message); S.item = null; return; }
    if (dead || S.key !== key) return;
    S.notes = S.item.notes || [];
    tag(); notes(); decide();
    await loadMedia();
    bar();
  }

  /* ----- what plays on the screens ----- */
  function clearMedia() {
    if (media && media.pause) { media.pause(); media.removeAttribute('src'); try { media.load(); } catch (e) {} }
    if (media && media.remove) media.remove();
    media = null; pdf = null; S.pages = 1;
  }
  async function loadMedia() {
    const it = S.item, t = it.type;
    if (t === 'video' || t === 'audio') {
      const v = document.createElement(t === 'video' ? 'video' : 'audio');
      v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', ''); v.src = it.media; v.style.display = 'none';
      el.appendChild(v); media = v;
      v.addEventListener('loadedmetadata', () => { if (t === 'video' && stage) stage.setMedia(v, v.videoWidth / v.videoHeight || 16 / 9); bar(); });
      v.addEventListener('timeupdate', tick); v.addEventListener('play', bar); v.addEventListener('pause', bar); v.addEventListener('ended', bar); v.addEventListener('seeked', () => { stage && stage.touch(); pins(); });
      v.addEventListener('error', () => { if (media !== v) return; o.toast(me === 'client' ? 'That one will not play in the browser. We\'ll send an MP4 version.' : 'That file will not play in a browser. Export an MP4 (H.264) for the room.'); stage && stage.setMedia(card('This one won\'t play here', me === 'client' ? 'We\'ll post a version that does' : 'Export an MP4 (H.264) for the room'), 16 / 9); });
      if (t === 'audio') { const c = card(it.item.title + (it.item.version ? ' v' + it.item.version : ''), 'Press play to listen', 0); c.live = true; media.card = c; stage && stage.setMedia(c, 16 / 9); }
      else if (stage) stage.setMedia(v, 16 / 9);
      if (fallback) fallbackShow(v);
      return;
    }
    if (t === 'image') {
      const bytes = await fetchWhole(it.media, it.size, it.whole).catch(e => { o.toast(e.message); return null; });
      if (!bytes || dead) return;
      const img = await loadImg(URL.createObjectURL(new Blob([bytes], { type: it.mime || 'image/jpeg' }))).catch(() => null);
      if (!img) return o.toast('That picture could not be shown here.');
      media = img; stage && stage.setMedia(img, img.naturalWidth / img.naturalHeight); if (fallback) fallbackShow(img); pins(); return;
    }
    if (t === 'pdf') {
      try {
        const [lib, bytes] = await Promise.all([pdfjs(), fetchWhole(it.media, it.size, it.whole)]);
        pdf = await lib.getDocument({ data: bytes }).promise; S.pages = pdf.numPages; await page(1);
      } catch (e) { o.toast(e.message || 'That PDF could not be opened.'); }
      return;
    }
    const c = card(it.item.title, 'This one opens outside the room'); media = null; stage && stage.setMedia(c, 16 / 9);
  }
  async function page(n) {
    if (!pdf) return;
    S.page = Math.max(1, Math.min(S.pages, n));
    const pg = await pdf.getPage(S.page), vp0 = pg.getViewport({ scale: 1 }), sc = 1800 / Math.max(vp0.width, vp0.height), vp = pg.getViewport({ scale: sc });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    if (dead) return;
    media = c; stage && stage.setMedia(c, c.width / c.height); if (fallback) fallbackShow(c);
    bar(); pins(); if (S.full) full(true);
  }

  /* ----- header, versions, tag ----- */
  function head() {
    const L = S.list, multi = L.projects.length > 1;
    const sel = multi ? `<select id="rmProj" aria-label="Project">${L.projects.map(p => `<option value="${esc(p.code)}" ${p.code === L.project ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>` : L.projects[0] ? `<span class="rm-chip dark">${esc(L.projects[0].label)}</span>` : '';
    const rounds = L.rounds ? `<span class="rm-chip">${L.rounds.used ? `Round ${Math.min(L.rounds.used + 1, 99)}` : 'Round 1'} · ${L.rounds.included} included</span>` : '';
    const crew = L.crew && L.crew.length ? `<span class="rm-chip">${esc(L.crew.join(', '))}</span>` : '';
    const up = !o.readOnly && L.project && L.can && L.can.upload ? `<button class="btn sm ghost" type="button" data-r="upload">${ICON.up}<span>${room === 'editors' ? 'Upload a cut' : 'Send a file to this room'}</span></button>` : '';
    $('#rmHead').innerHTML = `${sel}${rounds}${crew}<span class="grow"></span>${up}`;
    if (!L.projects.length) $('#rmHead').innerHTML = `<span class="rm-chip">${room === 'editors' ? 'You are not on a project yet' : 'No projects yet'}</span>`;
  }
  function versions() {
    const L = S.list; if (!L) return;
    $('#rmVerT').textContent = room === 'editors' ? 'Cuts and client reviews' : 'Versions';
    if (!L.items.length) { $('#rmVers').innerHTML = `<div class="rm-empty">${room === 'editors' ? 'No cuts here yet.' : me === 'client' ? 'Nothing to review yet. We email you the moment a cut lands here.' : 'Nothing in this room yet. Drop files in the project\'s For review folder, or send a cut from the editors room.'}</div>`; return; }
    $('#rmVers').innerHTML = L.items.map(i => {
      const [cls, lab] = STATUS[i.status] || STATUS.waiting;
      const sub = [i.kind === 'cut' ? (i.by ? 'from ' + i.by : 'Cut') : room === 'editors' ? 'Client review' : '', day(i.date), i.open ? `${i.open} open note${i.open === 1 ? '' : 's'}` : i.notes ? 'notes done' : '', i.sent ? 'sent to client' : '', i.notified === false && me === 'team' && room === 'client' ? 'not emailed yet' : ''].filter(Boolean).join(' · ');
      return `<button class="rm-ver" type="button" data-r="open" data-key="${esc(i.key)}" aria-current="${i.key === S.key}"><span class="ic">${KINDICON[i.type] || 'FILE'}</span><span style="min-width:0"><span class="nm" style="display:block">${esc(i.title)}${i.version ? ' v' + i.version : ''}</span><span class="sb" style="display:block">${esc(sub)}</span></span><span class="rm-chip ${cls}">${lab}</span></button>`;
    }).join('');
  }
  function tag() {
    let t = stageEl.querySelector('.rm-tag'); if (!t) { t = document.createElement('div'); t.className = 'rm-tag'; stageEl.appendChild(t); }
    const i = S.item && S.item.item; t.textContent = i ? `${i.title}${i.version ? ' v' + i.version : ''}` : '';
    t.hidden = !i;
    let tl = stageEl.querySelector('.rm-tools'); if (!tl) { tl = document.createElement('div'); tl.className = 'rm-tools'; tl.innerHTML = `<button type="button" data-r="full" aria-label="Watch full screen">${ICON.full}</button>`; stageEl.appendChild(tl); }
  }

  /* ----- transport ----- */
  function bar(target) {
    const B = target || $('#rmBar'); if (!B) return;
    const it = S.item;
    if (!it) { B.innerHTML = `<span class="t hint">${room === 'editors' ? 'Editors room' : 'Review room'}</span>`; return; }
    if (it.type === 'video' || it.type === 'audio') {
      const v = media, d = v && v.duration || 0, ct = v ? v.currentTime : 0;
      const marks = S.notes.filter(n => typeof n.t === 'number' && d).map(n => `<i class="mk ${n.from === 'client' ? 'c' : ''} ${n.done ? 'done' : ''}" style="left:${(n.t / d * 100).toFixed(2)}%"></i>`).join('');
      B.innerHTML = `<button type="button" data-r="play" aria-label="${v && !v.paused ? 'Pause' : 'Play'}">${v && !v.paused ? ICON.pause : ICON.play}</button>
        <span class="t" data-r-time>${fmtT(ct)} / ${fmtT(d)}</span>
        <div class="rm-scrub" data-r="scrub" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="${Math.round(d)}" aria-valuenow="${Math.round(ct)}" tabindex="0"><i class="tr"></i><i class="fi" style="width:${d ? ct / d * 100 : 0}%"></i>${marks}<i class="hd" style="left:${d ? ct / d * 100 : 0}%"></i></div>
        <button type="button" data-r="mute" aria-label="${v && v.muted ? 'Sound on' : 'Mute'}">${v && v.muted ? ICON.mute : ICON.sound}</button>${target ? '' : `<button type="button" data-r="full" aria-label="Watch full screen">${ICON.full}</button>`}`;
      return;
    }
    if (it.type === 'pdf') { B.innerHTML = `<div class="rm-pages"><button type="button" data-r="prev" aria-label="Previous page">${ICON.left}</button><span>Page ${S.page} of ${S.pages}</span><button type="button" data-r="next" aria-label="Next page">${ICON.right}</button></div>${target ? '' : `<button type="button" data-r="full" aria-label="Full screen">${ICON.full}</button>`}`; return; }
    if (it.type === 'image') { B.innerHTML = `<span class="t hint">${me === 'client' || (it.can && it.can.note) ? 'Tap “Point at it”, then tap the picture to pin a note' : 'Pins show where each note points'}</span>${target ? '' : `<button type="button" data-r="full" aria-label="Full screen">${ICON.full}</button>`}`; return; }
    B.innerHTML = `<span class="t hint">This file doesn't play in the room</span><button class="btn sm light" type="button" data-r="dl">Open it</button>`;
  }
  function tick() {
    const v = media; if (!v) return;
    document.querySelectorAll('[data-r-time]').forEach(t => { t.textContent = `${fmtT(v.currentTime)} / ${fmtT(v.duration || 0)}`; });
    document.querySelectorAll('.rm-scrub').forEach(sc => { const p = v.duration ? v.currentTime / v.duration * 100 : 0; sc.querySelector('.fi').style.width = p + '%'; sc.querySelector('.hd').style.left = p + '%'; sc.setAttribute('aria-valuenow', Math.round(v.currentTime)); });
    if (media.card) media.card.draw(v.duration ? v.currentTime / v.duration : 0);
    const tg = el.querySelector('[data-r="timechip"]'); if (tg && S.useTime && document.activeElement !== el.querySelector('#rmText')) tg.innerHTML = `${ICON.clock}<span>At ${fmtT(v.currentTime)}</span>`;
    pins();
  }
  function seekFrom(e, sc) { const v = media; if (!v || !v.duration) return; const r = sc.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(v.duration - 0.05, (e.clientX - r.left) / r.width * v.duration)); tick(); }

  /* ----- pins on the picture ----- */
  function pins() {
    const it = S.item; over.innerHTML = '';
    const box = S.full ? document.querySelector('.rm-full .wrap') : null;
    if (box) box.querySelectorAll('.rm-pin').forEach(p => p.remove());
    if (!it || !['image', 'pdf', 'video'].includes(it.type)) return;
    const now = media && media.currentTime || 0;
    const show = S.notes.map((n, i) => [n, i]).filter(([n]) => typeof n.x === 'number' && (it.type !== 'pdf' || (n.page || 1) === S.page) && (it.type !== 'video' || (typeof n.t === 'number' && Math.abs(n.t - now) < 1.6)));
    const list = show.map(([n, i]) => ({ x: n.x, y: n.y, label: i + 1, id: n.id, done: n.done }));
    if (S.pin) list.push({ x: S.pin[0], y: S.pin[1], label: '+', id: '', fresh: true });
    for (const p of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-pin' + (p.fresh ? ' new' : '') + (p.done ? ' done' : ''); b.dataset.r = 'pinnote'; b.dataset.id = p.id;
      b.innerHTML = `<i></i><b>${p.label}</b>`; b.setAttribute('aria-label', p.fresh ? 'Your new pin' : 'Note ' + p.label);
      if (box) { b.style.left = (p.x * 100) + '%'; b.style.top = (p.y * 100) + '%'; box.appendChild(b); }
      else if (stage) { const [sx, sy] = stage.fromContent(p.x, p.y); b.style.left = (sx * 100) + '%'; b.style.top = (sy * 100) + '%'; over.appendChild(b); }
    }
  }

  /* ----- notes ----- */
  function notes() {
    const it = S.item;
    $('#rmNotesT').textContent = it ? `Notes${S.notes.length ? ' · ' + S.notes.filter(n => !n.done).length + ' open' : ''}` : 'Notes';
    const order = [...S.notes].map((n, i) => [n, i]).sort((a, b) => (a[0].page || 0) - (b[0].page || 0) || (a[0].t ?? 1e9) - (b[0].t ?? 1e9) || a[0].at.localeCompare(b[0].at));
    $('#rmNotes').innerHTML = !it ? '' : order.length ? order.map(([n, i]) => {
      const where = typeof n.t === 'number' ? `<button class="tc" type="button" data-r="seek" data-t="${n.t}">${fmtT(n.t)}</button>` : n.page ? `<button class="tc" type="button" data-r="gopage" data-p="${n.page}">p${n.page}</button>` : '';
      const pin = typeof n.x === 'number' ? `<span title="Pinned on the picture" style="display:inline-flex;color:var(--mute)">${ICON.pin}</span>` : '';
      const acts = [it.can && it.can.resolve ? `<button type="button" data-r="done" data-id="${esc(n.id)}">${n.done ? 'Reopen' : 'Mark done'}</button>` : '', n.mine && it.can && it.can.note && !o.readOnly ? `<button type="button" data-r="remove" data-id="${esc(n.id)}">Take back</button>` : ''].filter(Boolean).join('');
      return `<div class="rm-note ${n.from} ${n.done ? 'done' : ''}" data-note="${esc(n.id)}"><div class="nt"><b>${i + 1}. ${esc(n.who)}</b>${where}${pin}<span style="margin-left:auto">${ago(n.at)}</span></div><div class="tx">${esc(n.text)}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
    }).join('') : `<div class="rm-empty" style="padding:18px 8px">${it.can && it.can.note ? (it.type === 'video' ? 'Pause anywhere and type what you see. Each note keeps its timecode.' : 'Point at a spot, then type your note.') : 'No notes yet.'}</div>`;
    compose();
  }
  function compose() {
    const it = S.item, C = $('#rmCompose');
    if (!it) { C.innerHTML = ''; return; }
    if (o.readOnly) { C.innerHTML = `<p class="rm-closed">This is a view-only copy of their room.</p>`; return; }
    if (!(it.can && it.can.note)) { C.innerHTML = `<p class="rm-closed">${me === 'client' ? 'This one is decided, so notes are closed. Thank you.' : it.item.kind === 'rev' ? 'These are the client\'s notes, for reading. Nate confirms what to change.' : 'Notes are closed.'}</p>`; return; }
    const timed = it.type === 'video' || it.type === 'audio';
    C.innerHTML = `<div class="rm-compose"><textarea id="rmText" placeholder="${timed ? 'What should change at this moment?' : 'What should change?'}" aria-label="Your note"></textarea>
      <div class="row">${timed ? `<button class="rm-tog" type="button" data-r="timechip" aria-pressed="${S.useTime}">${ICON.clock}<span>${S.useTime ? 'At ' + fmtT(media ? media.currentTime : 0) : 'General note'}</span></button>` : ''}
      ${['image', 'pdf', 'video'].includes(it.type) ? `<button class="rm-tog" type="button" data-r="arm" aria-pressed="${S.arm || !!S.pin}">${ICON.pin}<span>${S.pin ? 'Pinned' : S.arm ? 'Tap the picture' : 'Point at it'}</span></button>` : ''}
      ${it.type === 'pdf' ? `<span class="rm-chip">Page ${S.page}</span>` : ''}
      <span style="flex:1"></span><button class="btn sm" type="button" data-r="add">Add note</button></div></div>`;
  }
  async function addNote() {
    const ta = $('#rmText'); const text = (ta && ta.value || '').trim();
    if (!text) { o.toast('Type your note first.'); ta && ta.focus(); return; }
    const it = S.item, b = { item: S.key, text };
    if ((it.type === 'video' || it.type === 'audio') && S.useTime && media) b.t = Math.round((S.noteT ?? media.currentTime) * 10) / 10;
    if (it.type === 'pdf') b.page = S.page;
    if (S.pin) { b.x = S.pin[0]; b.y = S.pin[1]; }
    try {
      const j = o.live ? await o.api('room/note', b) : o.sample.note(S.key, b);
      S.notes.push(j.note); S.pin = null; S.arm = false; S.noteT = null;
      notes(); bar(); pins(); bumpCount(1);
      const n = $('#rmText'); if (n) n.focus();
    } catch (e) { o.toast(e.message); }
  }
  function bumpCount(d) { const i = S.list && S.list.items.find(x => x.key === S.key); if (i) { i.notes += d; i.open = S.notes.filter(n => !n.done).length; versions(); } }

  /* ----- decisions ----- */
  function decide() {
    const D = $('#rmDecide'), it = S.item; if (!D) return;
    if (!it) { D.innerHTML = ''; return; }
    const i = it.item, can = it.can || {}, open = S.notes.filter(n => !n.done).length;
    const [cls, lab] = STATUS[i.status] || STATUS.waiting;
    let msg = '', btns = '';
    if (i.kind === 'rev' && me === 'client') {
      if (i.status === 'waiting') { msg = open ? `${open} note${open === 1 ? '' : 's'} ready to send.` : 'Watch it through, leave notes, then let us know.'; if (!o.readOnly) btns = `<button class="btn grad-b" type="button" data-r="approve">Approve</button><button class="btn ghost" type="button" data-r="changes">Ask for changes</button>`; }
      else msg = i.status === 'approved' ? 'You approved this one. Thank you.' : 'Your notes are with us. The next version will show up right here.';
    } else if (i.kind === 'cut') {
      msg = i.status === 'waiting' ? (can.decide ? 'Approve it, or send it back with your notes.' : 'Waiting on Nate.') : i.status === 'approved' ? (i.sent ? `Approved and sent to the client ${day(i.sent)}.` : 'Approved.') : 'Notes went back to the editor.';
      if (can.decide && !o.readOnly) btns += `<button class="btn" type="button" data-r="approve">Approve</button><button class="btn ghost" type="button" data-r="changes">Needs changes</button>`;
      if (can.send && !o.readOnly) btns += `<button class="btn grad-b" type="button" data-r="send">Send to the client</button>`;
    } else {
      msg = i.status === 'waiting' ? (me === 'team' && room === 'client' ? (i.notified ? 'With the client.' : 'The client has not been emailed about this one yet.') : 'With the client.') : i.status === 'approved' ? 'The client approved it.' : 'The client asked for changes.';
      if (can.notify && !o.readOnly) btns = `<button class="btn sm" type="button" data-r="notify">Email the client</button>`;
    }
    D.innerHTML = `<span class="rm-chip ${cls}">${lab}</span><span class="msg">${esc(msg)}</span>${btns}`;
  }
  function confirmDecision(action) {
    const it = S.item, i = it.item, open = S.notes.filter(n => !n.done).length, name = `${i.title}${i.version ? ' v' + i.version : ''}`;
    const client = me === 'client';
    const body = action === 'approve'
      ? `<p style="margin:0 0 6px">${client ? `This tells us <b>${esc(name)}</b> is good to go.` : `<b>${esc(name)}</b> gets marked approved, and the editor gets an email.`}</p>`
      : `<p style="margin:0 0 10px">${open ? `${open} note${open === 1 ? '' : 's'} will go to ${client ? 'DEPARTURZ' : 'the editor'}.` : 'Add at least one note so we know what to change.'}</p>`;
    o.modal(`<h3 id="sheetTitle">${action === 'approve' ? 'Approve ' + esc(name) + '?' : 'Ask for changes?'}</h3>${body}
      <label class="field">Anything else? (optional)<textarea id="rmDecTx" placeholder="${action === 'approve' ? 'A note to go with it' : 'Overall thoughts'}"></textarea></label>
      <div class="acts"><button class="btn${action === 'approve' ? ' grad-b' : ''}" type="button" id="rmDecGo">${action === 'approve' ? 'Approve' : client ? 'Send my notes' : 'Send notes to the editor'}</button><button class="btn ghost" type="button" data-close>Back</button></div>`);
    document.getElementById('rmDecGo').addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true;
      const text = (document.getElementById('rmDecTx').value || '').trim();
      try {
        const j = o.live ? await o.api('room/decide', { item: S.key, action, text }) : o.sample.decide(S.key, action, text);
        o.closeModal();
        o.toast(action === 'approve' ? 'Approved. Thank you.' : client ? 'Notes sent to DEPARTURZ.' : 'Notes sent to the editor.');
        await loadList(S.key); void j;
      } catch (e) { b.disabled = false; o.toast(e.message); }
    });
  }
  function sendModal() {
    const i = S.item.item;
    o.modal(`<h3 id="sheetTitle">Send to the client</h3><p style="margin:0 0 10px">A copy goes into their review room and they get an email. Your notes and the editor's name stay in here.</p>
      <label class="field">Name it as the client will see it<input id="rmSendT" value="${esc(i.title)}"></label>
      <div class="acts"><button class="btn grad-b" type="button" id="rmSendGo">Send</button><button class="btn ghost" type="button" data-close>Back</button></div>`);
    document.getElementById('rmSendGo').addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true;
      try { const j = o.live ? await o.api('room/send', { item: S.key, title: document.getElementById('rmSendT').value.trim() }) : o.sample.send(S.key); o.closeModal(); o.toast(j.emailed ? 'Sent. The client has been emailed.' : 'Sent to their review room.'); await loadList(S.key); }
      catch (e) { b.disabled = false; o.toast(e.message); }
    });
  }
  function uploadModal() {
    const ed = room === 'editors';
    o.modal(`<h3 id="sheetTitle">${ed ? 'Upload a cut' : 'Send a file to this room'}</h3>
      <p style="margin:0 0 10px">${ed ? 'Nate gets an email the moment it lands. Name it like "Teaser v3" and the versions line up by themselves.' : 'It goes into the project\'s For review folder and the client gets an email.'} MP4 (H.264) plays best.</p>
      <label class="field">File<input type="file" id="rmFile" accept="video/*,image/*,application/pdf,audio/*"></label>
      ${ed ? '<label class="field">A note for Nate (optional)<textarea id="rmUpNote" placeholder="What changed in this version"></textarea></label>' : ''}
      <div class="acts"><button class="btn" type="button" id="rmUpGo">Upload</button><button class="btn ghost" type="button" data-close>Cancel</button></div>`);
    document.getElementById('rmUpGo').addEventListener('click', async () => {
      const f = document.getElementById('rmFile').files[0]; if (!f) return o.toast('Pick a file first.');
      const note = ed ? (document.getElementById('rmUpNote').value || '').trim() : '';
      o.closeModal();
      if (!o.live) return o.toast('Uploads land in the Drive in the live portal (preview).');
      try {
        const done = await o.upload(f, ed ? { cut: S.project, note } : { review: S.project });
        o.toast(ed ? 'Uploaded. Nate has been told.' : 'Uploaded. The client has been emailed.');
        await loadList(ed ? 'cut:' + done.cut : 'rev:' + done.review);
      } catch (e) { o.toast(e.message); }
    });
  }

  /* ----- full screen ----- */
  function full(on) {
    let F = document.querySelector('.rm-full');
    if (!on) { if (F) F.remove(); S.full = false; if (media && media.tagName === 'VIDEO') { media.style.display = 'none'; el.appendChild(media); } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); pins(); bar(); return; }
    if (!S.item) return;
    S.full = true;
    if (!F) { F = document.createElement('div'); F.className = 'rm-full'; document.body.appendChild(F); F.addEventListener('click', onClick); }
    F.innerHTML = `<div class="box"><button class="close" type="button" data-r="unfull" aria-label="Close full screen">${ICON.close}</button><div class="wrap"></div></div><div class="rm-bar"></div>`;
    const wrap = F.querySelector('.wrap');
    if (media && (media.tagName === 'VIDEO' || media.tagName === 'IMG' || media.tagName === 'CANVAS')) {
      if (media.tagName === 'VIDEO') { media.style.display = 'block'; wrap.appendChild(media); }
      else { const c = media.tagName === 'IMG' ? media.cloneNode() : (() => { const k = document.createElement('canvas'); k.width = media.width; k.height = media.height; k.getContext('2d').drawImage(media, 0, 0); return k; })(); wrap.appendChild(c); }
      const m = wrap.firstChild; m.style.maxHeight = 'calc(100dvh - 70px)'; m.style.maxWidth = '100vw';
      m.addEventListener('click', e => { if (!S.arm || !S.item.can.note) { if (media.tagName === 'VIDEO') togglePlay(); return; } const r = m.getBoundingClientRect(); S.pin = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; S.arm = false; media.tagName === 'VIDEO' && media.pause(); pins(); compose(); full(false); const t = $('#rmText'); if (t) t.focus(); });
    }
    bar(F.querySelector('.rm-bar'));
    if (F.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) F.requestFullscreen().catch(() => {});
    pins();
  }
  document.addEventListener('fullscreenchange', onFs);
  function onFs() { if (!document.fullscreenElement && S.full) full(false); }

  /* ----- fallback without WebGL: the media laid over the screen with a CSS transform ----- */
  function fallbackShow(m) {
    const q = SCENE_NOW && SCENE_NOW.quads.screen; if (!q) return;
    let f = stageEl.querySelector('.rm-fallback'); if (!f) return;
    let box = f.querySelector('.scr'); if (!box) { box = document.createElement('div'); box.className = 'scr'; box.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:900px;transform-origin:0 0;background:#000;display:grid;place-items:center;overflow:hidden'; f.appendChild(box); }
    box.innerHTML = ''; if (m) { const n = m.tagName === 'VIDEO' ? m : m.tagName === 'CANVAS' ? m : m.cloneNode(); n.style.cssText = 'max-width:100%;max-height:100%;display:block'; box.appendChild(n); }
    const r = stageEl.getBoundingClientRect(), H = homography(UNIT.map(([x, y]) => [x * 1600, y * 900]), q.map(([x, y]) => [x * r.width, y * r.height]));
    box.style.transform = `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,${H[8]})`;
  }
  let SCENE_NOW = null;

  /* ----- events ----- */
  function togglePlay() { if (!media || !media.play) return; if (media.paused) media.play().catch(() => o.toast('Tap play again to start it.')); else media.pause(); }
  async function onClick(e) {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = b.dataset.r;
    if (r === 'open') return open(b.dataset.key);
    if (r === 'play') return togglePlay();
    if (r === 'mute') { if (media) { media.muted = !media.muted; bar(); if (S.full) bar(document.querySelector('.rm-full .rm-bar')); } return; }
    if (r === 'full') return full(true);
    if (r === 'unfull') return full(false);
    if (r === 'prev') return page(S.page - 1);
    if (r === 'next') return page(S.page + 1);
    if (r === 'seek') { if (media) { media.currentTime = +b.dataset.t; media.pause(); tick(); } return; }
    if (r === 'gopage') return page(+b.dataset.p);
    if (r === 'timechip') { S.useTime = !S.useTime; compose(); return; }
    if (r === 'arm') { if (S.pin) { S.pin = null; S.arm = false; } else { S.arm = !S.arm; if (S.arm && media && media.pause) media.pause(); } stageEl.classList.toggle('arm', S.arm); compose(); pins(); if (S.arm) hint(S.full ? '' : 'Tap the spot on the big screen'); return; }
    if (r === 'add') return addNote();
    if (r === 'pinnote') { const n = el.querySelector(`[data-note="${window.CSS && CSS.escape ? CSS.escape(b.dataset.id) : b.dataset.id}"]`); if (n) { n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); n.animate && n.animate([{ background: '#EFEAFE' }, { background: '' }], 900); } return; }
    if (r === 'done' || r === 'remove') {
      try {
        if (o.live) await o.api(r === 'done' ? 'room/note/done' : 'room/note/remove', { item: S.key, id: b.dataset.id }); else o.sample[r](S.key, b.dataset.id);
        if (r === 'done') { const n = S.notes.find(x => x.id === b.dataset.id); n.done = !n.done; } else { S.notes = S.notes.filter(x => x.id !== b.dataset.id); bumpCount(-1); }
        notes(); bar(); pins(); decide(); versions();
      } catch (err) { o.toast(err.message); }
      return;
    }
    if (r === 'approve' || r === 'changes') return confirmDecision(r === 'approve' ? 'approve' : 'changes');
    if (r === 'send') return sendModal();
    if (r === 'upload') return uploadModal();
    if (r === 'notify') { b.disabled = true; try { const j = o.live ? await o.api('room/notify', { item: S.key }) : { emailed: 1 }; o.toast(j.emailed ? 'The client has been emailed.' : 'Nothing new to tell them.'); await loadList(S.key); } catch (err) { b.disabled = false; o.toast(err.message); } return; }
    if (r === 'dl') return o.openFile && S.item && o.openFile(S.item.fileId);
  }
  function hint(t) { let h = stageEl.querySelector('.rm-hint'); if (!t) { if (h) h.remove(); return; } if (!h) { h = document.createElement('div'); h.className = 'rm-hint'; stageEl.appendChild(h); } h.textContent = t; clearTimeout(hint.t); hint.t = setTimeout(() => h.remove(), 3200); }
  el.addEventListener('click', onClick);
  el.addEventListener('change', e => { if (e.target.id === 'rmProj') { S.project = e.target.value; S.key = ''; loadList(); } });
  el.addEventListener('focusin', e => { if (e.target.id === 'rmText' && media && media.pause && !media.paused) { media.pause(); } if (e.target.id === 'rmText' && media) S.noteT = media.currentTime; });
  el.addEventListener('keydown', e => { if (e.target.id === 'rmText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } });
  // scrubbing
  let scrubbing = null;
  document.addEventListener('pointerdown', onDown);
  function onDown(e) { const sc = e.target.closest && e.target.closest('.rm-scrub'); if (!sc) return; scrubbing = sc; sc.setPointerCapture && sc.setPointerCapture(e.pointerId); seekFrom(e, sc); }
  const onMove = e => { if (scrubbing) seekFrom(e, scrubbing); };
  const onUp = () => { scrubbing = null; };
  document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  // clicking the big screen: play/pause, or drop the pin
  stageEl.addEventListener('click', e => {
    if (e.target.closest('[data-r]')) return;
    const r = stageEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (S.arm && stage) {
      const c = stage.toContent(x, y);
      if (!c) { hint('Tap on the big screen'); return; }
      S.pin = c; S.arm = false; stageEl.classList.remove('arm'); hint(''); pins(); compose(); const t = $('#rmText'); if (t) t.focus();
      return;
    }
    togglePlay();
  });
  // keyboard, only when nothing else has focus
  const onKey = e => {
    if (dead || !document.body.contains(el)) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || !document.getElementById('modal').hidden) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && media && media.duration) { e.preventDefault(); media.currentTime += (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 / 24 : 2); tick(); }
    else if (e.key === 'f') full(!S.full);
    else if (e.key === 'Escape' && S.full) full(false);
    else if (e.key === 'n') { const t = $('#rmText'); if (t) { e.preventDefault(); t.focus(); } }
  };
  document.addEventListener('keydown', onKey);

  /* ----- start ----- */
  (async () => {
    try {
      const sc = SCENE_NOW = await loadScene(o.base || '');
      if (dead) return;
      try { stage = new Stage(stageEl, sc); stage.onDraw = () => { if (S.item && ['image', 'pdf', 'video'].includes(S.item.type)) pins(); }; }
      catch (err) { fallback = true; const f = document.createElement('div'); f.className = 'rm-fallback'; f.innerHTML = `<img src="${esc(sc.base + sc.cfg.still)}" alt="" style="width:100%;height:100%;object-fit:cover">`; stageEl.prepend(f); }
      if (sc.cfg.loop && stage && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        baseVideo = document.createElement('video'); baseVideo.muted = true; baseVideo.loop = true; baseVideo.playsInline = true; baseVideo.setAttribute('playsinline', ''); baseVideo.preload = 'auto';
        baseVideo.src = sc.base + sc.cfg.loop; baseVideo.style.display = 'none'; el.appendChild(baseVideo);
        baseVideo.play().then(() => stage.setBase(baseVideo)).catch(() => {});
      }
      const ld = stageEl.querySelector('.rm-loading'); if (ld) ld.remove();
    } catch (err) { const ld = stageEl.querySelector('.rm-loading'); if (ld) ld.textContent = 'The room did not load. Refresh to try again.'; }
    try { await loadList(o.pick); } catch (err) { $('#rmVers').innerHTML = `<div class="rm-empty">${esc(err.message)}</div>`; }
  })();

  return {
    destroy() {
      dead = true; full(false); clearMedia(); if (baseVideo) { baseVideo.pause(); baseVideo.remove(); }
      if (stage) stage.destroy();
      document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('fullscreenchange', onFs);
      el.innerHTML = '';
    }
  };
}

window.DPZRoom = { mount, findQuads, homography };
})();
