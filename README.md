# TurfPay — Turf Management System

Web-based booking and payment management for turf facilities. Syncs bookings from Khelomore emails, lets ground staff record cash/online payments with UPI photo proof, and gives admins a dashboard with bank statement matching and verification.

## Features

- **Email sync** — Automatically imports Khelomore booking confirmation emails (name, time, amount)
- **Payment tracking** — Shows Paid / Partial / Pending based on Khelomore pre-payment and on-ground collections
- **Staff portal** — Simple mobile-friendly UI to record split payments (cash + online) with camera capture for UPI screenshots
- **OCR extraction** — Reads sender name and amount from payment screenshots
- **Bank statement matching** — Upload CSV statements; auto-matches online payments by name + amount
- **Manual verification** — Accounts team verifies cash after counting, or manually approves/rejects any payment
- **Admin dashboard** — Daily collection, trends, payment split, pending counts

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 16 (App Router) | Fast, mobile-friendly, easy deploy |
| Database | **Neon Postgres** (free tier) | Secure, reliable, serverless-friendly |
| ORM | Prisma | Type-safe queries |
| Auth | NextAuth (credentials) | Simple role-based login (Staff / Admin) |
| File storage | **Vercel Blob** (free tier) | Payment proofs & bank statements |
| OCR | Tesseract.js | Free, runs on server |
| Hosting | Vercel (free hobby tier) | Zero-config deploy + cron jobs |

## Quick Start

### 1. Create a free Neon database

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a project and copy the connection string
3. Paste it as `DATABASE_URL` in `.env`

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="run: openssl rand -base64 32"
BLOB_READ_WRITE_TOKEN=""   # optional for local dev
EMAIL_IMAP_HOST="imap.gmail.com"
EMAIL_IMAP_USER="your@gmail.com"
EMAIL_IMAP_PASSWORD="your-gmail-app-password"
CRON_SECRET="any-random-string"
```

**Gmail setup:** Enable 2FA → Google Account → Security → App passwords → create one for "Mail".

### 3. Install and run

```bash
npm install
npm run db:push      # create tables
npm run db:seed      # create demo users + bookings
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo logins (after seed)

Set passwords in `.env` using `SEED_PASSWORD_*` variables (see `.env.example`), then run `npm run seed:users`.

**Never commit real passwords to git. Rotate any password that was ever pushed to GitHub.**

## User Roles

### Staff (ground collection)
- View today's bookings
- Open a booking → enter amount → select Cash or Online
- For online: take photo of customer's UPI payment screen
- Pending amount updates automatically after each entry

### Admin (accounts + insights)
- **Dashboard** — collections, trends, sync emails manually
- **Verification** — approve/reject pending payments (cash + unmatched online)
- **Bank Statements** — upload CSV; system auto-matches with OCR data from photos

## Email Sync

Khelomore sends booking confirmations from **`info@khelomore.com`** with subject:

`You have a new booking from KheloMore: [BOOKING-ID]`

The parser extracts:
- Customer name, phone, email
- Venue name, turf/court name, location
- Slot date and time range (supports multiple slots in one email)
- Amount received, slot price, coupon discount
- Payment status (`Status: Completed` = paid on Khelomore)

### Venue filter (important)

Only bookings for **Lush Sports** (your venue) are imported — **all turfs** (Perth, etc.) are included. Set in `.env`:

```env
KHELOMORE_VENUE_NAME="Lush Sports"
```

Emails for other venues are skipped automatically. To restrict to one turf only, optionally set `KHELOMORE_TURF_NAME` — leave it blank for all turfs.

Sync runs once daily on Vercel (Hobby plan limit). For **near-instant sync (~1 min)**, use Google Apps Script — see [Instant Email Sync](#instant-email-sync) below.

## Instant Email Sync

Vercel's free plan only allows **1 cron per day**, so automatic sync there is not instant. Use one of these instead:

### Option A: Google Apps Script (recommended, free, ~1 minute)

This runs inside your Gmail account and pings TurfPay every minute when a new Khelomore email arrives.

1. Log into **sunilhumne@gmail.com**
2. Open [script.google.com](https://script.google.com) → **New project**
3. Copy the contents of `scripts/gmail-instant-sync.gs` into the editor
4. Set `CRON_SECRET` to the same value as in Vercel (Settings → Environment Variables)
5. **Save** → click **Run** → `syncTurfPay` → authorize Gmail access
6. Click **Triggers** (clock icon) → **Add Trigger**:
   - Function: `syncTurfPay`
   - Event source: Time-driven
   - Type: Minutes timer → **Every minute**
7. In Vercel, add env var: `EMAIL_SYNC_MODE=poll` (speeds up each sync)

Bookings should appear within **~1 minute** of the Khelomore email.

### Option B: External cron (free, ~1 minute)

Use [cron-job.org](https://cron-job.org) (free):

- URL: `https://turf-management-system-five.vercel.app/api/email/sync?secret=YOUR_CRON_SECRET`
- Schedule: Every 1 minute
- Method: GET

Also set `EMAIL_SYNC_MODE=poll` in Vercel.

### Option C: Vercel Pro ($20/mo)

Upgrade to Pro → change `vercel.json` cron to `*/15 * * * *` for every 15 minutes (still not instant).

### Manual sync anytime

Admin dashboard → **Sync Emails** button (instant, no setup needed).

## Bank Statement CSV Format

Upload a CSV with columns like:

| Date | Description/Narration | Credit |
|------|----------------------|--------|
| 2025-06-21 | UPI/RAHUL SHARMA/123456 | 1300 |

The matcher compares credit entries against online payments using amount + sender name from OCR.

## Deploy to Vercel (free)

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variables from `.env.example`
4. Create a [Vercel Blob store](https://vercel.com/docs/storage/vercel-blob) and add `BLOB_READ_WRITE_TOKEN`
5. Deploy — cron job in `vercel.json` syncs emails every 15 minutes

## Project Structure

```
src/
├── app/
│   ├── staff/           # Ground staff booking list + payment entry
│   ├── admin/           # Dashboard, verification, bank statements
│   └── api/             # REST endpoints
├── components/          # UI components
└── lib/
    ├── email-parser.ts  # Khelomore email parsing
    ├── email-sync.ts    # IMAP fetch logic
    ├── ocr.ts           # UPI screenshot OCR
    └── bank-matcher.ts  # Statement ↔ payment matching
prisma/
└── schema.prisma        # Database models
```

## Workflow Summary

```
Khelomore Email → Auto-import booking → Staff records payments
                                              ↓
                         Online payment + UPI photo → OCR extracts name/amount
                                              ↓
                    Accounts uploads bank CSV → Auto-match → Verified
                                              ↓
                         Cash → Manual verify button on admin panel
                                              ↓
                              Dashboard shows all metrics
```

## License

Private — for internal turf facility use.
