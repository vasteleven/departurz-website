/**
 * PARTICLE FIELD — Floating dots that react to cursor
 * White particles on bold orange background
 */
(function() {
  'use strict';

  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let mouseX = -1000;
  let mouseY = -1000;
  let targetMouseX = -1000;
  let targetMouseY = -1000;
  let particles = [];

  const PARTICLE_COUNT = 80;
  const MOUSE_RADIUS = 200;
  const CONNECTION_DISTANCE = 150;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2.5 + 1,
        baseAlpha: Math.random() * 0.15 + 0.05,
        alpha: 0,
      });
    }
  }

  function animate() {
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off edges
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // Mouse interaction
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MOUSE_RADIUS) {
        const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
        p.alpha = p.baseAlpha + force * 0.4;
        // Gentle push away from cursor
        p.x -= dx * 0.01;
        p.y -= dy * 0.01;
      } else {
        p.alpha += (p.baseAlpha - p.alpha) * 0.05;
      }

      // Draw particle — WHITE on orange
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.fill();
    }

    // Draw connections between close particles near mouse
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DISTANCE) {
          // Only draw connections near mouse
          const midX = (particles[i].x + particles[j].x) / 2;
          const midY = (particles[i].y + particles[j].y) / 2;
          const mouseDist = Math.sqrt((mouseX - midX) ** 2 + (mouseY - midY) ** 2);

          if (mouseDist < MOUSE_RADIUS * 1.5) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * (1 - mouseDist / (MOUSE_RADIUS * 1.5)) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('mousemove', function(e) {
    targetMouseX = e.clientX;
    targetMouseY = e.clientY;
  });
  document.addEventListener('mouseleave', function() {
    targetMouseX = -1000;
    targetMouseY = -1000;
  });

  resize();
  animate();
})();
