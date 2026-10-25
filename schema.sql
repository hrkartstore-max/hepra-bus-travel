CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bus_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_name text NOT NULL CHECK (length(operator_name) BETWEEN 2 AND 120),
  bus_type text NOT NULL CHECK (length(bus_type) BETWEEN 2 AND 80),
  origin text NOT NULL CHECK (length(origin) BETWEEN 2 AND 100),
  destination text NOT NULL CHECK (length(destination) BETWEEN 2 AND 100),
  journey_date date NOT NULL,
  departure_time time NOT NULL,
  arrival_time time NOT NULL,
  fare numeric(10,2) NOT NULL CHECK (fare >= 0),
  seats_available integer NOT NULL DEFAULT 0 CHECK (seats_available >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lower(origin) <> lower(destination))
);

CREATE INDEX IF NOT EXISTS bus_services_route_date_idx
  ON bus_services (lower(origin), lower(destination), journey_date, active);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES bus_services(id),
  passenger_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  seats text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','expired')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','failed','refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_service_id_idx ON bookings (service_id);
CREATE INDEX IF NOT EXISTS bookings_email_idx ON bookings (lower(email));
-- No sample buses are inserted: add only verified operator inventory.
