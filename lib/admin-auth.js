const crypto = require("node:crypto");

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  const expected = process.env.ADMIN_SECRET;
  const header = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || expected.length < 32 || !safeEqual(supplied, expected)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({ error: "Admin authentication required" });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
