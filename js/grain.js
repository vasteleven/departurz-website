/**
 * FILM GRAIN OVERLAY
 * Subtle film grain texture for cinematic feel
 */
(function() {
  'use strict';

  const canvas = document.getElementById('grainCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth / 2;
    canvas.height = window.innerHeight / 2;
  }

  function renderGrain() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const val = Math.random() * 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    requestAnimationFrame(renderGrain);
  }

  window.addEventListener('resize', resize);
  resize();
  renderGrain();
})();
