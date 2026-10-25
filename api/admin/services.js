const { getDb } = require("../../lib/db");
const { requireAdmin } = require("../../lib/admin-auth");

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d;
}
function validTime(value) { return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value); }
function parseService(body) {
  const s = body && typeof body === "object" ? body : {};
  const operator_name=text(s.operator_name,120), bus_type=text(s.bus_type,80);
  const origin=text(s.origin,100), destination=text(s.destination,100);
  const journey_date=s.journey_date, departure_time=s.departure_time, arrival_time=s.arrival_time;
  const fare=Number(s.fare), seats_available=Number(s.seats_available);
  if(operator_name.length<2 || bus_type.length<2 || origin.length<2 || destination.length<2 || origin.toLowerCase()===destination.toLowerCase() ||
     !validDate(journey_date) || !validTime(departure_time) || !validTime(arrival_time) ||
     !Number.isFinite(fare) || fare<0 || fare>1000000 || !Number.isInteger(seats_available) || seats_available<0 || seats_available>1000) return null;
  return {operator_name,bus_type,origin,destination,journey_date,departure_time,arrival_time,fare,seats_available};
}

module.exports = async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if (!["GET","POST","PATCH"].includes(req.method)) {
    res.setHeader("Allow","GET, POST, PATCH");
    return res.status(405).json({error:"Method not allowed"});
  }
  if(!requireAdmin(req,res)) return;
  try {
    const sql=getDb();
    if(req.method==="GET") {
      const rows=await sql`SELECT id,operator_name,bus_type,origin,destination,journey_date,departure_time,arrival_time,fare,seats_available,active,created_at FROM bus_services ORDER BY journey_date DESC,departure_time ASC LIMIT 300`;
      return res.status(200).json({services:rows});
    }
    if(req.method==="POST") {
      const s=parseService(req.body);
      if(!s) return res.status(400).json({error:"Check operator, bus type, different cities, journey date/time, fare and seat count."});
      const rows=await sql`INSERT INTO bus_services (operator_name,bus_type,origin,destination,journey_date,departure_time,arrival_time,fare,seats_available,active) VALUES (${s.operator_name},${s.bus_type},${s.origin},${s.destination},${s.journey_date}::date,${s.departure_time}::time,${s.arrival_time}::time,${s.fare},${s.seats_available},true) RETURNING id,operator_name,bus_type,origin,destination,journey_date,departure_time,arrival_time,fare,seats_available,active,created_at`;
      return res.status(201).json({service:rows[0]});
    }
    const id=typeof req.body?.id==="string"?req.body.id:"";
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({error:"Valid service ID is required"});
    if(typeof req.body?.active!=="boolean") return res.status(400).json({error:"Active must be true or false"});
    const rows=await sql`UPDATE bus_services SET active=${req.body.active} WHERE id=${id}::uuid RETURNING id,active`;
    if(!rows.length) return res.status(404).json({error:"Service not found"});
    return res.status(200).json({service:rows[0]});
  } catch(error) {
    if(error.code==="DB_NOT_CONFIGURED") return res.status(503).json({error:"Database is not configured"});
    console.error("Admin service operation failed",error);
    return res.status(500).json({error:"Unable to manage services right now"});
  }
};
