const { getDb } = require("../../lib/db");
const { requireAdmin } = require("../../lib/admin-auth");

module.exports = async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET") { res.setHeader("Allow","GET"); return res.status(405).json({error:"Method not allowed"}); }
  if(!requireAdmin(req,res)) return;
  try {
    const sql=getDb();
    const rows=await sql`SELECT b.id,b.passenger_name,b.email,b.phone,b.seats,b.status,b.payment_status,b.created_at,b.ticket_reference,b.amount_paise,b.currency,s.operator_name,s.origin,s.destination,s.journey_date,s.departure_time FROM bookings b JOIN bus_services s ON s.id=b.service_id ORDER BY b.created_at DESC LIMIT 300`;
    const summary=await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='confirmed')::int AS confirmed, count(*) FILTER (WHERE payment_status='paid')::int AS paid, count(*) FILTER (WHERE status='pending')::int AS pending, COALESCE(sum(amount_paise) FILTER (WHERE payment_status='paid'),0)::bigint AS paid_amount_paise FROM bookings`;
    return res.status(200).json({bookings:rows,summary:summary[0]||{}});
  } catch(error) {
    if(error.code==="DB_NOT_CONFIGURED") return res.status(503).json({error:"Database is not configured"});
    console.error("Admin booking report failed",error);
    return res.status(500).json({error:"Unable to load booking report right now"});
  }
};
