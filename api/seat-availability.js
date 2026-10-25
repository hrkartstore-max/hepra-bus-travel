const { getDb } = require("../lib/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId.trim() : "";
  if (!UUID_PATTERN.test(serviceId)) {
    return res.status(400).json({ error: "A valid serviceId is required" });
  }

  try {
    const sql = getDb();
    const service = await sql`
      SELECT id, seats_available
      FROM bus_services
      WHERE id = ${serviceId}::uuid AND active = true
      LIMIT 1
    `;
    if (!service.length) return res.status(404).json({ error: "Service not found or inactive" });

    const occupied = await sql`
      SELECT DISTINCT upper(h.seat_label) AS seat_label
      FROM booking_seat_holds h
      JOIN bookings b ON b.id = h.booking_id
      WHERE h.service_id = ${serviceId}::uuid
        AND (
          h.hold_status = 'confirmed'
          OR (h.hold_status = 'held' AND h.expires_at > now() AND b.status = 'pending')
        )
      ORDER BY upper(h.seat_label)
    `;
    return res.status(200).json({
      serviceId,
      seatsAvailable: Number(service[0].seats_available),
      occupiedSeats: occupied.map(row => row.seat_label),
      checkedAt: new Date().toISOString(),
      note: "Availability is a snapshot; the server revalidates seat holds when a booking is submitted."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    if (error.code === "42P01" || error.code === "42703") {
      return res.status(503).json({ error: "Seat availability is not configured. Apply the seat-hold and payment database migrations first." });
    }
    console.error("Seat availability lookup failed", error);
    return res.status(500).json({ error: "Unable to load seat availability right now" });
  }
};
