const { neon } = require("@neondatabase/serverless");

function getDb() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "DB_NOT_CONFIGURED";
    throw error;
  }
  return neon(process.env.DATABASE_URL);
}

module.exports = { getDb };
