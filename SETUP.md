# DEPARTURZ site + portal: setup

This folder is the whole website plus the client and crew portal, ready for one Vercel project.

- **Sign-in:** Google, or a one-tap link by email. Nobody has a password. Only emails listed in your two Google Sheets can get in.
- **Your control panel is two Google Sheets** in the departurzedits Drive: **DEPARTURZ Clients** and **DEPARTURZ Team**. Add a row and the portal updates.
- **Files** go straight from the browser into the departurzedits Drive, any size, and resume if the connection drops.
- **Chat** (client threads, crew channels, direct messages) is stored in Upstash Redis, which has a free tier.
- **Emails go out on their own**, once a day at 8am Los Angeles time: reminders, project updates, thank-you letters, and Kit sign-ups.

Plan on about 30 minutes the first time, all in the browser. Steps 1 to 4 are required. Payments (step 6) and Kit (step 7) can be added whenever you're ready.

---

## 1. Where the site lives (done)

- **Code:** the GitHub repo `vasteleven/departurz-website`. Every push to its `main` branch goes live on its own.
- **Hosting:** the Vercel project **departurz-website** (team vasteleven's projects, Pro plan), with `departurz.com` and `www.departurz.com` attached. `departurz.com` forwards to `www.departurz.com`.
- **Settings below** (the environment variables) go in that project: **Vercel > departurz-website > Settings > Environment Variables**. After adding or changing any, redeploy once (**Deployments > ⋯ > Redeploy**) so the site picks them up.
- **Undo:** if a change ever goes wrong, **Deployments**, pick the last good one, **Promote to Production**.

The site is live. Until the steps below are done, the contact form opens the visitor's email app instead of sending on its own, and the portal tells visitors it opens with their first project.

## 2. Connect Google (Drive, Sheets and "Sign in with Google")

Do all of this signed in as **departurzedits@gmail.com**.

1. Go to console.cloud.google.com and create a project called **DEPARTURZ Portal**.
2. **APIs & Services > Library:** enable **Google Drive API** and **Google Sheets API**.
3. **APIs & Services > OAuth consent screen** (Google may call it "Google Auth Platform"): **Get started**, app name **DEPARTURZ**, support email departurzedits@gmail.com, audience **External**.
4. Under **Audience**, click **Publish app** so the status says **In production**. This matters: in "Testing" mode Google signs the portal out of the Drive every 7 days.
5. **Clients > Create client**, type **Web application**, name **DEPARTURZ Portal**:
   - Authorized JavaScript origins: `https://www.departurz.com`, `https://departurz.com`
   - Authorized redirect URIs: `https://www.departurz.com/api/p/setup/google` (add `http://localhost:5174/oauth` too only if you'll ever use the terminal route below)
6. Copy the **Client ID** and **Client secret** straight away. Google only shows the secret once.

## 3. Add the settings to Vercel

**Storage first:** in the Vercel project, open **Storage**, add **Upstash for Redis** from the Marketplace (free plan) and connect it to this project. That adds its settings for you.

Then **Settings > Environment Variables**, add these for **Production**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | From step 2 |
| `GOOGLE_CLIENT_SECRET` | From step 2 |
| `SETUP_KEY` | A long phrase only you know. It unlocks the setup page in step 4. |
| `CRON_SECRET` | Another long random phrase (Vercel sends it with the daily job; without it there are no daily emails) |
| `RESEND_API_KEY` | From resend.com, for sign-in links and every portal email. The domain departurz.com must be verified there. |
| `PORTAL_FROM` | Optional. Defaults to `DEPARTURZ <portal@departurz.com>` |
| `NOTIFY_EMAIL` | Optional. Where bookings, uploads and messages are sent. Defaults to `wecreate@departurz.com` |
| `ANTHROPIC_API_KEY` | Optional. Turns on the AI answers in the homepage chat bubble |

Then **Deployments > ⋯ > Redeploy** so the site picks them up.

## 4. Connect the Drive (one page, about a minute)

Open **departurz.com/setup**. The checklist shows what's in place. Enter your `SETUP_KEY`, the email you'll sign in with, and your name, then **Connect the Drive**. Google asks you to sign in: pick **departurzedits@gmail.com**. It may say it hasn't verified the app; that's expected for your own private app. Click **Advanced > Go to DEPARTURZ**, then **Continue**, and allow Drive and Sheets.

The page builds **DEPARTURZ Portal / Clients** and **/ Team** in the Drive, the **DEPARTURZ Clients** and **DEPARTURZ Team** sheets with every tab, header and dropdown, and the **DEPARTURZ Books** sheet, and puts you on the Team tab as the owner. (An example client project is added too; delete it whenever you like.) The Drive connection and the sheet IDs are kept in the project's Redis, so there's nothing to copy into Vercel. Run it again any time: it only adds what's missing, and it reconnects the Drive if Google ever asks you to.

Then open **departurz.com/portal**, sign in with your email, and you're in.

**The terminal route (only if you'd rather):** with Node.js 20+, in a copy of the repo, put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then `npm install`, `npm run google-token` and `npm run setup -- --admin you@departurz.com --name Nate`. It prints the refresh token and five IDs to add to Vercel (`GOOGLE_REFRESH_TOKEN`, `CLIENTS_SHEET_ID`, `TEAM_SHEET_ID`, `CLIENTS_FOLDER_ID`, `TEAM_FOLDER_ID`, `BOOKS_SHEET_ID`). Anything set in Vercel wins over what the setup page saved. `.env.local` holds secrets: keep it on your computer only.

## 5. Running it day to day

Everything is driven from the two Sheets. Dates are `YYYY-MM-DD` (the Sheets format them for you). You can open both from the **DEPARTURZ Portal** folder in Drive; share them with your main email if you'd rather edit from there.

**Add a client**
- **Clients** tab: their email and name (company and socials are optional; they can fill those in themselves).
- **Projects** tab: a `code` (like `DPZ-0143`), their `client_email` (several emails separated by commas share one project), `title`, `service`, `status`, `lead`.
- They can now sign in. The first time they do, they're added to Kit.

**Their timeline:** **Milestones** tab, one row per stop (`project_code`, `label`, `date`, `state` of done, now or next, and a short `note`). When a stop is marked done, they get a project update email the next morning.

**What you need from them:** **Needs** tab (`kind`, `label`, `detail`, `due`). They upload or paste it under Check-in, and you get an email with links. They get reminders 3 days and 1 day before, on the day, and gentle nudges if it's late (copied to you).

**Send finished files:** drop them into the project's **From DEPARTURZ** folder in Drive (**DEPARTURZ Portal / Clients / code · title**; the portal makes it the morning after you add the project, or as soon as the client signs in), or use **Deliver files** on the Desk. They appear in the client's portal under Files.

**Cuts for the client to review:** see "The review rooms" below.

**Confirmation numbers:** a project's `code` is the client's confirmation number. It's on their boarding pass and on every document, invoice, receipt and portal email, so everything for one project matches.

**Documents (contracts, guides, proposals, call sheets):** drop the file into the project's **Documents** folder in Drive. As soon as the client opens their portal (or the next morning), it's numbered under their confirmation (`DPZ-0143-D1`, `D2`…) on the **Documents** tab, shows up in their portal, and they get an email. To have them accept something, like a contract or a location release, set its `status` to `to sign`. They read it and accept by ticking a box and typing their name; their name, email and the time are saved in `accepted_by`, and you both get an email. For a formal e-signature, put a DocuSign or Dropbox Sign link in the row's `url` instead of a file. You can also add a row by hand with a `url` (a Google Doc, for example) and leave `ref` blank; the portal numbers it.

**Invoices:** **Invoices** tab (`no`, `project_code`, `label`, `amount`, `due`, `status` of due). Number them under the confirmation, like `DPZ-0143-P1`, `DPZ-0143-P2`. Card, Apple Pay, Cash App Pay, PayPal, Venmo and Square mark themselves paid. For Zelle or $Cashtag, the client taps "I sent it" (status becomes `sent`); set it to `paid` once the money shows up.

**Wrap a project:** set its `status` to **Delivered** (or fill `delivered_date`). The next morning they get a thank-you letter with an invite to book again, and they're tagged in Kit.

**Add crew:** **Team** tab (email, name, role, city, `tz` like `Africa/Lagos`, day `rate`). `active` = no locks someone out. The `admin` column sets what they can do:
- `owner`: everything. That's you, and only you. (`yes` from the first setup means the same.)
- `manager`: the Desk (booking requests, crew tasks, who's on which project, calendar dates, delivering files) and the client review room, where they can add notes. They never see money (no crew pay, invoices or books) and never see client messages.
- `no` or blank: crew.

**Who sees what (the privacy wall):**
- Crew only see projects they're on: put their emails or first names in the project's `crew` column (or tick them under Desk > Projects > Edit).
- Crew see a project by its `code_name` (like "Project Ember"), or by its code if there's none. Never the client's name, company, email or project title. Files a client uploaded show as from "Client".
- Clients only ever see you (`OWNER_NAME`) and "DEPARTURZ". Never a crew name.
- Client messages are between the client and you. Crew and managers can't open them.
- **Tasks** tab: `assignee` (their email or name), `title`, `project`, `due`. They get reminders 2 days and 1 day before, on the day, and overdue nudges copied to you.
- **Channels** tab: group chats. `members` = all, or a list of emails.
- **Kudos** tab: write a thank-you (`email`, `from`, `text`) and it's emailed to them the next morning and kept on their crew card. You can also send one from the portal (Lounge > Admin).
- **Payouts:** crew submit hours in the portal. You approve them and mark them paid under Payroll after you send the money (Wise, PayPal, Zelle, whatever they chose). Each step emails them.

**Social links on the Contact page** are listed at the top of the script in `public/contact.html` (`SOCIALS`). Fill in a handle and its link turns on; empty ones show as "Coming soon".

## 5b. The review rooms

Two screening rooms, both in the portal. A cut plays on the big screen and on the right monitor, and in the editing app on the left monitor. **Full screen** (the corner button, or the F key) watches it on its own.

**The editors room** (crew side, everyone on a project):
1. An editor uploads a cut (**Upload a cut**). You get an email. Name files like `Teaser v3` and the versions line up by themselves.
2. You and managers leave notes. Each note keeps its timecode, and can point at a spot on the frame.
3. You **Approve** it or send it back (**Needs changes**; the editor gets your notes by email).
4. **Send to the client** puts a copy in the client's review room and emails them. Your notes, and the editor's name, never travel with it.
Editors also see the client's notes on their project's cuts, signed "Client", read-only.

**The client review room** (client side; you and managers see every client's under **Client review**):
- Anything you drop into the project's **For review** folder in Drive shows up there too (within a minute of the client or you opening the room, and every morning), and the client is emailed.
- The client watches, leaves notes on the frame (videos), on the picture (images) or on the page (PDFs), then taps **Approve** or **Ask for changes**. You get an email with every note and its timecode; the editor who made it gets one too, signed "Client".
- Each "Ask for changes" uses a round. Set a project's included rounds in `review_rounds` (default 2). You get a heads-up when a client goes past them.
- Videos: export **MP4 (H.264)** for the rooms. ProRes and other camera formats don't play in browsers.

**The room itself:** the picture is `public/room/scene.jpg` (the screen and both monitors flat green), and `public/room/editor.png` is the editing app on the left monitor. To swap in the Krea room: replace `scene.jpg` with the new still (16:9, same framing as the video), add the character loop as `public/room/scene.mp4` and set `"loop": "room/scene.mp4"` in `public/room/scene.json`. The green screens are found automatically. For a new editing-app picture, set `viewer` in `scene.json` to the box where the video plays (left, top, right, bottom, as fractions of the picture).

## 5c. The Desk (you and managers)

**Booking requests** from client calendars wait here. **Confirm** or **Decline** (with a note); the client gets an email either way, and confirmed days show up on the crew's Deadlines. **Crew tasks**: give someone a task (they get an email and reminders). **Projects**: who's on each one, and the code name crew see. **Add a date**: shoot days, reviews and deliveries go on the client's calendar (optionally emailing them) and the crew's Deadlines (crew on the project get an email for shoot days).

## 5d. The books and the morning email

**The books** (**DEPARTURZ Books** sheet, owner only, under Payroll): Money in (every paid invoice, with the card fee worked out), Crew pay (approved and paid), Expenses (type yours in by hand; the portal never touches this tab), and a Summary by month and by project with profit and a tax set-aside. Fees and the tax percent are in the **Settings** tab: check them against your processor statements and your accountant. It rebuilds every morning, or press **Update now**. **Download for Numbers** gives you the same thing as an `.xlsx` that opens in Numbers or Excel.

**The morning email** goes to you every day at about 8am Los Angeles time (7am in winter): today's and tomorrow's shoots, reviews, deliveries and due tasks; booking requests, cuts and crew hours waiting on you; client approvals and payments since yesterday; invoices coming due; and anything running late.

## 6. Payments (add any of these, any time)

The Payments page only shows the methods you've set up.

- **Card, Apple Pay, Cash App Pay (Stripe):** add `STRIPE_SECRET_KEY`. In the Stripe Dashboard, turn on **Apple Pay** and **Cash App Pay** under Settings > Payment methods. Then **Developers > Webhooks > Add endpoint**: `https://www.departurz.com/api/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and add its signing secret as `STRIPE_WEBHOOK_SECRET`.
- **PayPal and Venmo:** at developer.paypal.com create a **Live** REST app, add `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET`. Venmo appears automatically for US clients on phones.
- **Square:** at developer.squareup.com create an app, add the production `SQUARE_ACCESS_TOKEN` and your `SQUARE_LOCATION_ID`.
- **Zelle:** `ZELLE_HANDLE` = the email or phone clients send to.
- **Cash App by hand:** `CASHTAG` = your $cashtag (used when Stripe isn't set up).

Card numbers and bank details never touch the portal. They're entered on Stripe, PayPal or Square's own pages.

## 7. Kit

Add `KIT_API_KEY` (Kit > Settings > Developer > API key, v4). Every client with a login is subscribed and tagged:

- `Portal client`, plus `Project DPZ-0143` for each project
- `Portal: project updates`, `Portal: thank-yous`, `Portal: offers` (they can switch these off on their Profile page, and the tags follow)
- `Portal: delivered` once a project wraps

Build your Kit automations on those tags (for example: `Portal: delivered` waits 60 days, then sends the returning-client offer). If the key isn't set, or Kit rejects it, the portal keeps working and simply skips Kit.

## 8. Try changes on your computer

`npm run dev` runs the whole site and portal at http://localhost:3000 with a pretend Google, Drive and email, filled with sample data. Sign in at `/portal` with `jordan@lumencoffee.example` (client), `amara@crew.example` or `hana@crew.example` (crew), `rae@departurz.example` (manager) or `nate@departurz.example` (owner). The sign-in links print in the terminal.

`npm test` runs the automated checks.

## 9. The iPhone and Android apps (next phase)

The portal's API already supports the apps: they sign in the same way (Google, or an email link that opens the app) and get a token instead of a cookie. The apps will be built with Expo (one codebase for both stores). You'll need:

- An Apple Developer account ($99 a year) and a Google Play developer account ($25 once), both under DEPARTURZ
- Two more OAuth client IDs in the Google project from step 2 (types iOS and Android), added as `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`

## Good to know

- The Terms of Use and Privacy pop-up text lives in `public/legal.js`, one place for every page. It's a plain-language starting point; have an attorney review it, and update the date at the top whenever it changes.

- When someone opens a file from the portal, Drive makes that one file viewable by anyone with its link, so the link works for them without a Google account. The links are long and unguessable, and folders stay private.
- If Google ever stops letting the portal into the Drive (for example the departurzedits password changes), run `npm run google-token` again and update `GOOGLE_REFRESH_TOKEN` in Vercel.
- Chat keeps the newest 500 messages per conversation.
- Logs for every function are under the Vercel project's **Logs** tab.

## Work page videos

Every Work page video and cover image lives in `public/work/` (nothing loads from the old site anymore). Each video is an H.264 MP4 at 720p, kept under 13 MB so it starts quickly on phones, with a matching `.webp` cover frame. Videos with sound start muted (browsers only autoplay that way) and show a **Sound on** button.

A file's `video` can also be a YouTube link instead of an MP4; the page embeds it on its own. That's a good option for anything long, since it keeps the site small.
