/* The DEPARTURZ viewing room (work.html).
   A cube hangs on one corner in a dark room. Pick any file and the cube powers on:
   its edges light up from the bottom corner, a web of triangles spreads over the faces, then the video
   fills every face while the cube turns slowly and lights the room around it.
   Needs three.js r128 (loaded before this file). Without WebGL the video plays flat in the same dark room. */
(function(){
  'use strict';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DATA = JSON.parse(document.getElementById('files').textContent);
  const FILES = [];
  DATA.forEach((dr, d) => dr.files.forEach((f, i) => FILES.push(Object.assign({}, f, { d, i, drawer: dr.name }))));
  const $ = id => document.getElementById(id);
  const room = $('room'), stage = $('roomStage'), video = $('roomVideo');
  const ui = { idle: $('roomIdle'), bar: $('roomBar'), now: $('roomNow'), kind: $('roomKind'), title: $('roomTitle'), play: $('roomPlay'), sound: $('roomSound'),
    full: $('roomFull'), info: $('roomInfo'), prev: $('roomPrev'), next: $('roomNext'), details: $('roomDetails'), desc: $('roomDesc'), list: $('roomList'), link: $('roomLink') };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let cur = -1, soundOn = false, token = 0, wasPlaying = false, holding = false;
  let visible = (() => { const r = room.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })();
  let G = null;            // the 3D room, once it's built
  const clock = () => (window.__roomClock ? window.__roomClock() : performance.now()) / 1000;
  let slate = null;        // the "coming soon" picture for files without a video

  /* ---------------- the controls ---------------- */
  const ICON = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
    on: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    off: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'
  };
  const svg = k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';
  function paintControls(){
    const f = FILES[cur]; if (!f) return;
    const has = !!f.video;
    const playing = has && !video.paused;
    ui.play.innerHTML = svg(playing ? 'pause' : 'play'); ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play'); ui.play.disabled = !has;
    ui.sound.hidden = !has || !f.sound;
    ui.sound.innerHTML = svg(soundOn ? 'on' : 'off') + '<span>' + (soundOn ? 'Sound on' : 'Sound off') + '</span>';
    ui.sound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    ui.full.disabled = !has;
  }
  function showFile(f){
    ui.idle.hidden = true; ui.bar.hidden = false;
    room.classList.toggle('no-video', !f.video); $('roomSoon').innerHTML = '<b>' + esc(f.status || 'Coming soon') + '</b><span>' + esc(f.code + ' // ' + f.title.toUpperCase()) + '</span>';
    ui.now.textContent = 'Now showing · ' + f.code + ' // ' + f.title.toUpperCase();
    ui.kind.textContent = f.code + ' // ' + f.drawer + ' · ' + f.kind + (f.status ? ' · ' + f.status : '');
    ui.title.textContent = f.title;
    ui.desc.textContent = f.desc || '';
    const rows = [['File', f.code], ['Service', f.drawer]]; if (f.client) rows.push(['Client', f.client]);
    ui.list.innerHTML = rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
    if (f.link){ ui.link.hidden = false; ui.link.href = f.link; ui.link.textContent = f.link === './' ? 'Back to the home page' : 'Visit site ↗'; ui.link.target = f.link.startsWith('http') ? '_blank' : '_self'; }
    else ui.link.hidden = true;
    document.querySelectorAll('.f-file.showing').forEach(b => b.classList.remove('showing'));
    const btn = document.querySelector('.f-file[data-d="' + f.d + '"][data-i="' + f.i + '"]'); if (btn) btn.classList.add('showing');
    paintControls();
  }

  /* ---------------- picking a file ---------------- */
  // called straight from a click, so the browser lets the video start (and keep its sound later)
  function pick(k, how){
    const f = FILES[k]; if (!f) return;
    const my = ++token; const first = cur < 0; cur = k;
    showFile(f);
    if (f.video){
      video.loop = false; video.muted = !(soundOn && f.sound); video.volume = 0;
      if (video.getAttribute('src') !== f.video){ video.src = f.video; if (f.thumb) video.poster = f.thumb; }
      try { video.currentTime = 0; } catch (e) {}
      const p = video.play();
      // hold the picture until the cube has powered on (the play above is what unlocks it)
      holding = !!G && !RM;
      const hold = () => { if (my === token && holding) { video.pause(); try { video.currentTime = 0; } catch (e) {} } };
      if (p && p.then) p.then(hold, () => { video.muted = true; soundOn = false; paintControls(); video.play().then(hold, () => {}); }); else hold();
    } else { video.pause(); video.removeAttribute('src'); video.load(); }
    const go = () => {
      if (my !== token) return;
      if (G) G.show(f, first, () => { if (my === token) roll(f); });
      else roll(f);
    };
    if (how === 'scroll'){
      const r = room.getBoundingClientRect();
      const far = r.top < -40 || r.top > window.innerHeight * 0.35;
      if (far){ room.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); setTimeout(go, RM ? 0 : Math.min(900, 260 + Math.abs(r.top) * 0.35)); return; }
    }
    go();
  }
  // the cube is on: start the picture (and the sound, if they turned it on)
  function roll(f){
    holding = false;
    if (!f.video) return paintControls();
    video.volume = 1; video.muted = !(soundOn && f.sound);
    try { if (video.currentTime > 0.5) video.currentTime = 0; } catch (e) {}
    const p = video.play(); if (p && p.catch) p.catch(() => { video.muted = true; soundOn = false; video.play().catch(() => {}); paintControls(); });
    paintControls();
  }
  const withVideo = (from, dir) => { for (let n = 1; n <= FILES.length; n++){ const k = (from + dir * n + FILES.length * 2) % FILES.length; if (FILES[k].video) return k; } return from; };
  const step = dir => pick((cur + dir + FILES.length) % FILES.length);
  video.addEventListener('ended', () => { if (cur >= 0 && video.duration > 1 && video.currentTime >= video.duration - 0.6) pick(withVideo(cur, 1)); });   // the screening runs on to the next film
  ['play', 'pause'].forEach(e => video.addEventListener(e, paintControls));

  document.querySelectorAll('.f-file').forEach(b => b.addEventListener('click', () => {
    const k = FILES.findIndex(f => f.d === +b.dataset.d && f.i === +b.dataset.i); if (k >= 0) pick(k, 'scroll');
  }));
  $('roomStart').addEventListener('click', () => pick(Math.max(0, FILES.findIndex(f => f.video && f.code.startsWith('PRD')))));
  ui.prev.addEventListener('click', () => step(-1));
  ui.next.addEventListener('click', () => step(1));
  ui.play.addEventListener('click', () => { if (!FILES[cur] || !FILES[cur].video) return; if (video.paused) video.play().catch(() => {}); else video.pause(); });
  ui.sound.addEventListener('click', () => { soundOn = !soundOn; video.muted = !soundOn; video.volume = 1; if (soundOn && video.paused && !holding) video.play().catch(() => {}); paintControls(); });
  ui.info.addEventListener('click', () => { const open = ui.details.hidden; ui.details.hidden = !open; ui.info.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  $('roomDetailsX').addEventListener('click', () => { ui.details.hidden = true; ui.info.setAttribute('aria-expanded', 'false'); ui.info.focus(); });
  // full screen: the film on its own, with the browser's controls
  ui.full.addEventListener('click', () => {
    if (!FILES[cur] || !FILES[cur].video) return;
    video.controls = true;
    if (video.requestFullscreen) video.requestFullscreen().catch(() => { video.controls = false; });
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    if (video.paused) video.play().catch(() => {});
  });
  const leftFull = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) video.controls = false; };
  document.addEventListener('fullscreenchange', leftFull); document.addEventListener('webkitfullscreenchange', leftFull);
  video.addEventListener('webkitendfullscreen', () => { video.controls = false; });
  document.addEventListener('keydown', e => {
    if (cur < 0 || !visible || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    if (!room.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  });
  // out of sight, out of mind: pause the film when the room scrolls away, pick it back up on return
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(en => {
    visible = en.isIntersecting && en.intersectionRatio > 0.15;
    if (G) G.awake(visible);
    if (!visible && FILES[cur] && FILES[cur].video && !video.paused && !document.fullscreenElement){ wasPlaying = true; video.pause(); }
    else if (visible && wasPlaying){ wasPlaying = false; video.play().catch(() => {}); }
  }), { threshold: [0, 0.15, 0.4] }).observe(room);

  /* ---------------- the "coming soon" picture ---------------- */
  function slateFor(f){
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(512, 380, 40, 512, 512, 760); g.addColorStop(0, '#26262B'); g.addColorStop(1, '#070708');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    const t = x.createLinearGradient(160, 0, 860, 0); t.addColorStop(0, '#3FB8EE'); t.addColorStop(1, '#9E80F2');
    x.textAlign = 'center'; x.fillStyle = t; x.font = '400 150px Anton, Impact, sans-serif';
    String(f.status || 'Coming soon').toUpperCase().split(' ').reduce((rows, w) => { const l = rows[rows.length - 1]; if (l && (l + ' ' + w).length <= 9) rows[rows.length - 1] = l + ' ' + w; else rows.push(w); return rows; }, [])
      .forEach((l, n, a) => x.fillText(l, 512, 520 - (a.length - 1) * 75 + n * 150));
    x.fillStyle = 'rgba(242,240,235,.8)'; x.font = '500 30px "Martian Mono", Menlo, monospace';
    x.fillText(f.code + ' // ' + f.title.toUpperCase(), 512, 800);
    return c;
  }

  /* ---------------- the 3D room ---------------- */
  function build(){
    const T = window.THREE; if (!T) throw new Error('no three');
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no webgl');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x050506, 1);
    stage.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new T.Scene();
    scene.fog = new T.FogExp2(0x050506, 0.024);
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 220);

    const S = 6, H = S / 2, DIAG = S * Math.sqrt(3);
    const BOTTOM = 3.3;                                  // how high the lowest corner hangs over the floor
    const LIFT = BOTTOM + H * Math.sqrt(3);              // the cube's centre

    // soft round glow, used for flares, light pools and haze
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(.6, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); return t; })();

    /* the faces: the film (or a slate), a web of triangles, and a reveal that spreads from the bottom corner */
    const black = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, T.RGBAFormat); black.needsUpdate = true;
    const vtex = new T.VideoTexture(video); vtex.minFilter = T.LinearFilter; vtex.magFilter = T.LinearFilter; vtex.generateMipmaps = false;
    const faceU = {
      uTex: { value: black }, uCrop: { value: new T.Vector4(1, 1, 0, 0) }, uReveal: { value: 0 }, uWire: { value: 0 }, uWireGlow: { value: 0 },
      uIdle: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 }, uStart: { value: new T.Vector3(-H, -H, -H) }, uDiag: { value: DIAG }
    };
    const faceMat = new T.ShaderMaterial({
      uniforms: faceU, side: T.DoubleSide, extensions: { derivatives: true },
      vertexShader: `varying vec2 vUv; varying vec3 vPos; varying vec3 vN; varying vec3 vWN; varying vec3 vV;
        void main(){ vUv = uv; vPos = position; vN = normal; vec4 wp = modelMatrix * vec4(position, 1.0);
          vWN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec4 uCrop; uniform float uReveal, uWire, uWireGlow, uIdle, uOn, uTime, uDiag; uniform vec3 uStart;
        varying vec2 vUv; varying vec3 vPos; varying vec3 vN; varying vec3 vWN; varying vec3 vV;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lineAA(float d, float w){ return 1.0 - smoothstep(w * 0.55, w * 1.6, d); }
        void main(){
          float seed = dot(floor(vN + 0.5), vec3(3.0, 7.0, 13.0));
          // a slightly warped triangle lattice, shown triangle by triangle
          vec2 q = vUv * 4.6 + vec2(sin(vUv.y * 6.0 + seed) * 0.16, cos(vUv.x * 5.0 + seed * 1.7) * 0.16);
          vec2 p = vec2(q.x + q.y * 0.5, q.y);
          vec2 c = floor(p), f = fract(p); float up = step(1.0, f.x + f.y);
          float r = hash(c + vec2(up * 17.0 + seed, seed * 3.1));
          float s = p.x + p.y; float fs = fract(s);
          float l = max(max(lineAA(min(f.x, 1.0 - f.x), fwidth(p.x)), lineAA(min(f.y, 1.0 - f.y), fwidth(p.y))), lineAA(min(fs, 1.0 - fs), fwidth(s)));
          float shown = step(r, max(uWire, uIdle));
          float twinkle = 0.55 + 0.45 * sin(uTime * 2.3 + r * 40.0);
          // the reveal spreads out from the bottom corner
          float d = distance(vPos, uStart) / uDiag;
          float rev = 1.0 - smoothstep(uReveal - 0.09, uReveal, d);
          float front = exp(-pow((d - uReveal + 0.02) * 30.0, 2.0)) * smoothstep(0.06, 0.3, uReveal) * (1.0 - smoothstep(1.0, 1.12, uReveal));
          vec2 e = min(vUv, 1.0 - vUv); float edge = min(e.x, e.y);
          vec3 film = texture2D(uTex, vUv * uCrop.xy + uCrop.zw).rgb;
          float fres = pow(1.0 - abs(dot(normalize(vWN), vV)), 3.0);
          vec3 glass = vec3(0.010, 0.010, 0.013) + vec3(0.045, 0.047, 0.055) * fres;
          vec3 col = mix(glass, film * (0.78 + 0.22 * smoothstep(0.0, 0.14, edge)), rev * uOn);
          vec3 wireCol = mix(vec3(0.86, 0.9, 1.0), film * 0.9 + 0.18, rev);
          float wireI = mix(uWireGlow * twinkle, 0.22 * uWireGlow, rev) + uIdle * 0.09 * twinkle;
          col += wireCol * l * shown * wireI;
          col += vec3(1.0) * front * 1.1;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const box = new T.Mesh(new T.BoxGeometry(S, S, S), faceMat);

    /* the edges: a bright core and a soft glow, each drawn out from the corner nearer the bottom */
    const corners = []; for (let n = 0; n < 8; n++) corners.push(new T.Vector3(n & 1 ? H : -H, n & 2 ? H : -H, n & 4 ? H : -H));
    const depth = n => (n & 1 ? 1 : 0) + (n & 2 ? 1 : 0) + (n & 4 ? 1 : 0);
    const edges = [];
    const coreGeo = new T.CylinderGeometry(0.045, 0.045, 1, 6, 1, true), glowGeo = new T.CylinderGeometry(0.42, 0.42, 1, 14, 1, true);
    const edgeVS = `varying float vY; varying vec3 vWN; varying vec3 vV; void main(){ vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vWN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
    const coreFS = `uniform float uProg, uI; uniform vec3 uColor; varying float vY; varying vec3 vWN; varying vec3 vV;
      void main(){ if (vY > uProg) discard; float head = smoothstep(uProg - 0.16, uProg, vY) * (1.0 - step(0.999, uProg)); gl_FragColor = vec4(uColor * (uI + head * 2.2), 1.0); }`;
    const glowFS = `uniform float uProg, uI; uniform vec3 uColor; varying float vY; varying vec3 vWN; varying vec3 vV;
      void main(){ float on = 1.0 - smoothstep(uProg - 0.02, uProg + 0.02, vY); float head = smoothstep(uProg - 0.2, uProg, vY) * on * (1.0 - step(0.999, uProg));
        float a = pow(abs(dot(normalize(vWN), vV)), 3.0) * (uI * 0.55 + head * 1.4) * on; gl_FragColor = vec4(uColor * a, a); }`;
    const up = new T.Vector3(0, 1, 0);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const x = a ^ b; if (x !== 1 && x !== 2 && x !== 4) continue;
      const [lo, hi] = depth(a) < depth(b) ? [a, b] : [b, a];
      const A = corners[lo], B = corners[hi], mid = A.clone().add(B).multiplyScalar(0.5), dir = B.clone().sub(A).normalize();
      const mk = (geo, fs, extra) => { const m = new T.Mesh(geo, new T.ShaderMaterial(Object.assign({ uniforms: { uProg: { value: 0 }, uI: { value: 0 }, uColor: { value: new T.Color(0xEEF4FF) } }, vertexShader: edgeVS, fragmentShader: fs }, extra)));
        m.position.copy(mid); m.quaternion.setFromUnitVectors(up, dir); m.scale.set(1, S, 1); return m; };
      const core = mk(coreGeo, coreFS, {});
      const glow = mk(glowGeo, glowFS, { transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      edges.push({ core, glow, level: depth(lo), to: hi, p: 0, i: 0 });
    }
    // flares at the corners: the bottom one starts it all, the rest catch the light as the edges arrive
    const flares = corners.map((c, n) => { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xEEF4FF, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.position.copy(c); s.scale.setScalar(n === 0 ? 3 : 1.6); return s; });

    const cube = new T.Group();                         // the cube in its own coordinates
    cube.add(box); edges.forEach(e => cube.add(e.core, e.glow)); flares.forEach(f => cube.add(f));
    const tilt = new T.Group(); tilt.quaternion.setFromUnitVectors(new T.Vector3(1, 1, 1).normalize(), up); tilt.add(cube);   // balanced on a corner
    const rig = new T.Group(); rig.position.y = LIFT; rig.add(tilt); scene.add(rig);

    // its reflection in the floor
    const mirror = new T.Group(); mirror.scale.y = -1; const rigM = rig.clone(); mirror.add(rigM); scene.add(mirror);
    rigM.traverse(o => { o.renderOrder = -2; });

    /* the room: a glossy floor, a pool of light under the cube, a lit square on the floor, and haze */
    const floor = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.3, metalness: 0.55, transparent: true, opacity: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.renderOrder = -1; scene.add(floor);
    const pool = new T.Mesh(new T.PlaneGeometry(36, 36), new T.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; scene.add(pool);
    const rimTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 344; const x = c.getContext('2d');
      x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 5; x.shadowColor = '#fff'; x.shadowBlur = 16; x.strokeRect(14, 14, 484, 316); return new T.CanvasTexture(c); })();
    const stageRim = new T.Mesh(new T.PlaneGeometry(3.4, 2.4), new T.MeshBasicMaterial({ map: rimTex, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
    stageRim.rotation.x = -Math.PI / 2; stageRim.position.set(0, 0.03, 1.7); scene.add(stageRim);
    const wall = new T.Mesh(new T.PlaneGeometry(150, 70), new T.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    wall.position.set(0, 14, -46); scene.add(wall);
    const haze = [[-7, 9, -6, 18], [8, 12, -9, 22], [0, 16, -14, 30], [0, 5, 1, 14]].map(([x, y, z, s]) => {
      const h = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      h.position.set(x, y, z); h.scale.set(s, s * 0.7, 1); scene.add(h); return h; });
    const amb = new T.AmbientLight(0x16161c, 0.6); scene.add(amb);
    const lamp = new T.PointLight(0xffffff, 0, 70, 1.6); lamp.position.set(0, LIFT - 2, 1); scene.add(lamp);

    /* the room's colour comes from the film: a tiny copy of each frame, averaged */
    const probe = document.createElement('canvas'); probe.width = 16; probe.height = 9; const px = probe.getContext('2d', { willReadFrequently: true });
    const tint = new T.Color(0x9E80F2), want = new T.Color(0x9E80F2); let bright = 0, brightWant = 0, frame = 0;
    function sample(){
      const f = FILES[cur];
      if (f && f.video && video.readyState >= 2 && faceU.uOn.value > 0.01){
        try { px.drawImage(video, 0, 0, 16, 9); const d = px.getImageData(0, 0, 16, 9).data; let r = 0, g = 0, b = 0;
          for (let n = 0; n < d.length; n += 4){ r += d[n]; g += d[n + 1]; b += d[n + 2]; }
          const k = d.length / 4 * 255; r /= k; g /= k; b /= k; const m = Math.max(r, g, b, 0.001);
          brightWant = Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) * 1.8 + 0.08); want.setRGB(r / m, g / m, b / m); } catch (e) {}
      } else if (f && !f.video && faceU.uOn.value > 0.01){ brightWant = 0.35; want.setRGB(0.62, 0.5, 0.95); }
      else brightWant = 0;
    }

    /* the power-on sequence */
    const st = { phase: 'off', t0: 0, dur: 2.6, idle: 0, onDone: null, spin: 0, vel: 0, drag: null, booted: false, awake: true, last: 0 };
    const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
    const seg = (t, a, b) => ease((t - a) / (b - a));
    function setTexture(f){
      if (f.video){
        faceU.uTex.value = vtex;
        const fit = () => { const w = video.videoWidth || 16, h = video.videoHeight || 9;
          if (w >= h) faceU.uCrop.value.set(h / w, 1, (1 - h / w) / 2, 0); else faceU.uCrop.value.set(1, w / h, 0, (1 - w / h) / 2); };
        if (video.readyState >= 1) fit(); else video.addEventListener('loadedmetadata', fit, { once: true });
      } else {
        if (slate) slate.dispose();
        slate = new T.CanvasTexture(slateFor(f)); faceU.uTex.value = slate; faceU.uCrop.value.set(1, 1, 0, 0);
        if (document.fonts && document.fonts.load) document.fonts.load('400 150px Anton').then(() => { if (FILES[cur] === f && slate){ slate.image = slateFor(f); slate.needsUpdate = true; } }).catch(() => {});
      }
    }
    function show(f, first, done){
      st.onDone = done;
      if (RM){ setTexture(f); st.phase = 'on'; st.booted = true; faceU.uReveal.value = 1.2; faceU.uOn.value = 1; faceU.uWire.value = 1; faceU.uWireGlow.value = 0.6; edges.forEach(e => { e.p = 1; e.i = 1; }); done(); return; }
      // switching films: the faces go dark first, then the cube powers on again
      st.next = f; st.phase = first && !st.booted ? 'boot' : 'down'; st.t0 = clock(); st.dur = first && !st.booted ? 2.6 : 2.1;
      if (st.phase === 'boot') setTexture(f);
    }
    function standby(){ if (st.booted || RM || cur >= 0) return; st.phase = 'standby'; st.t0 = clock(); st.booted = true; }
    function animate(now){
      const t = now - st.t0;
      if (st.phase === 'down'){
        const k = 1 - seg(t, 0, 0.42);
        faceU.uOn.value = Math.min(faceU.uOn.value, k); faceU.uWireGlow.value *= 0.9; edges.forEach(e => { e.i = Math.min(e.i, 0.25 + 0.75 * k); });
        if (t > 0.45){ setTexture(st.next); faceU.uReveal.value = 0; faceU.uWire.value = 0; edges.forEach(e => { e.p = 0; e.i = 0; }); st.phase = 'boot'; st.t0 = now; }
        return;
      }
      if (st.phase === 'boot' || st.phase === 'standby'){
        const sb = st.phase === 'standby', D = st.dur;
        const k = D / 2.6;                             // a switch runs a little quicker than the very first start
        flares[0].material.opacity = Math.max(0, Math.sin(Math.min(1, t / (0.55 * k)) * Math.PI)) * 0.95;
        flares[0].scale.setScalar(1.2 + 2.6 * seg(t, 0, 0.5 * k));
        edges.forEach(e => { const a = (0.12 + e.level * 0.36) * k, b = a + 0.42 * k; e.p = seg(t, a, b); e.i = e.p > 0 ? 1.0 : 0; });
        edges.forEach(e => { if (e.p > 0.98){ const fl = flares[e.to]; fl.material.opacity = Math.max(fl.material.opacity, 0.7); } });
        if (!sb){
          faceU.uWire.value = seg(t, 0.35 * k, 1.5 * k); faceU.uWireGlow.value = 0.95 * seg(t, 0.35 * k, 0.8 * k);
          faceU.uOn.value = 1; faceU.uReveal.value = 1.15 * seg(t, 1.25 * k, D);
          if (t > 1.2 * k && st.onDone){ const cb = st.onDone; st.onDone = null; cb(); }   // start the film as the picture spreads
          if (t >= D){ st.phase = 'on'; faceU.uReveal.value = 1.2; }
        } else {
          faceU.uWire.value = 0.55 * seg(t, 0.5, 1.6); faceU.uWireGlow.value = 0.6 * seg(t, 0.5, 1.0) * (1 - seg(t, 2.0, 3.2));
          if (t > 3.2){ st.phase = 'idle'; }
        }
        return;
      }
      if (st.phase === 'idle' || st.phase === 'off'){
        const lit = st.phase === 'idle' ? 1 : 0;
        edges.forEach(e => { e.p = lit; e.i += ((0.22 + 0.05 * Math.sin(now * 0.8 + e.level)) * lit - e.i) * 0.06; });
        faceU.uIdle.value = 0.55 * lit;
      }
      if (st.phase === 'on'){
        faceU.uWireGlow.value += (0.55 - faceU.uWireGlow.value) * 0.03;
        const pulse = 0.82 + 0.18 * bright;
        edges.forEach(e => { e.p = 1; e.i += (pulse - e.i) * 0.05; });
      }
    }

    /* drag to turn it; it keeps turning slowly on its own */
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, t: performance.now() }; st.vel = 0; });
    window.addEventListener('pointermove', e => { if (!st.drag) return; const dx = e.clientX - st.drag.x; st.drag.x = e.clientX; const dt = Math.max(8, performance.now() - st.drag.t); st.drag.t = performance.now(); st.spin += dx * 0.006; st.vel = dx * 0.006 / (dt / 1000); });
    window.addEventListener('pointerup', () => { st.drag = null; });
    window.addEventListener('pointercancel', () => { st.drag = null; });
    let mx = 0, my = 0, cx = 0, cy = 0;
    room.addEventListener('pointermove', e => { const r = room.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; });

    function frameCamera(){
      const w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
      renderer.setSize(w, h, false); camera.aspect = a;
      // tall screens step back so the whole cube fits across; wide ones get the low, looking-up view
      camera.fov = a < 1 ? 66 : 54;
      st.dist = a < 1 ? 12 + (1 - a) * 9 : 11.8;
      camera.updateProjectionMatrix();
    }
    frameCamera();
    if ('ResizeObserver' in window) new ResizeObserver(frameCamera).observe(stage); else window.addEventListener('resize', frameCamera);

    function tick(ms){
      st.raf = 0;
      if (!st.awake) return;
      st.raf = requestAnimationFrame(tick);
      const now = clock(), dt = Math.min(0.05, st.last ? Math.max(0, now - st.last) : 0.016); st.last = now;
      animate(now);
      faceU.uTime.value = now;
      if (!st.drag){ st.vel *= Math.pow(0.04, dt); st.spin += (RM ? 0 : 0.13) * dt + st.vel * dt; }
      rig.rotation.y = st.spin; rig.position.y = LIFT + (RM ? 0 : Math.sin(now * 0.45) * 0.12);
      rigM.position.copy(rig.position); rigM.rotation.copy(rig.rotation);
      edges.forEach(e => { [e.core, e.glow].forEach(m => { m.material.uniforms.uProg.value = e.p; m.material.uniforms.uI.value = e.i; m.visible = e.p > 0.001; }); });
      flares.forEach((f, n) => { if (n || st.phase !== 'boot') f.material.opacity *= 0.93; });
      if (++frame % 4 === 0) sample();
      bright += (brightWant * faceU.uOn.value * Math.min(1, faceU.uReveal.value) - bright) * 0.06; tint.lerp(want, 0.05);
      const edgeLight = edges.reduce((a, e) => a + e.i * e.p, 0) / edges.length;
      lamp.color.copy(tint).lerp(new T.Color(0xEEF4FF), 0.35); lamp.intensity = 0.6 * edgeLight + 4.2 * bright;
      pool.material.color.copy(tint); pool.material.opacity = 0.1 * edgeLight + 0.62 * bright;
      wall.material.color.copy(tint); wall.material.opacity = 0.04 * edgeLight + 0.32 * bright;
      haze.forEach((h, n) => { h.material.color.copy(tint); h.material.opacity = (0.015 * edgeLight + 0.08 * bright) * (n === 3 ? 0.6 : 1); });
      stageRim.material.opacity = 0.08 + 0.1 * edgeLight + 0.25 * bright;
      // the viewer's eye drifts a little with the mouse
      cx += ((RM ? 0 : mx) - cx) * 0.04; cy += ((RM ? 0 : my) - cy) * 0.04;
      camera.position.set(cx * 2.2, 1.25 - cy * 0.6, st.dist);
      camera.lookAt(0, camera.aspect < 1 ? 7.4 : 6.5, 0);
      renderer.render(scene, camera);
    }
    function awake(on){ st.awake = on; if (on){ if (!st.raf){ st.last = 0; st.raf = requestAnimationFrame(tick); } if (visible) standby(); } }
    document.addEventListener('visibilitychange', () => awake(!document.hidden && visible));
    room.classList.add('live');
    awake(visible);
    return { show, awake,
      peek: () => ({ phase: st.phase, reveal: faceU.uReveal.value, bright, edges: edges.map(e => +e.p.toFixed(2)) }) };
  }

  try { G = build(); }
  catch (e) { G = null; room.classList.add('flat'); }   // no WebGL: the film plays flat in the dark room
  window.__room = { pick, files: FILES, peek: () => G && G.peek() };
})();
