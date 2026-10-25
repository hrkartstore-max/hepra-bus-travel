const { getDb } = require("../lib/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const bookingId = typeof body.id === "string" ? body.id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!UUID_PATTERN.test(bookingId)) {
    return res.status(400).json({ error: "Enter a valid booking reference" });
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Enter the email address used for the booking" });
  }

  try {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM cancel_pending_booking_and_release_seats(
        ${bookingId}::uuid,
        ${email}
      )
    `;
    const row = result[0];
    return res.status(200).json({
      booking: {
        id: bookingId,
        status: row.booking_status
      },
      released_seats: Number(row.released_seats) || 0,
      message: "The pending request was cancelled and its temporary seat holds were released. No payment was taken by this system."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    if (error.code === "P0002") {
      return res.status(404).json({ error: "No booking was found for that reference and email combination" });
    }
    if (error.code === "22023") {
      return res.status(409).json({ error: "Only unpaid pending booking requests can be cancelled" });
    }
    if (error.code === "42883") {
      return res.status(503).json({ error: "Cancellation setup is incomplete. Apply migrations/002-cancel-booking-release-seats.sql after migration 001." });
    }
    console.error("Booking cancellation failed", error);
    return res.status(500).json({ error: "Unable to cancel this booking request right now" });
  }
};
