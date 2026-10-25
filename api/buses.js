const { getDb } = require("../lib/db");

const CITY_MAX = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function queryString(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const from = queryString(req.query.from);
  const to = queryString(req.query.to);
  const date = queryString(req.query.date);

  if (!from || !to || from.length > CITY_MAX || to.length > CITY_MAX) {
    return res.status(400).json({ error: "Provide valid origin and destination cities (up to 100 characters)" });
  }
  if (from.toLocaleLowerCase("en-IN") === to.toLocaleLowerCase("en-IN")) {
    return res.status(400).json({ error: "Origin and destination must be different" });
  }
  if (!isRealDate(date)) {
    return res.status(400).json({ error: "Provide a real journey date in YYYY-MM-DD format" });
  }

  try {
    const sql = getDb();
    const buses = await sql`
      SELECT id, operator_name, bus_type, origin, destination,
             journey_date, departure_time, arrival_time, fare, seats_available
      FROM bus_services
      WHERE lower(origin) = lower(${from})
        AND lower(destination) = lower(${to})
        AND journey_date = ${date}::date
        AND active = true
      ORDER BY departure_time ASC
      LIMIT 50
    `;
    return res.status(200).json({ buses, count: buses.length });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured yet. Set DATABASE_URL in Vercel." });
    }
    console.error("Bus search failed", error);
    return res.status(500).json({ error: "Unable to search buses right now" });
  }
};
