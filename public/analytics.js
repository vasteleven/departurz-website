/* Google Analytics 4 for the public pages (not the client portal).
   Paste the Measurement ID from Google Analytics (Admin > Data streams > your web stream, it starts with G-) into GA_ID.
   While GA_ID is empty nothing loads. Visitors whose browser sends Global Privacy Control are never tracked.
   Any link or button with data-track="label" also sends a "link_click" event with that label, so the link page
   shows which button people tap. */
(function(){
  "use strict";
  var GA_ID = '';
  window.dzTrack = function(){};
  if (!GA_ID || navigator.globalPrivacyControl === true) return;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID, { anonymize_ip: true });
  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
  window.dzTrack = function(name, params){ try { gtag('event', name, params || {}); } catch (e) {} };
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('[data-track]');
    if (a) window.dzTrack('link_click', { link_label: a.getAttribute('data-track'), link_url: a.href || '', page: location.pathname });
  }, true);
})();
