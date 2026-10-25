const crypto = require("crypto");
const { getDb } = require("../../lib/db");

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "hex"); } catch (error) { return false; }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "Payment webhook is not configured" });

  let sql;
  let eventId;
  try {
    const rawBody = await readRawBody(req);
    if (!validSignature(rawBody, req.headers["x-razorpay-signature"], secret)) {
      return res.status(400).json({ error: "Invalid payment webhook signature" });
    }

    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch (error) {
      return res.status(400).json({ error: "Invalid webhook JSON" });
    }
    if (!event || typeof event.event !== "string") {
      return res.status(400).json({ error: "Invalid webhook event" });
    }

    const payment = event.payload && event.payload.payment && event.payload.payment.entity;
    eventId = String(event.id || req.headers["x-razorpay-event-id"] || crypto.createHash("sha256").update(rawBody).digest("hex"));
    const paymentId = payment && payment.id ? String(payment.id) : null;
    const orderId = payment && payment.order_id ? String(payment.order_id) : null;
    const amount = payment && Number.isSafeInteger(Number(payment.amount)) ? Number(payment.amount) : null;
    const currency = payment && payment.currency ? String(payment.currency) : null;

    sql = getDb();
    const inserted = await sql`
      INSERT INTO payment_webhook_events
        (event_id, event_type, payment_id, order_id, amount_paise, currency, processing_status)
      VALUES
        (${eventId}, ${event.event}, ${paymentId}, ${orderId}, ${amount}, ${currency}, 'received')
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `;

    if (!inserted.length) {
      const prior = await sql`SELECT processing_status FROM payment_webhook_events WHERE event_id = ${eventId} LIMIT 1`;
      if (prior.length && ["processed", "review_required", "ignored"].includes(prior[0].processing_status)) {
        return res.status(200).json({ received: true, duplicate: true, status: prior[0].processing_status });
      }
    }

    // Only captured payments can confirm a ticket; browser callbacks are never trusted.
    if (event.event !== "payment.captured") {
      await sql`UPDATE payment_webhook_events SET processing_status = 'ignored', processed_at = now() WHERE event_id = ${eventId}`;
      return res.status(200).json({ received: true, ignored: true });
    }

    if (!payment || !payment.id || !payment.order_id || !Number.isSafeInteger(Number(payment.amount)) || !payment.currency) {
      await sql`UPDATE payment_webhook_events SET processing_status = 'failed', error_code = 'invalid_payment_payload', processed_at = now() WHERE event_id = ${eventId}`;
      return res.status(400).json({ error: "Captured payment payload is incomplete" });
    }

    const rows = await sql`
      SELECT * FROM confirm_booking_payment(
        ${String(payment.order_id)},
        ${String(payment.id)},
        ${Number(payment.amount)}::bigint,
        ${String(payment.currency)}
      )
    `;
    if (!rows.length) throw new Error("Payment confirmation returned no result");

    const result = rows[0];
    if (result.review_required) {
      await sql`UPDATE payment_webhook_events SET processing_status = 'review_required', error_code = 'seat_hold_or_payment_review', processed_at = now() WHERE event_id = ${eventId}`;
      console.error("Captured payment requires manual review", { bookingId: result.booking_id, orderId: payment.order_id });
      return res.status(200).json({
        received: true,
        review_required: true,
        bookingId: result.booking_id,
        message: "Payment recorded. A valid seat hold was not available or payment needs reconciliation; no ticket was issued."
      });
    }

    await sql`UPDATE payment_webhook_events SET processing_status = 'processed', error_code = NULL, processed_at = now() WHERE event_id = ${eventId}`;
    return res.status(200).json({
      received: true,
      bookingId: result.booking_id,
      status: result.booking_status,
      paymentStatus: result.payment_status,
      ticketReference: result.ticket_reference,
      alreadyConfirmed: result.already_confirmed
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") return res.status(503).json({ error: "Database is not configured" });
    if (error.code === "P0002" || error.code === "22023" || error.code === "23505") {
      if (sql && eventId) {
        try {
          await sql`UPDATE payment_webhook_events SET processing_status = 'review_required', error_code = ${String(error.code)}, processed_at = now() WHERE event_id = ${eventId}`;
        } catch (auditError) {}
      }
      console.error("Captured payment requires manual review", { code: error.code });
      return res.status(200).json({ received: true, review_required: true });
    }
    if (error.code === "42P01" || error.code === "42883" || error.code === "42703") {
      return res.status(503).json({ error: "Payment database migration is incomplete" });
    }
    if (sql && eventId) {
      try {
        await sql`UPDATE payment_webhook_events SET processing_status = 'failed', error_code = 'processing_error', processed_at = now() WHERE event_id = ${eventId}`;
      } catch (auditError) {}
    }
    console.error("Payment webhook processing failed", error);
    return res.status(500).json({ error: "Unable to process payment webhook" });
  }
};

module.exports.config = { api: { bodyParser: false } };
