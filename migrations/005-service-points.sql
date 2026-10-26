-- HEPRA BUS Phase 2: service-specific pickup/drop inventory.
-- Safe to re-run. Apply after schema.sql and migrations 001-004.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS boarding_point_id uuid,
  ADD COLUMN IF NOT EXISTS drop_point_id uuid;

CREATE TABLE IF NOT EXISTS service_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES bus_services(id) ON DELETE CASCADE,
  point_type text NOT NULL CHECK (point_type IN ('boarding','drop')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  landmark text NOT NULL DEFAULT '' CHECK (length(landmark) <= 240),
  point_time time,
  contact_phone text CHECK (contact_phone IS NULL OR length(contact_phone) <= 24),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_points_service_type_active_idx
  ON service_points (service_id, point_type, active, point_time);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_boarding_point_fk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_boarding_point_fk
      FOREIGN KEY (boarding_point_id) REFERENCES service_points(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_drop_point_fk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_drop_point_fk
      FOREIGN KEY (drop_point_id) REFERENCES service_points(id);
  END IF;
END $$;
