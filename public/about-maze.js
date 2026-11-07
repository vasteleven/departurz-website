/* DEPARTURZ STUDIOS, over and over, in fat interlocking letters: a letter maze.
   The letters are drawn once into a tile that repeats seamlessly: each letter gets a white outline band and an
   ink body, and every letter lands on top of the one before it, so the outlines run together like a maze.
   A small shader paints the tile in the site colours: the channels run sky to violet with a sheen passing
   through, the letters stay ink, a few of them light up in turn, and the ones under the cursor light up too. */
(function(){
  "use strict";
  const host = document.getElementById('maze');
  if (!host) return;
  const cv = host.querySelector('canvas');
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TEXT = 'DEPARTURZ STUDIOS ';
  const FAMILY = 'DZ Maze';
  // shape of the maze, as fractions of the letter size: outline fattening, white band, tracking, word gap,
  // row height, how far each row is shifted along, and where the baseline sits in a row
  const O = { fat: .056, band: .05, track: -.012, space: .2, lh: .84, rows: 4, shift: .37, base: .86 };
  const SKY = '#3FB8EE', VIO = '#9E80F2', INK = '#0A0A0A';

  // ---- the tile -------------------------------------------------------------------------------------------
  // ids: each letter's body carries a number in the green channel, so the shader can light letters one by one
  function tile(fs, ids){
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const font = fs + 'px "' + FAMILY + '", "Arial Black", Impact, sans-serif';
    x.font = font;
    const chars = TEXT.split('');
    const adv = chars.map(ch => ch === ' ' ? fs * O.space : x.measureText(ch).width + fs * O.track);
    const W = Math.max(64, Math.round(adv.reduce((a, b) => a + b, 0)));
    const rowH = fs * O.lh, H = Math.max(64, Math.round(rowH * O.rows));
    c.width = W; c.height = H;
    x.font = font; x.lineJoin = 'round'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const fat = fs * O.fat, band = fs * O.band;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // the glyphs of each row, with their place and id
    const rows = [];
    for (let r = 0; r < O.rows; r++){
      const y = r * rowH + fs * O.base, list = [];
      let px = ((r * O.shift) % 1) * W;
      chars.forEach((ch, i) => {
        const gx = px; px += adv[i];
        if (ch !== ' ') list.push({ ch, x: gx, y, id: Math.round((2 + Math.floor(rnd() * 15)) * 255 / 17) });
      });
      rows.push(list);
    }
    const draw = (gl, dy) => {
      const body = ids ? 'rgb(0,' + gl.id + ',0)' : '#000';
      for (const dx of [-W, 0, W]){
        const X = gl.x + dx, Y = gl.y + dy;
        if (X > W + fs || X < -2.5 * fs) continue;
        x.strokeStyle = '#fff'; x.lineWidth = fat + 2 * band; x.strokeText(gl.ch, X, Y);
        x.strokeStyle = body; x.lineWidth = fat; x.strokeText(gl.ch, X, Y);
        x.fillStyle = body; x.fillText(gl.ch, X, Y);
      }
    };
    // every row lands on top of the row above it; the copies across the top and bottom edges keep that order,
    // so the tile repeats without a seam
    rows[rows.length - 1].forEach(g => draw(g, -H));
    rows.forEach(list => list.forEach(g => draw(g, 0)));
    rows[0].forEach(g => draw(g, H));
    return c;
  }

  const fontSize = () => Math.round(Math.max(64, Math.min(150, host.clientWidth * .085)));
  const ready = (() => {
    try {
      const f = new FontFace(FAMILY, 'url(about/maze-letters.woff2)');
      document.fonts.add(f);
      return Promise.race([f.load(), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  })();

  // ---- without WebGL: one still, coloured with a gradient --------------------------------------------------
  function still(){
    const x = cv.getContext('2d');
    if (!x) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(host.clientWidth * d); cv.height = Math.round(host.clientHeight * d);
    const t = tile(fontSize() * d, false);
    x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'multiply';
    const g = x.createLinearGradient(0, 0, cv.width, cv.height); g.addColorStop(0, SKY); g.addColorStop(1, VIO);
    x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'lighten'; x.fillStyle = INK; x.fillRect(0, 0, cv.width, cv.height);
    host.classList.add('live');
  }

  // ---- the shader -----------------------------------------------------------------------------------------
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision highp float;',
    'uniform sampler2D uM;uniform vec2 uRes,uTile,uOff,uPtr;uniform float uT,uAng,uPtrOn,uR;',
    'const vec3 INK=vec3(.039,.039,.039);const vec3 SKY=vec3(.247,.722,.933);',
    'const vec3 VIO=vec3(.620,.502,.949);const vec3 PAPER=vec3(.980,.980,.973);',
    'void main(){',
    '  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);',
    '  vec2 c=p-.5*uRes;float s=sin(uAng),k=cos(uAng);',
    '  vec2 q=vec2(k*c.x-s*c.y,s*c.x+k*c.y);',
    '  vec4 t=texture2D(uM,q/uTile+uOff);',
    '  float m=t.r;',
    '  float id=floor(clamp((t.g-t.r)/max(1.-t.r,.002),0.,1.)*17.+.5)/17.;',
    // the channels: sky into violet, drifting, with a soft sheen running across
    '  float f=.5+.5*sin(p.x/uRes.x*3.4-p.y/uRes.y*1.2+uT*.32);',
    '  vec3 line=mix(SKY,VIO,smoothstep(.15,.85,f));',
    '  float sh=pow(.5+.5*sin((p.x*.8+p.y)/uRes.y*2.1-uT*.7),14.);',
    '  line=mix(line,PAPER,sh*.6);',
    // the letters: ink; a few light up in turn, and the ones near the cursor
    '  float on=step(.1,id)*step(m,.6);',
    '  float pop=on*smoothstep(.93,.975,sin(uT*.55+id*41.3));',
    '  float near=on*uPtrOn*(1.-smoothstep(.25,1.,length(p-uPtr)/uR));',
    '  vec3 tint=mix(VIO,SKY,smoothstep(.15,.85,f));',   // the opposite of the channel colour around it
    '  vec3 body=mix(INK,tint,max(pop*.92,near*.9));',
    '  gl_FragColor=vec4(mix(body,line,m),1.);',
    '}'
  ].join('\n');

  function start(){
    let gl = null;
    try { gl = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!window.__MAZE_STILL }) || cv.getContext('experimental-webgl'); } catch (e) {}
    if (!gl){ still(); return; }
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){ return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['uM','uRes','uTile','uOff','uPtr','uT','uAng','uPtrOn','uR'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U.uM, 0);
    const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, 4096);
    const pot = n => Math.min(maxTex, Math.pow(2, Math.round(Math.log2(Math.max(2, n)))));

    let dpr = 1, tileW = 1, tileH = 1, builtFor = 0;
    function build(){
      const fs = Math.round(fontSize() * dpr);
      if (fs === builtFor) return;
      builtFor = fs;
      const t = tile(fs, true);
      tileW = t.width; tileH = t.height;
      // WebGL 1 only repeats power-of-two textures, so the tile is resampled to one; the shader still maps it
      // at its true size, so nothing stretches on screen
      const r = document.createElement('canvas'); r.width = pot(tileW); r.height = pot(tileH);
      const rx = r.getContext('2d'); rx.imageSmoothingQuality = 'high'; rx.drawImage(t, 0, 0, r.width, r.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, r);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    function size(){
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
      gl.viewport(0, 0, cv.width, cv.height);
      build();
    }

    // the pointer, in canvas pixels; it eases toward where the cursor is so the light trails a little
    const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: 0, want: 0 };
    host.addEventListener('pointermove', e => {
      const b = cv.getBoundingClientRect();
      ptr.tx = (e.clientX - b.left) * dpr; ptr.ty = (e.clientY - b.top) * dpr;
      if (ptr.want === 0){ ptr.x = ptr.tx; ptr.y = ptr.ty; }
      ptr.want = 1;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { ptr.want = 0; });

    const clock = () => (window.__mazeClock ? window.__mazeClock() : performance.now());
    let raf = 0, visible = false, last = clock(), drift = 0, t0 = clock();
    function frame(){
      raf = 0;
      const now = clock(), dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!RM) drift += dt * 22 * dpr;                              // about 22 css px a second, leftward
      const k = 1 - Math.pow(.0015, dt);                            // easing for the light
      ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k; ptr.on += (ptr.want - ptr.on) * k;
      const sc = RM ? 0 : (window.scrollY || 0) * .12 * dpr;        // the rows slide a little as you scroll
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform2f(U.uTile, tileW, tileH);
      gl.uniform2f(U.uOff, ((drift + sc) / tileW) % 1, 0);
      gl.uniform2f(U.uPtr, ptr.x, ptr.y);
      gl.uniform1f(U.uPtrOn, ptr.on);
      gl.uniform1f(U.uR, 190 * dpr);
      gl.uniform1f(U.uT, RM ? 3 : (now - t0) / 1000);
      gl.uniform1f(U.uAng, -0.07);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!host.classList.contains('live')) host.classList.add('live');
      if (visible && (!RM || ptr.on > .002 || ptr.want)) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf){ last = clock(); raf = requestAnimationFrame(frame); } };
    size(); frame();
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); kick(); }, 120); });
    host.addEventListener('pointermove', kick, { passive: true });
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; });
    if ('IntersectionObserver' in window){
      new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) kick(); }), { rootMargin: '80px' }).observe(host);
    } else { visible = true; kick(); }
  }

  ready.then(start);
})();
