const { getDb } = require("../lib/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const serviceId = String(body.serviceId || "").trim();
  const passengerName = String(body.passengerName || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const seats = Array.isArray(body.seats)
    ? [...new Set(body.seats.map(value => String(value).trim().toUpperCase()))]
    : [];

  if (!UUID_PATTERN.test(serviceId)) {
    return res.status(400).json({ error: "A valid serviceId is required" });
  }
  if (passengerName.length < 2 || passengerName.length > 120) {
    return res.status(400).json({ error: "Enter a valid passenger name" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }
  if (!seats.length || seats.length > 6 || seats.some(seat => !/^[A-Z0-9-]{1,8}$/.test(seat))) {
    return res.status(400).json({ error: "Select between 1 and 6 valid seats" });
  }

  try {
    const sql = getDb();
    const created = await sql`
      SELECT * FROM create_booking_with_seat_holds(
        ${serviceId}::uuid,
        ${passengerName},
        ${email},
        ${phone},
        ${seats}::text[]
      )
    `;
    const row = created[0];
    return res.status(201).json({
      booking: {
        id: row.booking_id,
        status: row.booking_status,
        payment_status: row.payment_status,
        hold_expires_at: row.hold_expires_at,
        seats
      },
      message: "A temporary 10-minute seat hold was created. Payment has not been taken; the booking is pending and is not a confirmed ticket."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    if (error.code === "P0002") {
      return res.status(404).json({ error: "Service not found or inactive" });
    }
    if (error.code === "23505") {
      return res.status(409).json({ error: "One or more selected seats are no longer available. Please choose different seats." });
    }
    if (error.code === "22023") {
      return res.status(400).json({ error: error.message || "Select between 1 and 6 seats" });
    }
    if (error.code === "42883" || error.code === "42P01") {
      console.error("Seat hold migration missing", error);
      return res.status(503).json({ error: "Seat reservation setup is incomplete. Apply migrations/001-seat-holds.sql to the production database." });
    }
    console.error("Booking creation failed", error);
    return res.status(500).json({ error: "Unable to create booking" });
  }
};
