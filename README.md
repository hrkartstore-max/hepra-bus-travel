# HEPRA BUS — booking experience starter

Responsive route-search UI with Vercel serverless API endpoints and a PostgreSQL schema.

## Included
- `index.html`: responsive search page, swap cities, popular-route shortcuts, accessible loading/empty/error states, and bus result cards
- `GET /api/health`: database health check
- `GET /api/buses?from=Chennai&to=Madurai&date=YYYY-MM-DD`: validated route search
- `POST /api/bookings`: creates a pending, unpaid booking request (no seat hold or payment)
- `GET /api/booking-status?id=<booking-uuid>&email=<booking-email>`: looks up the saved request when both the reference and booking email match
- `schema.sql`: PostgreSQL tables and route/search indexes

## Deploy to Vercel
1. Import this GitHub repository into Vercel.
2. Framework preset: **Other**. Leave the build command blank and set output directory to `.`.
3. Create a Neon PostgreSQL database and run `schema.sql` in its SQL editor.
4. Add `DATABASE_URL` to Vercel environment variables for Preview and Production.
5. Redeploy and open `/api/health`. Expected response: `{"ok":true,"database":"connected"}`.
6. Add verified operator services to `bus_services`. The project intentionally includes no fake bus inventory.

## Local checks
```bash
npm install
npm run check
npm run dev
```

## Example search
```bash
curl 'https://YOUR-DOMAIN/api/buses?from=Chennai&to=Madurai&date=2026-11-01'
```

## Booking status lookup

After a booking request returns a reference, enter that reference and the same email address in the on-page status tracker. The endpoint returns only the request status, payment status, selected seat preferences, and journey summary. It does not return passenger contact details. Requests remain pending/unpaid until a separate verified booking and payment workflow is implemented.

## Production readiness
This is still a starter, not a live ticketing system. The UI searches services but does not complete a purchase. Booking creation only records a pending/unpaid request; it does not hold seats or confirm a ticket. Before accepting real customers, implement transactional seat holds with expiry and concurrency protection, authentication and booking ownership, payment-provider order creation and signed/idempotent webhooks, server-side amount verification, cancellations/refunds, ticket delivery, operator inventory integration, rate limits, monitoring, privacy/retention controls, and automated tests.

Never commit `.env` or credentials. Do not collect customer data until the required security and privacy controls are ready.
