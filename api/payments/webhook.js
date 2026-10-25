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

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-razorpay-signature"];
    if (!validSignature(rawBody, signature, secret)) {
      return res.status(400).json({ error: "Invalid payment webhook signature" });
    }

    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch (error) {
      return res.status(400).json({ error: "Invalid webhook JSON" });
    }

    // Only captured payments can confirm a ticket; browser callbacks are never trusted.
    if (!event || event.event !== "payment.captured") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const payment = event.payload && event.payload.payment && event.payload.payment.entity;
    if (!payment || !payment.id || !payment.order_id || !Number.isSafeInteger(Number(payment.amount)) || !payment.currency) {
      return res.status(400).json({ error: "Captured payment payload is incomplete" });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT * FROM confirm_booking_payment(
        ${String(payment.order_id)},
        ${String(payment.id)},
        ${Number(payment.amount)}::bigint,
        ${String(payment.currency)}
      )
    `;
    if (!rows.length) return res.status(500).json({ error: "Payment confirmation returned no result" });

    const result = rows[0];
    if (result.review_required) {
      // A payment was captured but its seat hold is no longer valid. Record it, do not issue a ticket.
      // Return 200 so the provider doesn't endlessly retry; this case needs manual reconciliation/refund.
      console.error("Captured payment requires manual review", { bookingId: result.booking_id, orderId: payment.order_id });
      return res.status(200).json({
        received: true,
        review_required: true,
        bookingId: result.booking_id,
        message: "Payment recorded. Seat hold was no longer active; no ticket was issued."
      });
    }

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
    if (error.code === "P0002") {
      console.error("Captured payment references an unknown order");
      return res.status(200).json({ received: true, review_required: true });
    }
    if (error.code === "42P01" || error.code === "42883") {
      return res.status(503).json({ error: "Payment database migration is incomplete" });
    }
    console.error("Payment webhook processing failed", error);
    return res.status(500).json({ error: "Unable to process payment webhook" });
  }
};

module.exports.config = { api: { bodyParser: false } };
