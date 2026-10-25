const crypto = require("crypto");
const { getDb } = require("../../lib/db");

function authorized(req, secret) {
  const header = req.headers.authorization || "";
  const expected = Buffer.from("Bearer " + secret);
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "Scheduled maintenance is not configured" });
  }
  if (!authorized(req, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sql = getDb();
    const result = await sql`SELECT * FROM expire_pending_booking_holds()`;
    const row = result[0] || {};
    return res.status(200).json({
      ok: true,
      releasedHolds: Number(row.released_holds || 0),
      expiredBookings: Number(row.expired_bookings || 0),
      ranAt: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Database is not configured" });
    }
    if (error.code === "42P01" || error.code === "42883") {
      return res.status(503).json({ error: "Apply migrations/004-expire-pending-bookings.sql before running maintenance" });
    }
    console.error("Booking expiry maintenance failed", error);
    return res.status(500).json({ error: "Unable to run booking expiry maintenance" });
  }
};
