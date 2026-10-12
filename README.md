# Vision2036 Group Savings App

Vision2036 is a full-stack savings management dashboard built with Next.js App Router, MongoDB, NextAuth, Cloudinary, and Google Sheets sync.

## Features

- Role-based login for `member`, `moderator`, and `admin`
- Member profile management, avatar upload, and bank accounts
- Payment submission with proof upload and admin verification workflow
- Admin dashboard, costs, summaries, and Google Sheets sync retries
- Part 5 exports:
  - Member report PDF / Excel
  - Monthly report PDF / Excel
  - Full year dump PDF / Excel
- Admin audit log viewer with filters
- Member management tools including activate/deactivate, role changes, and password reset

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- MongoDB Atlas + Mongoose
- NextAuth credentials provider
- Cloudinary
- Google Sheets API v4
- pdf-lib
- SheetJS (`xlsx`)

## Local Setup

1. Install dependencies:

	npm install

2. Create `.env.local` and set the required environment variables.

3. Run the dev server:

	npm run dev

4. Open http://localhost:3000

## Environment Variables Checklist

Required:

- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Optional for local development fallback:

- `MONGODB_URI_LOCAL` (example: `mongodb://127.0.0.1:27017/vision2036`)
- `MONGODB_DB_NAME` (defaults to `vision2036`)

Monthly payment selection (optional):

- `PAYMENT_EARLIEST_MONTH` (defaults to `2025-01`)
- `PAYMENT_MAX_FUTURE_MONTHS` (defaults to `12` from the current Asia/Dhaka month)
- `PAYMENT_MAX_MONTHS_PER_SUBMISSION` (defaults to `12`)

Multi-month submissions require a MongoDB replica set or sharded cluster. Each
selected month creates one allocation under a shared payment ID; approval posts
all allocations in a single database transaction. Existing payments need no
migration. Set the three limits in the server environment and redeploy to change
the available month window.

The payment list and member statement show one submission with its month
breakdown. Monthly and yearly financial reports use each allocation's accounting
month. Google Sheets keeps the existing deposit columns and writes one row for
the physical payment, listing all selected months in its Month cell.

Members can optionally add a flexible amount to a monthly submission. The
monthly amount remains Tk. 3,000 per selected month; the flexible amount is
credited to the first selected month and its year. All selected months must
belong to one year when an extra flexible amount is included. The submission
still has one proof and one approval, and Google Sheets records the monthly
and flexible portions in their existing separate columns.

Google Sheets sync:

- `GOOGLE_SHEETS_PROJECT_ID`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

Notes:

- Share the target spreadsheet with the Google service account email as `Editor`.
- Keep Google credentials server-only.
- This app uses internal Next.js API routes, so no public API base URL is required for normal operation.
- If Atlas login fails locally due to IP whitelist/network restrictions, the app will attempt `MONGODB_URI_LOCAL` in development.

## Seed Script

To seed the initial demo users:

	npm run seed

Make sure `MONGODB_URI` is set before running the seed command.

This creates the initial members and admin account defined in [scripts/seed.ts](scripts/seed.ts).

## Exports

Available from:

- Member self-service export on [src/app/(dashboard)/summaries/page.tsx](src/app/(dashboard)/summaries/page.tsx)
- Admin export center on [src/app/(dashboard)/admin/tools/page.tsx](src/app/(dashboard)/admin/tools/page.tsx)

Supported scopes:

- Member report
- Monthly report
- Full year dump

Each export creates an audit log entry using `EXPORT_PDF` or `EXPORT_EXCEL`.

## Admin Operations

- Member management: [src/app/(dashboard)/admin/members/page.tsx](src/app/(dashboard)/admin/members/page.tsx)
- Audit logs: [src/app/(dashboard)/admin/audit-logs/page.tsx](src/app/(dashboard)/admin/audit-logs/page.tsx)
- Admin tools / sync failures: [src/app/(dashboard)/admin/tools/page.tsx](src/app/(dashboard)/admin/tools/page.tsx)

## Deployment Notes for Vercel

- Add all required environment variables in the Vercel project settings.
- Ensure MongoDB Atlas network access allows Vercel.
- Ensure Cloudinary credentials are valid in production.
- Ensure the Google Sheets service account still has access to the production spreadsheet.
- Regenerate and rotate secrets if they were ever shared publicly.

## Security Notes

- Basic rate limiting is applied to credential login attempts.
- Passwords are hashed with bcrypt before save.
- Admin actions are tracked in the audit log.
