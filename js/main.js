/**
 * DEPARTURZ — Main Controller
 * Handles preloader, navigation, mobile menu
 * NOTE: Hero animation + scroll transitions handled by cinematic.js
 */
(function() {
  'use strict';

  // === PRELOADER ===
  const preloader = document.getElementById('preloader');
  const preloaderBar = document.getElementById('preloaderBar');

  if (preloader && preloaderBar) {
    let loadProgress = 0;
    const loadDuration = 2200;
    const loadStart = performance.now();

    function animatePreloader() {
      const elapsed = performance.now() - loadStart;
      loadProgress = Math.min(elapsed / loadDuration, 1);
      preloaderBar.style.width = (loadProgress * 100) + '%';
      if (loadProgress < 1) {
        requestAnimationFrame(animatePreloader);
      }
    }

    requestAnimationFrame(animatePreloader);
    setTimeout(function() {
      preloader.classList.add('done');
    }, loadDuration + 400);
  }

  // === NAVIGATION ===
  const nav = document.getElementById('mainNav');
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('mobileMenu');

  // Scroll effect
  if (nav) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 80) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    });
  }

  // Mobile menu toggle
  if (burger && mobileMenu) {
    burger.addEventListener('click', function() {
      burger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });
  }

  // === SCROLL ANIMATIONS (for pages without cinematic.js) ===
  function initScrollAnimations() {
    const elements = document.querySelectorAll('[data-animate]');

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.style.transitionDelay = '0s';
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

      elements.forEach(function(el) {
        const parent = el.parentElement;
        const siblings = Array.from(parent.querySelectorAll('[data-animate]'));
        const siblingIndex = siblings.indexOf(el);
        el.style.transitionDelay = (siblingIndex * 0.1) + 's';
        observer.observe(el);
      });
    } else {
      elements.forEach(function(el) {
        el.classList.add('visible');
      });
    }
  }

  // === INIT ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollAnimations);
  } else {
    initScrollAnimations();
  }
})();
