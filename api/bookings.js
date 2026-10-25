const { getDb } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = req.body || {};
  const serviceId = String(body.serviceId || "").trim();
  const passengerName = String(body.passengerName || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const seats = Array.isArray(body.seats) ? [...new Set(body.seats.map(String))] : [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serviceId)) {
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
  if (!seats.length || seats.length > 6 || seats.some(s => !/^[A-Z0-9-]{1,8}$/i.test(s))) {
    return res.status(400).json({ error: "Select between 1 and 6 valid seats" });
  }
  try {
    const sql = getDb();
    const service = await sql`SELECT id FROM bus_services WHERE id = ${serviceId} AND active = true LIMIT 1`;
    if (!service.length) return res.status(404).json({ error: "Service not found" });
    const inserted = await sql`
      INSERT INTO bookings (service_id, passenger_name, email, phone, seats, status, payment_status)
      VALUES (${serviceId}::uuid, ${passengerName}, ${email}, ${phone}, ${seats}, 'pending', 'unpaid')
      RETURNING id, status, payment_status, created_at
    `;
    return res.status(201).json({ booking: inserted[0], message: "Pending booking created. No payment was taken and seats are not yet locked." });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    console.error("Booking creation failed", error);
    return res.status(500).json({ error: "Unable to create booking" });
  }
};
