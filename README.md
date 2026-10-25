# HEPRA BUS — bus booking starter

A responsive booking-search frontend and Vercel serverless API starter.

## Included
- `index.html`: responsive HEPRA BUS landing page and route search UI
- `GET /api/health`: database health check
- `GET /api/buses?from=Chennai&to=Madurai&date=YYYY-MM-DD`: search configured services
- `POST /api/bookings`: creates a pending, unpaid booking record
- `schema.sql`: PostgreSQL tables and route/search indexes

## Deploy to Vercel
1. Import this GitHub repository into Vercel.
2. Framework preset: **Other**. Leave build command blank and output directory as `.`.
3. Create a Neon PostgreSQL database and run `schema.sql` in its SQL editor.
4. Add `DATABASE_URL` to Vercel project environment variables for Preview and Production.
5. Redeploy and open `/api/health`; it should return `{"ok":true,"database":"connected"}`.
6. Add real, verified bus services to `bus_services`; no fake inventory is seeded.

## API example
```bash
curl 'https://YOUR-DOMAIN/api/buses?from=Chennai&to=Madurai&date=2026-11-01'
```

## Production blockers — do not accept live payments yet
This is a starter, not a production-ready ticketing system. Payment is not integrated, the UI does not confirm tickets, and booking creation does not reserve seats. Before accepting customers, implement atomic seat holds with expiry, transactions/concurrency protection, authentication and booking ownership, server-side payment orders, signed and idempotent payment webhooks, amount verification, cancellations/refunds, ticket delivery, operator inventory integration, rate limits, monitoring, privacy/retention policy, and tests.

Never commit `.env` or credentials. Do not use customer data until privacy and security controls are ready.

## Local checks
```bash
npm install
npm run check
npm run dev
```
