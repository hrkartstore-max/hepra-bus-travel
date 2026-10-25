const { getDb } = require("../lib/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const bookingId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

  if (!UUID_PATTERN.test(bookingId)) {
    return res.status(400).json({ error: "Enter a valid booking reference" });
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Enter the email address used for the booking" });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT b.id, b.status, b.payment_status, b.seats, b.created_at,
             s.operator_name, s.bus_type, s.origin, s.destination,
             s.journey_date, s.departure_time, s.arrival_time
      FROM bookings b
      JOIN bus_services s ON s.id = b.service_id
      WHERE b.id = ${bookingId}::uuid
        AND lower(b.email) = lower(${email})
      LIMIT 1
    `;
    if (!rows.length) {
      return res.status(404).json({ error: "No booking was found for that reference and email combination" });
    }
    const booking = rows[0];
    return res.status(200).json({
      booking: {
        id: booking.id,
        status: booking.status,
        payment_status: booking.payment_status,
        seats: booking.seats,
        created_at: booking.created_at,
        service: {
          operator_name: booking.operator_name,
          bus_type: booking.bus_type,
          origin: booking.origin,
          destination: booking.destination,
          journey_date: booking.journey_date,
          departure_time: booking.departure_time,
          arrival_time: booking.arrival_time
        }
      },
      message: "This is the current booking request status. A pending request is not a confirmed ticket."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    console.error("Booking status lookup failed", error);
    return res.status(500).json({ error: "Unable to look up this booking right now" });
  }
};
