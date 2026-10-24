/* DEPARTURZ: Terms of Use and Privacy, shown in a pop-up from the links at the bottom of every page.
   Edit the text here once and every page picks it up. Links: <a href="#terms" data-legal="terms"> and data-legal="privacy". */
(function(){
  "use strict";
  const UPDATED = 'October 23, 2026';
  const CONTACT = 'through the <a href="contact.html">contact page</a>, or by mail at DEPARTURZ, 3311 La Cienega Blvd., Los Angeles, CA 90016';

  const TERMS = `
<p class="lg-lede">These terms cover departurz.com and the DEPARTURZ client and crew portal (together, the "Site"). By using the Site you agree to them. If you don't agree, please don't use the Site.</p>
<h3>1. Who we are</h3>
<p>DEPARTURZ ("we," "us") is a storytelling studio for web design, production, post-production and sound, based in Los Angeles, California and Houston, Texas.</p>
<h3>2. Using the Site</h3>
<p>You may browse the Site to learn about our work and to contact us. Please don't misuse it: no hacking or probing, scraping, overloading, uploading harmful code, impersonating anyone, or using it for anything unlawful.</p>
<h3>3. Our work and content</h3>
<p>The videos, photos, designs, text, characters, logos and the rest of the Site belong to DEPARTURZ or to the people who licensed them to us. Don't copy, reuse or redistribute them without written permission. Some work shown belongs to our clients and appears with their permission.</p>
<h3>4. Projects and services</h3>
<p>Anything on the Site, and any quote or proposal, is an estimate until we both sign a service agreement or you pay an invoice that references one. Each project is governed by its service agreement. If that agreement and these terms ever disagree, the agreement wins. Timelines are our best estimate and depend on getting what we need from you on time.</p>
<h3>5. The portal</h3>
<p>Portal access is by invitation. You sign in with Google or a one-time email link, so keep your email account secure and don't forward sign-in links. We may pause or end access to protect the Site, our clients or our crew. You must be 18 or older (or the age of majority where you live) to accept documents or make payments in the portal.</p>
<p>When you accept a document in the portal by ticking the box and typing your name, that counts as your electronic signature, and we record your name, email and the time. It has the same effect as signing on paper, to the extent the law allows.</p>
<h3>6. Files you send us</h3>
<p>You keep ownership of everything you upload. You give us permission to use it to deliver your project, and you confirm you have the rights to it, including music, logos, artwork and the consent of anyone who appears in it. We keep project files for a reasonable time after delivery, but please download your final files; we can't promise to store them forever.</p>
<h3>7. Ideas and scripts we didn't ask for</h3>
<p>Outside of a project we've agreed to, we don't accept unsolicited scripts, screenplays, treatments, pitches or story ideas. If you send them anyway, we may delete them unread, and sending them doesn't create any duty of confidentiality, credit or payment. Material you send for a project we've agreed to is covered by section 6 and your service agreement.</p>
<h3>8. Payments</h3>
<p>Invoices are due as stated on them and in your service agreement. Card, Apple Pay and Cash App Pay payments are processed by Stripe, PayPal and Venmo payments by PayPal, and Square payments by Square. We never see or store your card or bank details. Refunds, if any, follow your service agreement.</p>
<h3>9. The chat assistant</h3>
<p>The chat bubble on the homepage is an automated assistant, not a person. Its answers can be incomplete or wrong, and nothing it says is a quote or a promise. Please don't share sensitive personal information with it.</p>
<h3>10. Other sites</h3>
<p>Links to other sites and apps (Instagram, YouTube, Google Maps, payment pages and others) are for convenience. We don't control them and their own terms apply.</p>
<h3>11. No warranty</h3>
<p>The Site is provided "as is." We work to keep it accurate and available, but we can't promise it will always be error free or uninterrupted.</p>
<h3>12. Limits on liability</h3>
<p>To the extent the law allows, DEPARTURZ isn't liable for indirect, incidental or consequential damages, or lost profits or data, from your use of the Site. For anything else, our total liability is limited to what you paid us for the services involved in the last 12 months, or $100 if you haven't paid us anything.</p>
<h3>13. Changes</h3>
<p>We may update these terms from time to time. The date at the top shows the latest version, and using the Site after a change means you accept it.</p>
<h3>14. Governing law</h3>
<p>These terms are governed by the laws of California. Any dispute will be handled in the state or federal courts in Los Angeles County, California, unless your service agreement says otherwise.</p>
<h3>15. Questions</h3>
<p>Reach us ${CONTACT}.</p>`;

  const PRIVACY = `
<p class="lg-lede">This explains what DEPARTURZ collects through departurz.com and the client and crew portal, why, and the choices you have. We don't sell your personal information, and we don't use advertising trackers.</p>
<h3>What we collect</h3>
<p><b>When you contact us:</b> your name, email, company, the services you're interested in, dates, budget and anything you write about your project.</p>
<p><b>In the portal:</b> your name and email (from Google if you sign in with Google), plus what you choose to add: company, role, city, bio, social handles and email preferences. Also the messages, files, notes, bookings and calendar items you send, and a record of documents you accept (your typed name, email and the time). Crew members also add a payout method with an account email or the last four digits only, never full account numbers, and the hours they submit.</p>
<p><b>Automatically:</b> basic technical information such as your IP address, browser and the pages you visit, kept in our hosting provider's logs. The portal uses one cookie to keep you signed in. We don't use advertising or cross-site tracking cookies.</p>
<p><b>Payments:</b> handled entirely by Stripe, PayPal or Square on their own secure pages. We receive confirmation that you paid, not your card or bank details.</p>
<h3>How we use it</h3>
<p>To reply to you, plan and deliver your project, run the portal, send project emails (reminders, updates, cuts ready for review, receipts), keep the Site secure, meet legal and accounting duties, and, if you leave them switched on, send thank-you notes and returning-client offers.</p>
<h3>Who helps us</h3>
<p>We share information only with the services that run the Site for us, and only what each one needs:</p>
<ul>
<li>Google (sign-in, and the Drive and Sheets where portal files and records are kept)</li>
<li>Vercel (hosting) and Upstash (portal messages)</li>
<li>Resend (sending email) and Kit (project updates, thank-yous and offers)</li>
<li>Stripe, PayPal and Square (payments)</li>
<li>Anthropic (to answer questions typed into the chat assistant)</li>
<li>Google Fonts and Cloudflare (fonts and code libraries the pages load)</li>
</ul>
<p>We may also share information if the law requires it, if someone breaks our Terms of Use, to protect our rights or someone's safety, or as part of a sale or merger of the business.</p>
<p>Payment pages, social networks and the other sites we link to have their own privacy policies, and those apply once you're there.</p>
<h3>Do Not Track</h3>
<p>We don't sell or share personal information, don't use cross-site tracking, and don't let ad networks follow you on our pages. Browser signals like Do Not Track and Global Privacy Control are welcome, and the Site already works the way they ask.</p>
<h3>Your choices</h3>
<p>You can change your email preferences on your Profile page in the portal or with the unsubscribe link in any email, and you can withdraw your consent to marketing emails at any time. Project emails about work in progress keep coming while a project is active. You can ask to see, correct or delete your information ${CONTACT}. Depending on where you live, including California and Texas, you may have these rights by law, and we won't treat you differently for using them.</p>
<h3>How long we keep it</h3>
<p>We keep information for as long as your project and our working relationship need it, then as long as the law requires for tax and accounting records. Portal chat keeps the most recent 500 messages in each conversation.</p>
<h3>Security</h3>
<p>We use secure connections, sign-in links that work once and expire, and access limited to the people working on your project. No system is perfectly secure, so please tell us right away if you think something is wrong.</p>
<h3>Watch for impersonators</h3>
<p>DEPARTURZ will never ask you to pay to be considered for a role or a job, and will never ask for your password or full bank or card details by text, email or direct message. Invoices only come through your portal or from us directly. If someone claiming to be DEPARTURZ asks for any of that, it isn't us; please tell us through the contact page.</p>
<h3>If you're in our footage</h3>
<p>We film events, shoots and behind-the-scenes moments, and the people in them may appear in work we publish. If you're in something we made and have a concern, contact us and we'll review it with you.</p>
<h3>Children</h3>
<p>The Site isn't meant for children under 13, and we don't knowingly collect their information.</p>
<h3>Visitors and crew outside the U.S.</h3>
<p>Information is stored and processed in the United States. If you use the Site or the portal from another country, your information will be handled there.</p>
<h3>Changes</h3>
<p>If we change this policy, we'll update the date at the top. If a change is significant, we'll let portal users know by email.</p>
<h3>Questions</h3>
<p>Reach us ${CONTACT}.</p>`;

  const CSS = `
.lg{width:min(760px,calc(100vw - 24px));max-height:min(86vh,900px);padding:0;border:0;border-radius:20px;background:#FAFAF8;color:#0A0A0A;box-shadow:0 40px 90px -30px rgba(0,0,0,.6);overflow:hidden;font-family:"Archivo","Helvetica Neue",Arial,sans-serif}
.lg[open]{display:flex;flex-direction:column}
.lg::backdrop{background:rgba(10,10,10,.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.lg-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 14px 22px;border-bottom:1px solid #E3E1DC;background:#FFFFFF}
.lg-tabs{display:flex;gap:6px;flex-wrap:wrap}
.lg-tabs button,.lg-x{font:inherit;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:9px 14px;border-radius:99px;border:1.5px solid #E3E1DC;background:transparent;color:#0A0A0A;cursor:pointer}
.lg-tabs button[aria-selected="true"]{background:#0A0A0A;border-color:#0A0A0A;color:#FFFFFF}
.lg-x{border-color:transparent;background:#F1EFEA}
.lg-x:hover,.lg-tabs button:hover{border-color:#0A0A0A}
.lg-body{overflow:auto;padding:24px clamp(20px,4vw,40px) 34px;-webkit-overflow-scrolling:touch}
.lg-body h2{margin:0;font-weight:900;font-stretch:72%;text-transform:uppercase;font-size:clamp(38px,6vw,64px);line-height:.88;background:linear-gradient(100deg,#3FB8EE 8%,#9E80F2 88%);-webkit-background-clip:text;background-clip:text;color:transparent;width:fit-content}
.lg-date{margin:10px 0 0;font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#6B6A66}
.lg-body .lg-lede{font-size:16.5px;line-height:1.55;margin:18px 0 6px}
.lg-body h3{margin:26px 0 6px;font-weight:900;font-stretch:80%;text-transform:uppercase;font-size:19px;line-height:1.1}
.lg-body p,.lg-body li{margin:0 0 10px;font-size:14.5px;line-height:1.62;color:#2A2A28}
.lg-body ul{margin:0 0 10px;padding-left:20px}
.lg-body a{color:#1C7FB0}
.lg-body:focus{outline:none}
@media (max-width:480px){ .lg-head{padding:12px 12px 12px 14px} .lg-tabs{flex-wrap:nowrap;gap:4px} .lg-tabs button,.lg-x{font-size:10px;letter-spacing:.12em;padding:8px 11px;white-space:nowrap} }
.lg-body b{color:#0A0A0A}
@media (prefers-reduced-motion: no-preference){ .lg[open]{animation:lgIn .35s cubic-bezier(.2,.7,.2,1)} @keyframes lgIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}} }`;

  let dlg = null;
  function build(){
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.className = 'lg'; dlg.setAttribute('aria-labelledby', 'lgTitle');
    dlg.innerHTML = `<div class="lg-head"><div class="lg-tabs" role="tablist" aria-label="Legal"><button type="button" role="tab" data-tab="terms">Terms of Use</button><button type="button" role="tab" data-tab="privacy">Privacy</button></div><button type="button" class="lg-x">Close</button></div>
      <div class="lg-body" tabindex="-1">
        <article data-doc="terms" role="tabpanel"><h2 id="lgTitle-terms">Terms of Use</h2><p class="lg-date">Last updated ${UPDATED}</p>${TERMS}</article>
        <article data-doc="privacy" role="tabpanel" hidden><h2 id="lgTitle-privacy">Privacy</h2><p class="lg-date">Last updated ${UPDATED}</p>${PRIVACY}</article>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('.lg-x').addEventListener('click', () => close());
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });            // a click on the dim backdrop
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dlg.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
    dlg.querySelectorAll('.lg-body a[href="contact.html"]').forEach(a => a.addEventListener('click', () => close()));
  }
  function show(which){
    dlg.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === which)));
    dlg.querySelectorAll('[data-doc]').forEach(a => { a.hidden = a.dataset.doc !== which; });
    dlg.setAttribute('aria-labelledby', 'lgTitle-' + which);
    dlg.querySelector('.lg-body').scrollTop = 0;
  }
  let opener = null;
  function open(which){
    if (!dlg) build();
    show(which);
    opener = document.activeElement;
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    dlg.querySelector('.lg-body').focus({ preventScroll: true });
  }
  function close(){
    if (!dlg) return;
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-legal]'); if (!a) return;
    e.preventDefault(); open(a.dataset.legal === 'privacy' ? 'privacy' : 'terms');
  });
  if (location.hash === '#terms' || location.hash === '#privacy') open(location.hash.slice(1));
})();
