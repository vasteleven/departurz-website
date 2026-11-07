/* The pattern behind the opening, built the same way as the story background on the Ginyale Moss site:
   a live organic maze. A smooth noise field (bent by a slower one) is drawn wherever it crosses zero, as a band
   of colour, so the lines wander, branch and close into rounded shapes, and slowly change as they drift.
   Here the lines run sky to violet on a pale lilac ground; the text sits on a frosted panel above it. */
(function(){
  "use strict";
  const cv = document.querySelector('.open-bg');
  if (!cv) return;
  const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: !!window.__FLOW_STILL });
  if (!gl) return;                                         // the plain ground colour stays
  const dx = gl.getExtension('OES_standard_derivatives');
  const css = getComputedStyle(document.documentElement);
  const hex = v => { v = v.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16) / 255); };
  const ground = hex(css.getPropertyValue('--maze-ground')),
        ink1 = hex(css.getPropertyValue('--maze-ink')),
        ink2 = hex(css.getPropertyValue('--maze-ink2'));
  const vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const fs = [
    (dx ? '#extension GL_OES_standard_derivatives : enable\n' : '') +
    'precision highp float;uniform vec2 R;uniform float T,S;uniform vec3 G,I,J;',
    // 3D simplex noise: Ian McEwan, Ashima Arts (MIT licence), github.com/ashima/webgl-noise
    'vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 pm(vec4 x){return m289(((x*34.)+1.)*x);}vec4 ti(vec4 r){return 1.79284291400159-.85373472095314*r;}',
    'float sn(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);',
    'vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;',
    'vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
    'i=m289(i);vec4 p=pm(pm(pm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
    'float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);',
    'vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
    'vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    'vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    'vec4 nm=ti(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;',
    'vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;',
    'return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}',
    'void main(){vec2 p=gl_FragCoord.xy/S;float t=T*.035;',
    'vec2 w=vec2(sn(vec3(p*.45,t*.7)),sn(vec3(p*.45+7.3,t*.7)));p+=w*.18;',
    'float n=sn(vec3(p,t))+.22*sn(vec3(p*2.3+4.,t*1.3));',
    'float d=abs(n);float aa=' + (dx ? 'fwidth(d)*.9' : '.02') + ';',
    'float band=1.-smoothstep(.17-aa,.17+aa,d);',
    // the lines go sky to violet across the section, drifting a little
    'vec2 u=gl_FragCoord.xy/R;float k=smoothstep(.1,.9,.5+.5*sin(u.x*2.4-u.y*1.1+T*.12));',
    'gl_FragColor=vec4(mix(G,mix(I,J,k),band),1.);}'
  ].join('\n');
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uS = gl.getUniformLocation(pr, 'S');
  gl.uniform3fv(gl.getUniformLocation(pr, 'G'), ground); gl.uniform3fv(gl.getUniformLocation(pr, 'I'), ink1); gl.uniform3fv(gl.getUniformLocation(pr, 'J'), ink2);
  let dpr = 1, visible = true, raf = 0;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches, t0 = performance.now();
  const clock = () => (window.__flowClock ? window.__flowClock() : performance.now());
  function draw(now){
    gl.uniform1f(uT, (now - t0) / 1000 + 12); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!cv.classList.contains('live')) cv.classList.add('live');
  }
  function size(){
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr)); gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uS, Math.max(150, Math.min(260, w * .16)) * dpr); draw(clock());
  }
  function loop(){ draw(clock()); if (visible && !still) raf = requestAnimationFrame(loop); }
  if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv); else window.addEventListener('resize', size);
  size();
  if ('IntersectionObserver' in window) new IntersectionObserver(e => { visible = e[0].isIntersecting; cancelAnimationFrame(raf); if (visible && !still) raf = requestAnimationFrame(loop); }).observe(cv);
  else if (!still) raf = requestAnimationFrame(loop);
})();
