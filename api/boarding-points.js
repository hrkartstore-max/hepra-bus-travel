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
  if (!UUID_PATTERN.test(serviceId)) return res.status(400).json({ error: "A valid serviceId is required" });

  try {
    const sql = getDb();
    const service = await sql`SELECT id FROM bus_services WHERE id = ${serviceId}::uuid AND active = true LIMIT 1`;
    if (!service.length) return res.status(404).json({ error: "Service not found or inactive" });
    const points = await sql`
      SELECT id, point_type, name, landmark, to_char(point_time, 'HH24:MI') AS time, contact_phone
      FROM service_points
      WHERE service_id = ${serviceId}::uuid AND active = true
      ORDER BY point_time NULLS LAST, name
    `;
    return res.status(200).json({
      serviceId,
      boarding: points.filter(point => point.point_type === "boarding"),
      drop: points.filter(point => point.point_type === "drop"),
      demo: false,
      note: points.length ? null : "No verified pickup/drop points have been added for this service yet."
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") return res.status(503).json({ error: "Database is not configured" });
    if (error.code === "42P01" || error.code === "42703") return res.status(503).json({ error: "Pickup/drop inventory is not configured. Apply migrations/005-service-points.sql first." });
    console.error("Service points lookup failed", error);
    return res.status(500).json({ error: "Unable to load pickup/drop points right now" });
  }
};
