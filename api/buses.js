const { getDb } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const date = String(req.query.date || "");
  if (!from || !to || from.length > 100 || to.length > 100 || from.toLowerCase() === to.toLowerCase()) {
    return res.status(400).json({ error: "Provide different valid origin and destination cities" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ error: "Provide a valid journey date in YYYY-MM-DD format" });
  }
  try {
    const sql = getDb();
    const buses = await sql`
      SELECT id, operator_name, bus_type, departure_time, arrival_time, fare, seats_available
      FROM bus_services
      WHERE lower(origin) = lower(${from})
        AND lower(destination) = lower(${to})
        AND journey_date = ${date}::date
        AND active = true
      ORDER BY departure_time ASC
      LIMIT 50
    `;
    return res.status(200).json({ buses });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    console.error("Bus search failed", error);
    return res.status(500).json({ error: "Unable to search buses right now" });
  }
};
