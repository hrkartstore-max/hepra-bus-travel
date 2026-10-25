const { getDb } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return res.status(200).json({ ok: true, database: "connected" });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ ok: false, error: "Database is not configured" });
    }
    console.error("Health check failed", error);
    return res.status(503).json({ ok: false, error: "Database unavailable" });
  }
};
