/* The DEPARTURZ viewing room (work.html).
   A big cube hangs in a dark hall (matte charcoal walls, a black marble floor) with one corner pointing at you, so you look up at its underside.
   Pick any file and the cube powers on: its edges light up from that corner, a web of triangles spreads over
   the faces, then the video fills the faces while the cube turns slowly, lighting the marble and mirrored in the floor.
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
    full: $('roomFull'), prev: $('roomPrev'), next: $('roomNext') };
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
  // black marble with white veins, drawn once: jagged cracks that branch, a little depth in the stone, slab seams
  function marble(w, h, seed, o){
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    let s = seed; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
    const U = w / 1024;
    x.fillStyle = '#0a0a0b'; x.fillRect(0, 0, w, h);
    for (let n = 0; n < 150; n++){
      const r = (0.03 + rnd() * 0.16) * w, px = rnd() * w, py = rnd() * h, g = x.createRadialGradient(px, py, 0, px, py, r);
      const v = rnd() < 0.55 ? '30,30,34' : '0,0,0';
      g.addColorStop(0, 'rgba(' + v + ',' + (0.1 + rnd() * 0.14).toFixed(2) + ')'); g.addColorStop(1, 'rgba(' + v + ',0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    for (let n = 0; n < w * h / 220; n++){ x.fillStyle = 'rgba(210,210,215,' + (rnd() * 0.07).toFixed(3) + ')'; x.fillRect(rnd() * w, rnd() * h, 1.3 * U, 1.3 * U); }
    x.lineCap = 'round'; x.lineJoin = 'round';
    function vein(px, py, a, wid, len, depth){
      const dir = a;
      for (let k = 0; k < len; k++){
        a += (rnd() - 0.5) * 1.15; a = a * 0.72 + dir * 0.28;
        const step = (5 + rnd() * 13) * U, nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
        const lw = Math.max(0.7 * U, wid * (0.5 + rnd() * 0.95));
        x.strokeStyle = 'rgba(244,244,240,' + (depth ? 0.5 + 0.2 / depth : 0.95) + ')'; x.lineWidth = lw;
        if (depth < 1){ x.shadowColor = 'rgba(255,255,255,.4)'; x.shadowBlur = lw * 1.6; } else x.shadowBlur = 0;
        x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        px = nx; py = ny;
        if (px < -80 * U || py < -80 * U || px > w + 80 * U || py > h + 80 * U) break;
        if (depth < 3 && rnd() < 0.055) vein(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.85), wid * 0.48, len * 0.42, depth + 1);
        wid *= 0.997;
      }
    }
    for (let n = 0; n < o.big; n++){
      const side = rnd(); let px, py, a;
      if (side < 0.5){ px = rnd() * w; py = -10; a = Math.PI / 2 + (rnd() - 0.5) * 1.5; } else { px = -10; py = rnd() * h; a = (rnd() - 0.5) * 1.5; }
      vein(px, py, a, (3.2 + rnd() * 5.5) * U, 300, 0);
    }
    for (let n = 0; n < o.thin; n++) vein(rnd() * w, rnd() * h, rnd() * Math.PI * 2, (0.8 + rnd() * 1.3) * U, 50 + rnd() * 90, 2);
    x.shadowBlur = 0;
    if (o.tiles){
      x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineWidth = 3 * U;
      for (let i = 0; i <= o.tiles[0]; i++){ const X = i * w / o.tiles[0]; x.beginPath(); x.moveTo(X, 0); x.lineTo(X, h); x.stroke(); }
      for (let j = 0; j <= o.tiles[1]; j++){ const Y = j * h / o.tiles[1]; x.beginPath(); x.moveTo(0, Y); x.lineTo(w, Y); x.stroke(); }
    }
    return c;
  }

  function build(){
    const T = window.THREE; if (!T) throw new Error('no three');
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no webgl');
    const small = window.innerWidth < 760;
    const DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    renderer.setPixelRatio(DPR);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x050506, 1);
    stage.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new T.Scene();
    const FOG = new T.Color(0x060607), FOGD = 0.015;
    scene.fog = new T.FogExp2(FOG, FOGD);
    const camera = new T.PerspectiveCamera(54, 1, 0.1, 260);

    const S = 6, H = S / 2, DIAG = S * Math.sqrt(3);
    const LIFT = 5.4;                                    // the cube's centre, hanging just over the floor
    const center = new T.Vector3(0, LIFT, 0);

    /* the faces: the film (or a slate), a web of triangles, and a reveal that spreads from the near corner */
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
          vec2 q = vUv * 4.6 + vec2(sin(vUv.y * 6.0 + seed) * 0.16, cos(vUv.x * 5.0 + seed * 1.7) * 0.16);
          vec2 p = vec2(q.x + q.y * 0.5, q.y);
          vec2 c = floor(p), f = fract(p); float up = step(1.0, f.x + f.y);
          float r = hash(c + vec2(up * 17.0 + seed, seed * 3.1));
          float s = p.x + p.y; float fs = fract(s);
          float l = max(max(lineAA(min(f.x, 1.0 - f.x), fwidth(p.x)), lineAA(min(f.y, 1.0 - f.y), fwidth(p.y))), lineAA(min(fs, 1.0 - fs), fwidth(s)));
          float shown = step(r, max(uWire, uIdle));
          float twinkle = 0.55 + 0.45 * sin(uTime * 2.3 + r * 40.0);
          float d = distance(vPos, uStart) / uDiag;
          float rev = 1.0 - smoothstep(uReveal - 0.09, uReveal, d);
          float front = exp(-pow((d - uReveal + 0.02) * 30.0, 2.0)) * smoothstep(0.06, 0.3, uReveal) * (1.0 - smoothstep(1.0, 1.12, uReveal));
          vec2 e = min(vUv, 1.0 - vUv); float edge = min(e.x, e.y);
          vec3 film = texture2D(uTex, vUv * uCrop.xy + uCrop.zw).rgb;
          float fres = pow(1.0 - abs(dot(normalize(vWN), vV)), 3.0);
          vec3 glass = vec3(0.010, 0.010, 0.013) + vec3(0.045, 0.047, 0.055) * fres;
          vec3 col = mix(glass, film * (0.8 + 0.2 * smoothstep(0.0, 0.12, edge)), rev * uOn);
          vec3 wireCol = mix(vec3(0.86, 0.9, 1.0), film * 0.9 + 0.18, rev);
          float wireI = mix(uWireGlow * twinkle, 0.2 * uWireGlow, rev) + uIdle * 0.09 * twinkle;
          col += wireCol * l * shown * wireI;
          col += vec3(1.0) * front * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const box = new T.Mesh(new T.BoxGeometry(S, S, S), faceMat);

    /* the edges: clean bright lines, drawn out from the near corner when the cube powers on */
    const corners = []; for (let n = 0; n < 8; n++) corners.push(new T.Vector3(n & 1 ? H : -H, n & 2 ? H : -H, n & 4 ? H : -H));
    const depth = n => (n & 1 ? 1 : 0) + (n & 2 ? 1 : 0) + (n & 4 ? 1 : 0);
    const edges = [];
    const coreGeo = new T.CylinderGeometry(0.036, 0.036, 1, 8, 1, true);
    const edgeVS = `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const coreFS = `uniform float uProg, uI; uniform vec3 uColor; varying float vY;
      void main(){ if (vY > uProg) discard; float head = smoothstep(uProg - 0.16, uProg, vY) * (1.0 - step(0.999, uProg)); gl_FragColor = vec4(uColor * (uI + head * 1.6), 1.0); }`;
    const up = new T.Vector3(0, 1, 0);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const x = a ^ b; if (x !== 1 && x !== 2 && x !== 4) continue;
      const [lo, hi] = depth(a) < depth(b) ? [a, b] : [b, a];
      const A = corners[lo], B = corners[hi], mid = A.clone().add(B).multiplyScalar(0.5), dir = B.clone().sub(A).normalize();
      const core = new T.Mesh(coreGeo, new T.ShaderMaterial({ uniforms: { uProg: { value: 0 }, uI: { value: 0 }, uColor: { value: new T.Color(0xF4F7FF) } }, vertexShader: edgeVS, fragmentShader: coreFS }));
      core.position.copy(mid); core.quaternion.setFromUnitVectors(up, dir); core.scale.set(1, S, 1);
      edges.push({ core, level: depth(lo), to: hi, p: 0, i: 0 });
    }
    // one small spark where it starts, at the near corner; it only shows while the cube powers on
    const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
    const spark = new T.Sprite(new T.SpriteMaterial({ map: sparkTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    spark.position.copy(corners[0]); spark.scale.setScalar(0.9);

    const cube = new T.Group(); cube.add(box); edges.forEach(e => cube.add(e.core)); cube.add(spark);
    const rig = new T.Group(); rig.position.copy(center); rig.add(cube); scene.add(rig);

    // turn the cube so its nearest corner points at the viewer, with its underside showing (like the reference):
    // from that corner one edge runs up, the other two run down to the left and right
    const dL = new T.Vector3(-1, -1, -1).normalize();
    const eL = new T.Vector3(0, 1, 0).sub(dL.clone().multiplyScalar(dL.y)).normalize();
    const LB = new T.Matrix4().makeBasis(dL, eL, new T.Vector3().crossVectors(dL, eL)).transpose();
    const baseQ = new T.Quaternion(), spinQ = new T.Quaternion(), axis = new T.Vector3(0, 0, 1);
    function aim(eye){
      const v = eye.clone().sub(center).normalize();
      const u = new T.Vector3(0, 1, 0).sub(v.clone().multiplyScalar(v.y)).normalize();
      const W = new T.Matrix4().makeBasis(v, u, new T.Vector3().crossVectors(v, u));
      baseQ.setFromRotationMatrix(W.multiply(LB)); axis.copy(v);
    }

    /* the hall: a polished black marble floor and matte charcoal walls, lit only by the cube */
    const big = small ? 1024 : 2048;
    const floorTex = new T.CanvasTexture(marble(big, big, 11, { big: 7, thin: 44, tiles: [6, 6] }));
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // the walls: matte charcoal panels, floor to ceiling, with thin seams, a fine plaster grain and a shadow gap at the floor
    const wallTex = new T.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 2048; const x = c.getContext('2d');
      let sd = 41; const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
      x.fillStyle = '#26262a'; x.fillRect(0, 0, 512, 2048);
      for (let n = 0; n < 60; n++){ const r = 60 + rnd() * 260, px = rnd() * 512, py = rnd() * 2048, g = x.createRadialGradient(px, py, 0, px, py, r);
        const v = rnd() < 0.5 ? '0,0,0' : '60,60,64'; g.addColorStop(0, 'rgba(' + v + ',' + (0.05 + rnd() * 0.07).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + v + ',0)');
        x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
      const im = x.getImageData(0, 0, 512, 2048), d = im.data;   // a fine plaster grain
      for (let n = 0; n < d.length; n += 4){ const g = (rnd() - 0.5) * 14; d[n] += g; d[n + 1] += g; d[n + 2] += g; }
      x.putImageData(im, 0, 0);
      [0, 256].forEach(X => { x.fillStyle = 'rgba(8,8,9,.95)'; x.fillRect(X, 0, 3, 2048); x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(X + 3, 0, 1, 2048); });
      x.fillStyle = 'rgba(8,8,9,.95)'; x.fillRect(0, 2032, 512, 16);
      return c; })());
    wallTex.encoding = T.sRGBEncoding; wallTex.anisotropy = floorTex.anisotropy;
    const wallMat = (w, h) => { const t = wallTex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(w / 9, 1);
      return new T.MeshStandardMaterial({ map: t, roughness: 0.88, metalness: 0.0 }); };
    const WH = 44, BACK = -20, SIDE = 22, FRONT = 30;
    const back = new T.Mesh(new T.PlaneGeometry(SIDE * 2, WH), wallMat(SIDE * 2, WH)); back.position.set(0, WH / 2, BACK); scene.add(back);
    const left = new T.Mesh(new T.PlaneGeometry(FRONT - BACK, WH), wallMat(FRONT - BACK, WH)); left.rotation.y = Math.PI / 2; left.position.set(-SIDE, WH / 2, (FRONT + BACK) / 2); scene.add(left);
    const right = new T.Mesh(new T.PlaneGeometry(FRONT - BACK, WH), wallMat(FRONT - BACK, WH)); right.rotation.y = -Math.PI / 2; right.position.set(SIDE, WH / 2, (FRONT + BACK) / 2); scene.add(right);
    const ceil = new T.Mesh(new T.PlaneGeometry(SIDE * 2, FRONT - BACK), new T.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, WH, (FRONT + BACK) / 2); scene.add(ceil);
    const amb = new T.AmbientLight(0x14141a, 0.35); scene.add(amb);
    const lamp = new T.PointLight(0xffffff, 0, 90, 1.2); lamp.position.copy(center); scene.add(lamp);

    // the floor is a mirror: each frame the room is drawn again from below the floor, then blended into the marble
    const rt = new T.WebGLRenderTarget(512, 512, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBFormat });
    rt.texture.generateMipmaps = false;
    const floorU = { tDiffuse: { value: rt.texture }, textureMatrix: { value: new T.Matrix4() }, uMarble: { value: floorTex }, uTexel: { value: new T.Vector2(1 / 512, 1 / 512) },
      uLightPos: { value: center.clone() }, uLightCol: { value: new T.Color(0, 0, 0) }, uAmb: { value: new T.Color(0, 0, 0) }, uFog: { value: FOG }, uFogD: { value: FOGD } };
    const floor = new T.Mesh(new T.PlaneGeometry(SIDE * 2, FRONT - BACK), new T.ShaderMaterial({ uniforms: floorU,
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vR; varying vec3 vW;
        void main(){ vR = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform sampler2D tDiffuse, uMarble; uniform vec2 uTexel; uniform vec3 uLightPos, uLightCol, uAmb, uFog; uniform float uFogD;
        varying vec4 vR; varying vec3 vW;
        vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          // big marble tiles; neighbouring blocks are flipped so the stone never visibly repeats
          vec2 uv = vW.xz / 12.0; vec2 cell = floor(uv); vec2 f = fract(uv); float h = hash(cell);
          if (h > 0.5) f.x = 1.0 - f.x; if (fract(h * 7.13) > 0.5) f.y = 1.0 - f.y;
          vec3 m = lin(texture2D(uMarble, f).rgb);
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = uLightPos - vW; float dl = length(L); L /= dl;
          float diff = max(L.y, 0.0) / (1.0 + dl * dl * 0.012);
                    vec2 pr = vR.xy / vR.w;
          vec3 refl = (lin(texture2D(tDiffuse, pr).rgb) * 2.0 + lin(texture2D(tDiffuse, pr + vec2(uTexel.x, 0.0)).rgb) + lin(texture2D(tDiffuse, pr - vec2(uTexel.x, 0.0)).rgb)
            + lin(texture2D(tDiffuse, pr + vec2(0.0, uTexel.y)).rgb) + lin(texture2D(tDiffuse, pr - vec2(0.0, uTexel.y)).rgb)) / 6.0;
          float fres = 0.14 + 0.7 * pow(1.0 - max(V.y, 0.0), 5.0);
          float vein = smoothstep(0.06, 0.45, m.r);
          vec3 col = m * (uAmb + uLightCol * diff * 2.2) + refl * fres * (1.0 - 0.75 * vein);
          float d = length(cameraPosition - vW); col = mix(col, lin(uFog), 1.0 - exp(-pow(uFogD * d, 2.0)));
          gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
        }` }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = (FRONT + BACK) / 2; scene.add(floor);
    (() => {   // the mirror camera (after three.js's Reflector)
      const vcam = new T.PerspectiveCamera(), plane = new T.Plane(), normal = new T.Vector3(), wp = new T.Vector3(), cp = new T.Vector3(), rot = new T.Matrix4();
      const look = new T.Vector3(), view = new T.Vector3(), target = new T.Vector3(), clip = new T.Vector4(), q = new T.Vector4(), tm = floorU.textureMatrix.value;
      floor.onBeforeRender = (r, sc, cam) => {
        wp.setFromMatrixPosition(floor.matrixWorld); cp.setFromMatrixPosition(cam.matrixWorld);
        rot.extractRotation(floor.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rot);
        view.subVectors(wp, cp); if (view.dot(normal) > 0) return;
        view.reflect(normal).negate().add(wp);
        rot.extractRotation(cam.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cp);
        target.subVectors(wp, look).reflect(normal).negate().add(wp);
        vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); vcam.lookAt(target); vcam.far = cam.far;
        vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(cam.projectionMatrix);
        tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); tm.multiply(vcam.projectionMatrix); tm.multiply(vcam.matrixWorldInverse); tm.multiply(floor.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(normal, wp); plane.applyMatrix4(vcam.matrixWorldInverse);
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        const P = vcam.projectionMatrix.elements;
        q.x = (Math.sign(clip.x) + P[8]) / P[0]; q.y = (Math.sign(clip.y) + P[9]) / P[5]; q.z = -1; q.w = (1 + P[10]) / P[14];
        clip.multiplyScalar(2 / clip.dot(q)); P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1; P[14] = clip.w;
        rt.texture.encoding = r.outputEncoding;
        floor.visible = false; const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.state.buffers.depth.setMask(true);
        if (r.autoClear === false) r.clear(); r.render(sc, vcam); r.setRenderTarget(prev); floor.visible = true;
      };
    })();

    /* the room's colour comes from the film: a tiny copy of each frame, averaged */
    const probe = document.createElement('canvas'); probe.width = 16; probe.height = 9; const px = probe.getContext('2d', { willReadFrequently: true });
    const tint = new T.Color(0x9E80F2), want = new T.Color(0x9E80F2), white = new T.Color(0xEEF2FF); let bright = 0, brightWant = 0, frame = 0;
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
    const st = { phase: 'off', t0: 0, dur: 2.6, onDone: null, spin: 0, vel: 0, drag: null, booted: false, awake: true, last: 0, eye: new T.Vector3(), look: new T.Vector3() };
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
        const sb = st.phase === 'standby', D = st.dur, k = D / 2.6;
        spark.material.opacity = Math.max(0, Math.sin(Math.min(1, t / (0.5 * k)) * Math.PI));
        edges.forEach(e => { const a = (0.12 + e.level * 0.36) * k, b = a + 0.42 * k; e.p = seg(t, a, b); e.i = e.p > 0 ? 1.0 : 0; });
        if (!sb){
          faceU.uWire.value = seg(t, 0.35 * k, 1.5 * k); faceU.uWireGlow.value = 0.95 * seg(t, 0.35 * k, 0.8 * k);
          faceU.uOn.value = 1; faceU.uReveal.value = 1.15 * seg(t, 1.25 * k, D);
          if (t > 1.2 * k && st.onDone){ const cb = st.onDone; st.onDone = null; cb(); }   // start the film as the picture spreads
          if (t >= D){ st.phase = 'on'; faceU.uReveal.value = 1.2; }
        } else {
          faceU.uWire.value = 0.55 * seg(t, 0.5, 1.6); faceU.uWireGlow.value = 0.6 * seg(t, 0.5, 1.0) * (1 - seg(t, 2.0, 3.2));
          if (t > 3.2) st.phase = 'idle';
        }
        return;
      }
      spark.material.opacity *= 0.85;
      if (st.phase === 'idle' || st.phase === 'off'){
        const lit = st.phase === 'idle' ? 1 : 0;
        edges.forEach(e => { e.p = lit; e.i += ((0.3 + 0.05 * Math.sin(now * 0.8 + e.level)) * lit - e.i) * 0.06; });
        faceU.uIdle.value = 0.55 * lit;
      }
      if (st.phase === 'on'){
        faceU.uWireGlow.value += (0.5 - faceU.uWireGlow.value) * 0.03;
        edges.forEach(e => { e.p = 1; e.i += (0.85 - e.i) * 0.05; });
      }
    }

    /* drag to turn it; it keeps turning slowly on its own */
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, t: performance.now() }; st.vel = 0; });
    window.addEventListener('pointermove', e => { if (!st.drag) return; const dx = e.clientX - st.drag.x; st.drag.x = e.clientX; const dt = Math.max(8, performance.now() - st.drag.t); st.drag.t = performance.now(); st.spin -= dx * 0.006; st.vel = -dx * 0.006 / (dt / 1000); });
    window.addEventListener('pointerup', () => { st.drag = null; });
    window.addEventListener('pointercancel', () => { st.drag = null; });
    let mx = 0, my = 0, cx = 0, cy = 0;
    room.addEventListener('pointermove', e => { const r = room.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; });

    function frameCamera(){
      const w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
      renderer.setSize(w, h, false); camera.aspect = a;
      // wide screens: the cube fills the height; tall phones: it fills the width, with the floor and its reflection below
      const k = Math.max(0, Math.min(1, (1.25 - a) / 0.8));
      camera.fov = 58 + 12 * k;
      st.eye.set(0, 1.0, 14.1 + 1.0 * k);
      st.look.set(0, 3.6 - 0.7 * k, 0);
      camera.updateProjectionMatrix();
      const rw = Math.max(256, Math.round(w * DPR * 0.5)), rh = Math.max(256, Math.round(h * DPR * 0.5));
      rt.setSize(rw, rh); floorU.uTexel.value.set(1 / rw, 1 / rh);
      aim(st.eye);
    }
    frameCamera();
    if ('ResizeObserver' in window) new ResizeObserver(frameCamera).observe(stage); else window.addEventListener('resize', frameCamera);

    const lampCol = new T.Color();
    function tick(){
      st.raf = 0;
      if (!st.awake) return;
      st.raf = requestAnimationFrame(tick);
      const now = clock(), dt = Math.min(0.05, st.last ? Math.max(0, now - st.last) : 0.016); st.last = now;
      animate(now);
      faceU.uTime.value = now;
      if (!st.drag){ st.vel *= Math.pow(0.04, dt); st.spin += (RM ? 0 : 0.11) * dt + st.vel * dt; }
      spinQ.setFromAxisAngle(axis, st.spin); rig.quaternion.copy(spinQ).multiply(baseQ);
      rig.position.y = LIFT + (RM ? 0 : Math.sin(now * 0.45) * 0.1);
      edges.forEach(e => { const m = e.core; m.material.uniforms.uProg.value = e.p; m.material.uniforms.uI.value = e.i; m.visible = e.p > 0.001; });
      if (++frame % 4 === 0) sample();
      bright += (brightWant * faceU.uOn.value * Math.min(1, faceU.uReveal.value) - bright) * 0.06; tint.lerp(want, 0.05);
      const edgeLight = edges.reduce((a, e) => a + e.i * e.p, 0) / edges.length;
      // the cube is the only light in the room: its edges a little, the film a lot
      lampCol.copy(tint).lerp(white, 0.3);
      lamp.color.copy(lampCol); lamp.intensity = 0.45 * edgeLight + 3.0 * bright; lamp.position.copy(rig.position);
      floorU.uLightPos.value.copy(rig.position);
      floorU.uLightCol.value.copy(lampCol).convertSRGBToLinear().multiplyScalar(lamp.intensity * 0.55);
      floorU.uAmb.value.copy(amb.color).convertSRGBToLinear().multiplyScalar(amb.intensity);
      // the viewer's eye drifts a little with the mouse
      cx += ((RM ? 0 : mx) - cx) * 0.04; cy += ((RM ? 0 : my) - cy) * 0.04;
      camera.position.set(st.eye.x + cx * 1.6, st.eye.y - cy * 0.4, st.eye.z);
      camera.lookAt(st.look);
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
