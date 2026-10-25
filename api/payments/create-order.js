const { getDb } = require("../../lib/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(503).json({ error: "Online payments are not configured yet. Add Razorpay keys in Vercel environment variables." });
  }

  const body = req.body || {};
  const bookingId = typeof body.id === "string" ? body.id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!UUID_PATTERN.test(bookingId)) return res.status(400).json({ error: "Enter a valid booking reference" });
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "Enter the email address used for the booking" });

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT b.id, b.status, b.payment_status, b.payment_provider_order_id,
             b.amount_paise, b.currency, b.seats, b.email,
             (SELECT count(*) FROM booking_seat_holds h
              WHERE h.booking_id = b.id AND h.hold_status = 'held' AND h.expires_at > now()) AS active_hold_count,
             (SELECT max(h.expires_at) FROM booking_seat_holds h
              WHERE h.booking_id = b.id AND h.hold_status = 'held' AND h.expires_at > now()) AS hold_expires_at,
             s.fare
      FROM bookings b
      JOIN bus_services s ON s.id = b.service_id
      WHERE b.id = ${bookingId}::uuid AND lower(b.email) = lower(${email})
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: "No booking was found for that reference and email combination" });
    const booking = rows[0];
    if (booking.status === "confirmed" && booking.payment_provider_order_id) {
      return res.status(409).json({ error: "This booking is already confirmed" });
    }
    if (booking.status !== "pending" || !["unpaid", "pending"].includes(booking.payment_status)) {
      return res.status(409).json({ error: "This booking is not available for payment" });
    }
    if (Number(booking.active_hold_count) !== booking.seats.length || !booking.hold_expires_at) {
      return res.status(409).json({ error: "Your temporary seat hold has expired. Search again and choose available seats." });
    }

    if (booking.payment_provider_order_id) {
      return res.status(200).json({
        keyId, orderId: booking.payment_provider_order_id,
        amount: Number(booking.amount_paise), currency: booking.currency || "INR",
        bookingId: booking.id, holdExpiresAt: booking.hold_expires_at,
        message: "Continue payment for your existing order."
      });
    }

    const amountPaise = Math.round(Number(booking.fare) * 100 * booking.seats.length);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100 || amountPaise > 100000000) {
      return res.status(400).json({ error: "The calculated booking amount is invalid" });
    }

    const auth = Buffer.from(keyId + ":" + keySecret).toString("base64");
    const providerResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: booking.id,
        notes: { booking_id: booking.id, product: "HEPRA BUS ticket" }
      })
    });
    let providerOrder = {};
    try { providerOrder = await providerResponse.json(); } catch (error) {}
    if (!providerResponse.ok || !providerOrder.id) {
      console.error("Razorpay order creation failed", { status: providerResponse.status, code: providerOrder.error && providerOrder.error.code });
      return res.status(502).json({ error: "Payment provider could not create an order. Please try again." });
    }

    const saved = await sql`
      UPDATE bookings
      SET payment_provider_order_id = ${providerOrder.id},
          amount_paise = ${amountPaise},
          currency = 'INR',
          payment_status = 'pending'
      WHERE id = ${booking.id}::uuid
        AND payment_provider_order_id IS NULL
        AND status = 'pending'
        AND payment_status IN ('unpaid', 'pending')
      RETURNING payment_provider_order_id, amount_paise, currency
    `;
    if (!saved.length) {
      const winner = await sql`
        SELECT payment_provider_order_id, amount_paise, currency
        FROM bookings WHERE id = ${booking.id}::uuid
      `;
      if (!winner.length || !winner[0].payment_provider_order_id) {
        return res.status(409).json({ error: "Booking changed while preparing payment. Please check its status and retry." });
      }
      return res.status(200).json({
        keyId, orderId: winner[0].payment_provider_order_id,
        amount: Number(winner[0].amount_paise), currency: winner[0].currency || "INR",
        bookingId: booking.id, holdExpiresAt: booking.hold_expires_at,
        message: "Continue payment for your existing order."
      });
    }

    return res.status(200).json({
      keyId, orderId: saved[0].payment_provider_order_id,
      amount: Number(saved[0].amount_paise), currency: saved[0].currency,
      bookingId: booking.id, holdExpiresAt: booking.hold_expires_at,
      message: "Payment order created. A verified webhook is required to confirm your ticket."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") return res.status(503).json({ error: "Database is not configured" });
    if (error.code === "42P01" || error.code === "42703") return res.status(503).json({ error: "Payment database migration is incomplete. Apply migrations/003-razorpay-payments-tickets.sql." });
    console.error("Payment order setup failed", error);
    return res.status(500).json({ error: "Unable to prepare payment right now" });
  }
};
