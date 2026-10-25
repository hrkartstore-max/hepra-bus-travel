-- HEPRA BUS V5: transactional temporary seat holds.
-- Apply once to the same Neon database used by Vercel before using the new API.
CREATE TABLE IF NOT EXISTS booking_seat_holds (
  service_id uuid NOT NULL REFERENCES bus_services(id) ON DELETE CASCADE,
  seat_label text NOT NULL CHECK (length(seat_label) BETWEEN 1 AND 8),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, seat_label)
);

CREATE INDEX IF NOT EXISTS booking_seat_holds_booking_idx
  ON booking_seat_holds (booking_id);
CREATE INDEX IF NOT EXISTS booking_seat_holds_expiry_idx
  ON booking_seat_holds (expires_at);

CREATE OR REPLACE FUNCTION create_booking_with_seat_holds(
  p_service_id uuid,
  p_passenger_name text,
  p_email text,
  p_phone text,
  p_seats text[]
)
RETURNS TABLE(booking_id uuid, booking_status text, payment_status text, hold_expires_at timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_service bus_services%ROWTYPE;
  v_booking_id uuid;
  v_expiry timestamptz := now() + interval '10 minutes';
  v_seat text;
BEGIN
  IF p_seats IS NULL OR cardinality(p_seats) < 1 OR cardinality(p_seats) > 6 THEN
    RAISE EXCEPTION 'Select between 1 and 6 seats' USING ERRCODE = '22023';
  END IF;

  -- Serialize seat claims for one service so two requests cannot both win.
  SELECT * INTO v_service
  FROM bus_services
  WHERE id = p_service_id AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;

  -- Remove expired holds and holds attached to cancelled/expired requests.
  DELETE FROM booking_seat_holds h
  USING bookings b
  WHERE h.booking_id = b.id
    AND (h.expires_at <= now() OR b.status IN ('cancelled', 'expired'));

  FOREACH v_seat IN ARRAY p_seats LOOP
    IF EXISTS (
      SELECT 1 FROM booking_seat_holds h
      WHERE h.service_id = p_service_id
        AND upper(h.seat_label) = upper(v_seat)
        AND h.expires_at > now()
    ) THEN
      RAISE EXCEPTION 'One or more selected seats are no longer available' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  INSERT INTO bookings (service_id, passenger_name, email, phone, seats, status, payment_status)
  VALUES (p_service_id, p_passenger_name, p_email, p_phone, p_seats, 'pending', 'unpaid')
  RETURNING id INTO v_booking_id;

  INSERT INTO booking_seat_holds (service_id, seat_label, booking_id, expires_at)
  SELECT p_service_id, upper(s), v_booking_id, v_expiry
  FROM unnest(p_seats) AS s;

  RETURN QUERY SELECT v_booking_id, 'pending'::text, 'unpaid'::text, v_expiry;
END;
$$;
