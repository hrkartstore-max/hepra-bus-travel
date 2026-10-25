-- HEPRA BUS V7: Razorpay payment order and confirmed ticket lifecycle.
-- Apply after schema.sql and migrations 001 + 002, before enabling payment credentials.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_provider_order_id text,
  ADD COLUMN IF NOT EXISTS payment_provider_payment_id text,
  ADD COLUMN IF NOT EXISTS amount_paise bigint,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS ticket_reference text,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_order_unique
  ON bookings (payment_provider_order_id)
  WHERE payment_provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_id_unique
  ON bookings (payment_provider_payment_id)
  WHERE payment_provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_ticket_reference_unique
  ON bookings (ticket_reference)
  WHERE ticket_reference IS NOT NULL;

ALTER TABLE booking_seat_holds
  ADD COLUMN IF NOT EXISTS hold_status text NOT NULL DEFAULT 'held'
  CHECK (hold_status IN ('held', 'confirmed'));

-- Replace the original hold function so confirmed seats are never expired as temporary holds.
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

  SELECT * INTO v_service
  FROM bus_services
  WHERE id = p_service_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM booking_seat_holds h
  USING bookings b
  WHERE h.booking_id = b.id
    AND ((h.hold_status = 'held' AND h.expires_at <= now())
      OR b.status IN ('cancelled', 'expired'));

  FOREACH v_seat IN ARRAY p_seats LOOP
    IF EXISTS (
      SELECT 1 FROM booking_seat_holds h
      WHERE h.service_id = p_service_id
        AND upper(h.seat_label) = upper(v_seat)
        AND (h.hold_status = 'confirmed' OR (h.hold_status = 'held' AND h.expires_at > now()))
    ) THEN
      RAISE EXCEPTION 'One or more selected seats are no longer available' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  INSERT INTO bookings (service_id, passenger_name, email, phone, seats, status, payment_status)
  VALUES (p_service_id, p_passenger_name, p_email, p_phone, p_seats, 'pending', 'unpaid')
  RETURNING id INTO v_booking_id;

  INSERT INTO booking_seat_holds (service_id, seat_label, booking_id, expires_at, hold_status)
  SELECT p_service_id, upper(s), v_booking_id, v_expiry, 'held'
  FROM unnest(p_seats) AS s;

  RETURN QUERY SELECT v_booking_id, 'pending'::text, 'unpaid'::text, v_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_booking_payment(
  p_order_id text,
  p_payment_id text,
  p_amount_paise bigint,
  p_currency text
)
RETURNS TABLE(booking_id uuid, booking_status text, payment_status text, ticket_reference text, already_confirmed boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_ticket text;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE payment_provider_order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.payment_status = 'paid' AND v_booking.status = 'confirmed' THEN
    IF v_booking.payment_provider_payment_id = p_payment_id THEN
      RETURN QUERY SELECT v_booking.id, v_booking.status, v_booking.payment_status, v_booking.ticket_reference, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Booking already confirmed with a different payment' USING ERRCODE = '23505';
  END IF;

  IF v_booking.status <> 'pending' OR v_booking.payment_status NOT IN ('pending', 'unpaid') THEN
    RAISE EXCEPTION 'Booking is not payable' USING ERRCODE = '22023';
  END IF;
  IF v_booking.amount_paise IS NULL OR v_booking.amount_paise <> p_amount_paise OR upper(v_booking.currency) <> upper(p_currency) THEN
    RAISE EXCEPTION 'Payment amount or currency mismatch' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM booking_seat_holds h
    WHERE h.booking_id = v_booking.id
      AND h.hold_status = 'held'
      AND h.expires_at > now()
  ) OR (SELECT count(*) FROM booking_seat_holds h WHERE h.booking_id = v_booking.id AND h.hold_status = 'held' AND h.expires_at > now()) <> cardinality(v_booking.seats) THEN
    RAISE EXCEPTION 'Seat hold expired; payment needs manual review' USING ERRCODE = '22023';
  END IF;

  v_ticket := 'HB-' || upper(substr(replace(v_booking.id::text, '-', ''), 1, 10));

  UPDATE bookings
  SET status = 'confirmed',
      payment_status = 'paid',
      payment_provider_payment_id = p_payment_id,
      payment_verified_at = now(),
      ticket_reference = v_ticket
  WHERE id = v_booking.id;

  UPDATE booking_seat_holds
  SET hold_status = 'confirmed',
      expires_at = 'infinity'::timestamptz
  WHERE booking_id = v_booking.id;

  RETURN QUERY SELECT v_booking.id, 'confirmed'::text, 'paid'::text, v_ticket, false;
END;
$$;
