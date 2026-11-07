/* The blob band: soft ink shapes, like spilled paint or a lava lamp, drifting and slowly changing shape over a
   sky-to-violet ground. The shapes are a smooth noise field cut at one level and bent by a second, slower field,
   so they come out round with long tails. The cursor swells the ink under it. */
(function(){
  "use strict";
  const host = document.getElementById('blobs');
  if (!host) return;
  const cv = host.querySelector('canvas');
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 3D simplex noise: Ian McEwan, Ashima Arts (MIT licence), github.com/ashima/webgl-noise
  const NOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);',
    '  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
    '  i=mod289(i);',
    '  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
    '  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    '  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;',
    '  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = deriv => [
    deriv ? '#extension GL_OES_standard_derivatives : enable' : '',
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes,uPtr;uniform float uT,uPtrOn,uScale,uR;',
    'const vec3 INK=vec3(.039,.039,.039);const vec3 SKY=vec3(.247,.722,.933);',
    'const vec3 VIO=vec3(.620,.502,.949);const vec3 PAPER=vec3(.980,.980,.973);',
    NOISE,
    'float field(vec2 p){',
    '  vec2 q=p/uScale;float t=uT*.045;',
    '  q.y+=uT*.035;',                                                       // the whole field rises slowly
    // a slow field bends the main one, which gives the long tails and the pinched waists
    '  vec2 w=vec2(snoise(vec3(q*.42,t+3.1)),snoise(vec3(q*.42+7.3,t+5.7)));',
    '  float n=snoise(vec3(q*.9+w*.55,t));',
    '  float d=length(p-uPtr)/uR;',
    '  return n+uPtrOn*.38*exp(-d*d*1.8);',                                   // the cursor swells the ink
    '}',
    'void main(){',
    '  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);',
    '  float n=field(p);',
    deriv ? '  float aa=max(fwidth(n),.0005);' : '  float aa=.012;',
    '  float ink=smoothstep(.15-aa,.15+aa,n);',
    // the ground: sky into violet, drifting, with a soft sheen running across
    '  float f=.5+.5*sin(p.x/uRes.x*3.2-p.y/uRes.y*1.3+uT*.3);',
    // toward the bottom the ground leans sky, so it never runs into the violet band below
    "  f*=1.-.8*smoothstep(.4,1.,p.y/uRes.y);",
    '  vec3 bg=mix(SKY,VIO,smoothstep(.12,.88,f));',
    '  float sh=pow(.5+.5*sin((p.x*.8+p.y)/uRes.y*2.-uT*.6),14.);',
    '  bg=mix(bg,PAPER,sh*.45);',
    '  gl_FragColor=vec4(mix(bg,INK,ink),1.);',
    '}'
  ].join('\n');

  function start(){
    let gl = null;
    try { gl = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!window.__BLOBS_STILL }) || cv.getContext('experimental-webgl'); } catch (e) {}
    if (!gl) return;                                   // the CSS gradient behind stays
    const deriv = !!gl.getExtension('OES_standard_derivatives');
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs(deriv)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['uRes','uPtr','uT','uPtrOn','uScale','uR'].forEach(n => U[n] = gl.getUniformLocation(prog, n));

    let dpr = 1;
    function size(){
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
      gl.viewport(0, 0, cv.width, cv.height);
    }

    // the pointer, in canvas pixels; the swell eases after the cursor so it trails a little
    const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: 0, want: 0 };
    host.addEventListener('pointermove', e => {
      const b = cv.getBoundingClientRect();
      ptr.tx = (e.clientX - b.left) * dpr; ptr.ty = (e.clientY - b.top) * dpr;
      if (ptr.want === 0 && ptr.on < .01){ ptr.x = ptr.tx; ptr.y = ptr.ty; }
      ptr.want = 1;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { ptr.want = 0; });

    const clock = () => (window.__blobsClock ? window.__blobsClock() : performance.now());
    let raf = 0, visible = false, last = clock(), t = 40;
    function frame(){
      raf = 0;
      const now = clock(), dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!RM) t += dt;
      const k = 1 - Math.pow(.004, dt);
      ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k; ptr.on += (ptr.want - ptr.on) * k;
      // blob size follows the band: big shapes on a wide screen, a few fewer on a phone
      const scale = Math.max(125, Math.min(270, host.clientWidth * .19)) * dpr;
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform2f(U.uPtr, ptr.x, ptr.y);
      gl.uniform1f(U.uPtrOn, ptr.on);
      gl.uniform1f(U.uScale, scale);
      gl.uniform1f(U.uR, scale * .9);
      gl.uniform1f(U.uT, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!host.classList.contains('live')) host.classList.add('live');
      if (visible && (!RM || Math.abs(ptr.want - ptr.on) > .002)) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf){ last = clock(); raf = requestAnimationFrame(frame); } };
    size(); frame();
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); kick(); }, 120); });
    host.addEventListener('pointermove', kick, { passive: true });
    host.addEventListener('pointerleave', kick, { passive: true });
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; visible = false; });
    if ('IntersectionObserver' in window){
      new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible) kick(); }), { rootMargin: '80px' }).observe(host);
    } else { visible = true; kick(); }
  }
  start();
})();
