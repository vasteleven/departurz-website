/**
 * DEPARTURZ — Cinematic Hero Controller
 *
 * FLOW:
 * 1. Preloader finishes → NY image fullscreen
 * 2. "Where Your Story Takes Off." fades in over image
 * 3. Scroll → image fades to video, PHRASE STAYS
 * 4. Scroll more → video fades to orange, LOGO appears with phrase
 * 5. Logo + phrase fade out as Work section scrolls in
 */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  const hero = document.getElementById('cinematicHero');
  const pin = document.querySelector('.cinematic-hero__pin');
  const imageLayer = document.getElementById('heroImageLayer');
  const videoLayer = document.getElementById('heroVideoLayer');
  const video = document.getElementById('heroVideo');
  const overlay = document.getElementById('heroOverlay');
  const logo = document.getElementById('heroLogo');
  const tagline = document.getElementById('heroTagline');
  const scrollInd = document.getElementById('heroScroll');

  if (!hero || !pin) return;

  // ─── PHASE 0: Entrance — tagline fades in over image ───
  const entranceTL = gsap.timeline({ delay: 3 });

  // Only tagline first — logo comes later during scroll
  entranceTL
    .to(tagline, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power3.out',
    })
    .to(scrollInd, {
      opacity: 1,
      duration: 0.6,
      ease: 'power3.out',
    }, '-=0.4');

  // Logo starts hidden — will appear during orange transition
  gsap.set(logo, { opacity: 0, scale: 0.9 });

  // ─── MASTER SCROLL TIMELINE ───
  var videoStarted = false;

  const masterTL = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      pin: pin,
      pinSpacing: false,
      onUpdate: function (self) {
        if (self.progress > 0.1 && !videoStarted && video) {
          video.play().catch(function () {});
          videoStarted = true;
        }
        if (self.progress > 0.7) {
          pin.classList.add('bleed-orange');
        } else {
          pin.classList.remove('bleed-orange');
        }
      },
    },
  });

  // ── 0-5%: Scroll indicator fades ──
  masterTL.to(scrollInd, { opacity: 0, duration: 0.05 }, 0);

  // ── 0-25%: Image zooms slowly, TAGLINE STAYS ──
  masterTL.to('.cinematic-hero__image', {
    scale: 1.15, duration: 0.25, ease: 'none'
  }, 0);

  // ── 20-40%: Image fades, video revealed — TAGLINE STAYS ──
  masterTL.to(imageLayer, { opacity: 0, duration: 0.2 }, 0.2);
  masterTL.to('.cinematic-hero__video', { opacity: 1, duration: 0.15 }, 0.2);
  masterTL.to(overlay, { opacity: 0.25, duration: 0.15 }, 0.2);

  // ── 50-65%: Video fades to black, LOGO APPEARS ──
  masterTL.to(overlay, {
    opacity: 0.95,
    background: 'rgba(10, 10, 10, 1)',
    duration: 0.15,
  }, 0.5);

  masterTL.to(videoLayer, { opacity: 0, duration: 0.15 }, 0.55);

  // Logo scales up and fades in on black
  masterTL.to(logo, {
    opacity: 1,
    scale: 1,
    duration: 0.1,
    ease: 'power2.out',
  }, 0.55);

  // ── 75-95%: Logo + tagline fade out into work section ──
  masterTL.to([logo, tagline], {
    opacity: 0,
    y: -40,
    duration: 0.15,
    stagger: 0.02,
  }, 0.8);

  masterTL.to(overlay, { opacity: 0, duration: 0.1 }, 0.9);

  // ─── SCROLL-SYNCED VIDEO ───
  if (video) {
    function setupVideoScroll() {
      if (!video.duration || isNaN(video.duration)) return;
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        onUpdate: function (self) {
          var videoProgress = Math.max(0, Math.min(1, (self.progress - 0.2) / 0.4));
          var maxTime = Math.min(video.duration, 20);
          video.currentTime = videoProgress * maxTime;
        },
      });
    }
    video.addEventListener('loadedmetadata', setupVideoScroll);
    if (video.readyState >= 1) setupVideoScroll();
  }

  // ─── SECTION TRANSITIONS ───

  // Work section fades up
  gsap.from('#workSection', {
    opacity: 0, y: 60, duration: 1,
    scrollTrigger: {
      trigger: '#workSection',
      start: 'top 90%',
      end: 'top 50%',
      scrub: true,
    },
  });

  // Work category titles stagger
  gsap.utils.toArray('.work-category').forEach(function (cat, i) {
    gsap.from(cat, {
      y: 40, opacity: 0, duration: 0.7,
      delay: i * 0.15,
      scrollTrigger: {
        trigger: cat,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });

  // Work cards stagger
  gsap.utils.toArray('.work-card').forEach(function (card, i) {
    gsap.from(card, {
      y: 50, opacity: 0, duration: 0.7,
      delay: i * 0.1,
      scrollTrigger: {
        trigger: card,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });

  // Services section
  gsap.from('#servicesPreview', {
    opacity: 0, y: 60, duration: 1,
    scrollTrigger: {
      trigger: '#servicesPreview',
      start: 'top 90%',
      end: 'top 50%',
      scrub: true,
    },
  });

  gsap.utils.toArray('.service-card').forEach(function (card, i) {
    gsap.from(card, {
      y: 60, opacity: 0, duration: 0.8,
      delay: i * 0.15,
      scrollTrigger: {
        trigger: card,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  });

  // Process steps
  gsap.utils.toArray('.process-step').forEach(function (step, i) {
    gsap.from(step, {
      y: 40, opacity: 0, duration: 0.6,
      delay: i * 0.1,
      scrollTrigger: {
        trigger: step,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  });

  // Portal CTA
  gsap.from('.portal-cta__content', {
    x: -60, opacity: 0, duration: 0.8,
    scrollTrigger: {
      trigger: '#portalCta',
      start: 'top 75%',
      toggleActions: 'play none none none',
    },
  });

  gsap.from('.portal-cta__visual', {
    x: 60, opacity: 0, duration: 0.8,
    scrollTrigger: {
      trigger: '#portalCta',
      start: 'top 75%',
      toggleActions: 'play none none none',
    },
  });
})();
