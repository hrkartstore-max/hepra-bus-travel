-- HEPRA BUS demo inventory ONLY.
-- Run this only in a development/demo database after schema.sql.
-- These are fictional sample services and must never be sold as real tickets.
INSERT INTO bus_services
  (operator_name, bus_type, origin, destination, journey_date, departure_time, arrival_time, fare, seats_available, active)
VALUES
  ('DEMO · HEPRA Signature Coach', 'AC Sleeper · 2+1 Berth', 'Chennai', 'Madurai', CURRENT_DATE, '21:30', '05:30', 1299.00, 12, true),
  ('DEMO · Southern Comfort Express', 'AC Seater · Semi Sleeper', 'Chennai', 'Madurai', CURRENT_DATE, '22:15', '06:45', 899.00, 18, true),
  ('DEMO · Heritage Nightliner', 'Non AC Sleeper', 'Chennai', 'Madurai', CURRENT_DATE + 1, '20:45', '05:15', 749.00, 7, true),
  ('DEMO · Cityline Premium', 'AC Seater', 'Chennai', 'Coimbatore', CURRENT_DATE, '23:00', '07:00', 999.00, 21, true),
  ('DEMO · Western Ghats Voyager', 'AC Sleeper', 'Chennai', 'Coimbatore', CURRENT_DATE + 1, '21:00', '06:30', 1199.00, 9, true),
  ('DEMO · Heritage Connector', 'AC Seater', 'Bengaluru', 'Chennai', CURRENT_DATE, '22:00', '05:45', 1099.00, 15, true);
