# HEPRA BUS

Responsive bus-search and booking-request prototype with Vercel serverless APIs, Neon PostgreSQL, temporary seat holds, Razorpay payment-order support, signed payment webhooks, ticket references, status lookup and pending-request cancellation.

## Features

- Responsive route search and bus listing.
- `GET /api/health`: database health check.
- `GET /api/buses?from=Chennai&to=Madurai&date=YYYY-MM-DD`: verified service search.
- `POST /api/bookings`: pending booking request and 10-minute database-backed seat holds.
- `GET /api/booking-status?id=<booking-uuid>&email=<booking-email>`: request, payment, seat-hold and ticket status.
- `POST /api/booking-cancel`: cancel an unpaid pending request and release its temporary holds.
- `POST /api/payments/create-order`: calculates the amount server-side and creates/reuses a Razorpay order for a booking with active holds.
- `POST /api/payments/webhook`: verifies the Razorpay webhook HMAC signature and only confirms a ticket after a captured payment matches the stored order amount/currency and all seat holds are still active.
- PostgreSQL functions serialize seat claims per service, protect against duplicate active/confirmed seat claims, make webhook confirmation idempotent, and create a ticket reference after verified payment.
- Confirmed ticket details can be printed or saved as a PDF from the booking tracker.
- GitHub Actions runs backend and inline frontend JavaScript syntax checks on pushes and pull requests.

## Required database setup

Use the same Neon database referenced by Vercel's `DATABASE_URL`. Run the SQL files in this order in Neon SQL Editor:

1. `schema.sql`
2. `migrations/001-seat-holds.sql`
3. `migrations/002-cancel-booking-release-seats.sql`
4. `migrations/003-razorpay-payments-tickets.sql`

Do not enable payment traffic until all migrations succeed. Migration 003 also updates the booking-hold and cancellation functions for the payment lifecycle. If earlier migrations were already applied, still run migration 003 after them.

## Vercel environment variables

Set these in Vercel Project Settings → Environment Variables, for the environment you intend to test:

- `DATABASE_URL`: Neon PostgreSQL connection string.
- `RAZORPAY_KEY_ID`: Razorpay key ID. Use a test-mode key first.
- `RAZORPAY_KEY_SECRET`: Razorpay secret. Server-side only; never put it in frontend code.
- `RAZORPAY_WEBHOOK_SECRET`: a webhook secret you create in Razorpay dashboard. Keep it distinct from the API key secret.

A placeholder template is in `.env.example`; it contains no working credentials.

## Razorpay test-mode setup

1. Create/configure your Razorpay account and use **test mode** credentials first.
2. Add all three Razorpay environment variables in Vercel.
3. In Razorpay Dashboard → Webhooks, add the deployed URL:
   `https://hepra-bus-travel.vercel.app/api/payments/webhook`
4. Use the exact same webhook secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.
5. Subscribe to the `payment.captured` event.
6. Redeploy the Vercel project after changing environment variables.
7. Test using a verified service and active seat hold. Confirm that the webhook, not the browser callback, changes the booking to paid/confirmed and issues a ticket reference.

The checkout browser callback is deliberately not trusted to confirm a ticket. A signed server webhook is required.

## Local checks and development

```bash
npm install
npm run check
npm run dev
```

`npm run check` checks JavaScript syntax for serverless handlers and inline frontend JavaScript. GitHub Actions runs the same check on pushes and pull requests. It does not replace integration tests against a test database and Razorpay test account.

## Operational safeguards and known limitations

- Temporary seat holds last 10 minutes. If payment is captured after a hold expires, the system records the captured payment for manual reconciliation and **does not issue a ticket**.
- Confirmed seats remain reserved in the database; they are not released by temporary-hold cleanup.
- A ticket reference is not an operator-issued boarding pass until real operator inventory, seat numbering, passenger requirements and boarding workflows are integrated.
- The current UI's seat labels are illustrative. Map them to actual operator seat layouts before accepting real passengers.
- No automatic refunds, email/SMS delivery, customer account authentication, admin console, operator inventory sync, automated expiry worker, production rate limiting, fraud controls, or end-to-end integration test suite is included yet.
- The system intentionally does not insert sample bus inventory. Only add verified operator services.
- Before launch, configure monitoring and backups, add rate limiting, privacy/retention controls, test webhook retries and duplicate events, run concurrency tests, and complete a security review.

Never commit real `.env` files, payment secrets, database credentials, or customer data. Do not advertise the site as live ticketing until the migrations, Vercel deployment, test payments, webhook delivery, and operator inventory have all been verified.
