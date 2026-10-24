# DEPARTURZ site + portal: setup

This folder is the whole website plus the client and crew portal, ready for one Vercel project.

- **Sign-in:** Google, or a one-tap link by email. Nobody has a password. Only emails listed in your two Google Sheets can get in.
- **Your control panel is two Google Sheets** in the departurzedits Drive: **DEPARTURZ Clients** and **DEPARTURZ Team**. Add a row and the portal updates.
- **Files** go straight from the browser into the departurzedits Drive, any size, and resume if the connection drops.
- **Chat** (client threads, crew channels, direct messages) is stored in Upstash Redis, which has a free tier.
- **Emails go out on their own**, once a day at 8am Los Angeles time: reminders, project updates, thank-you letters, and Kit sign-ups.

Plan on about an hour the first time. Steps 1 to 4 are required. Payments (step 6) and Kit (step 7) can be added whenever you're ready.

---

## 1. Where the site lives (done)

- **Code:** the GitHub repo `vasteleven/departurz-website`. Every push to its `main` branch goes live on its own.
- **Hosting:** the Vercel project **departurz-website** (team vasteleven's projects, Pro plan), with `departurz.com` and `www.departurz.com` attached. `departurz.com` forwards to `www.departurz.com`.
- **Settings below** (the environment variables) go in that project: **Vercel > departurz-website > Settings > Environment Variables**. After adding or changing any, redeploy once (**Deployments > ⋯ > Redeploy**) so the site picks them up.
- **Undo:** if a change ever goes wrong, **Deployments**, pick the last good one, **Promote to Production**.
- You'll need Node.js 20 or newer from nodejs.org only for the two terminal steps below (`npm run google-token` and `npm run setup`), run inside a copy of the repo.

The site is live. Until the steps below are done, the contact form opens the visitor's email app instead of sending on its own, and the portal tells visitors it opens with their first project.

## 2. Connect Google (Drive, Sheets and "Sign in with Google")

Do all of this signed in as **departurzedits@gmail.com**.

1. Go to console.cloud.google.com and create a project called **DEPARTURZ Portal**.
2. **APIs & Services > Library:** enable **Google Drive API** and **Google Sheets API**.
3. **APIs & Services > OAuth consent screen** (Google may call it "Google Auth Platform"):
   - User type **External**. App name **DEPARTURZ**, support email departurzedits@gmail.com, logo optional.
   - Under **Audience**, click **Publish app** so the status says **In production**. This matters: in "Testing" mode Google signs the portal out of the Drive every 7 days.
4. **Credentials > Create credentials > OAuth client ID**, type **Web application**, name it **DEPARTURZ Portal**:
   - Authorized JavaScript origins: `https://departurz.com`, `https://www.departurz.com`, `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:5174/oauth`
5. Copy the **Client ID** and **Client secret**.

## 3. Build the Drive folders and the two Sheets (on your computer, once)

In this folder, create a file called `.env.local` with:

```
GOOGLE_CLIENT_ID=paste the client ID
GOOGLE_CLIENT_SECRET=paste the client secret
```

Then in a terminal in this folder:

```
npm install
npm run google-token
```

A browser opens. Sign in as **departurzedits@gmail.com**. Google shows a warning that it hasn't verified the app; that's expected for your own private app. Click **Advanced > Go to DEPARTURZ (unsafe)**, then **Continue**. The terminal prints your `GOOGLE_REFRESH_TOKEN`.

Then run (with your own email, the one you'll sign in with):

```
npm run setup -- --admin you@departurz.com --name Nate
```

This creates **DEPARTURZ Portal / Clients** and **/ Team** in the Drive, plus the two Sheets with every tab, header and dropdown, and adds you to the Team tab as an admin. It prints four IDs for the next step. (It also adds an example client project you can delete later.)

`.env.local` holds secrets. Keep it on your computer only. It's already excluded from Git.

## 4. Add the settings to Vercel

**Storage first:** in the Vercel project, open **Storage > Create Database > Upstash for Redis** (free plan), and connect it to this project. That adds its settings for you.

Then **Settings > Environment Variables**, add these for **Production**:

| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random string. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | From step 2 |
| `GOOGLE_CLIENT_SECRET` | From step 2 |
| `GOOGLE_REFRESH_TOKEN` | From step 3 |
| `CLIENTS_SHEET_ID`, `TEAM_SHEET_ID`, `CLIENTS_FOLDER_ID`, `TEAM_FOLDER_ID` | The four IDs from step 3 |
| `RESEND_API_KEY` | From resend.com (the same account the contact form uses). The domain departurz.com must be verified there. |
| `PORTAL_FROM` | `DEPARTURZ <portal@departurz.com>` |
| `PORTAL_URL` | `https://www.departurz.com` (the address the site settles on) |
| `CRON_SECRET` | Another long random string (Vercel sends it with the daily job) |
| `NOTIFY_EMAIL` | Optional. Where bookings, uploads and messages are sent. Defaults to `wecreate@departurz.com` |
| `ANTHROPIC_API_KEY` | Optional. Turns on the AI answers in the homepage chat bubble |

Redeploy (**Deployments > ... > Redeploy**). Then open `departurz.com/portal`, enter your email, and you're in.

## 5. Running it day to day

Everything is driven from the two Sheets. Dates are `YYYY-MM-DD` (the Sheets format them for you). You can open both from the **DEPARTURZ Portal** folder in Drive; share them with your main email if you'd rather edit from there.

**Add a client**
- **Clients** tab: their email and name (company and socials are optional; they can fill those in themselves).
- **Projects** tab: a `code` (like `DPZ-0143`), their `client_email` (several emails separated by commas share one project), `title`, `service`, `status`, `lead`.
- They can now sign in. The first time they do, they're added to Kit.

**Their timeline:** **Milestones** tab, one row per stop (`project_code`, `label`, `date`, `state` of done, now or next, and a short `note`). When a stop is marked done, they get a project update email the next morning.

**What you need from them:** **Needs** tab (`kind`, `label`, `detail`, `due`). They upload or paste it under Check-in, and you get an email with links. They get reminders 3 days and 1 day before, on the day, and gentle nudges if it's late (copied to you).

**Send files and cuts:** drop files into the project's **From DEPARTURZ** folder in Drive (**DEPARTURZ Portal / Clients / code · title**; the portal makes it the morning after you add the project, or as soon as the client signs in). They appear under "From us". To ask for notes on a cut, put the file's ID (the long code in its Drive link) in the project's `review_file_id`, and a `review_title`. They get an email, watch it in the portal, and approve or send notes. Their answer lands in `review_state` and in your inbox.

**Confirmation numbers:** a project's `code` is the client's confirmation number. It's on their boarding pass and on every document, invoice, receipt and portal email, so everything for one project matches.

**Documents (contracts, guides, proposals, call sheets):** drop the file into the project's **Documents** folder in Drive. As soon as the client opens their portal (or the next morning), it's numbered under their confirmation (`DPZ-0143-D1`, `D2`…) on the **Documents** tab, shows up in their portal, and they get an email. To have them accept something, like a contract or a location release, set its `status` to `to sign`. They read it and accept by ticking a box and typing their name; their name, email and the time are saved in `accepted_by`, and you both get an email. For a formal e-signature, put a DocuSign or Dropbox Sign link in the row's `url` instead of a file. You can also add a row by hand with a `url` (a Google Doc, for example) and leave `ref` blank; the portal numbers it.

**Invoices:** **Invoices** tab (`no`, `project_code`, `label`, `amount`, `due`, `status` of due). Number them under the confirmation, like `DPZ-0143-P1`, `DPZ-0143-P2`. Card, Apple Pay, Cash App Pay, PayPal, Venmo and Square mark themselves paid. For Zelle or $Cashtag, the client taps "I sent it" (status becomes `sent`); set it to `paid` once the money shows up.

**Wrap a project:** set its `status` to **Delivered** (or fill `delivered_date`). The next morning they get a thank-you letter with an invite to book again, and they're tagged in Kit.

**Add crew:** **Team** tab (email, name, role, city, `tz` like `Africa/Lagos`, day `rate`). `admin` = yes gives someone the client threads, crew pay and client views. `active` = no locks someone out.
- **Tasks** tab: `assignee` (their email or name), `title`, `project`, `due`. They get reminders 2 days and 1 day before, on the day, and overdue nudges copied to you.
- **Channels** tab: group chats. `members` = all, or a list of emails.
- **Kudos** tab: write a thank-you (`email`, `from`, `text`) and it's emailed to them the next morning and kept on their crew card. You can also send one from the portal (Lounge > Admin).
- **Payouts:** crew submit hours in the portal. You approve them and mark them paid under Payroll after you send the money (Wise, PayPal, Zelle, whatever they chose). Each step emails them.

**Social links on the Contact page** are listed at the top of the script in `public/contact.html` (`SOCIALS`). Fill in a handle and its link turns on; empty ones show as "Coming soon".

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

`npm run dev` runs the whole site and portal at http://localhost:3000 with a pretend Google, Drive and email, filled with sample data. Sign in at `/portal` with `jordan@lumencoffee.example` (client), `amara@crew.example` (crew) or `nate@departurz.example` (admin). The sign-in links print in the terminal.

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
