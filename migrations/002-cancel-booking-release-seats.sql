-- HEPRA BUS V6: cancel a pending request and release its temporary seat holds.
-- Apply after migrations/001-seat-holds.sql.
CREATE OR REPLACE FUNCTION cancel_pending_booking_and_release_seats(
  p_booking_id uuid,
  p_email text
)
RETURNS TABLE(booking_status text, released_seats integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id uuid;
  v_status text;
  v_payment_status text;
  v_released integer := 0;
BEGIN
  SELECT b.id, b.status, b.payment_status
    INTO v_booking_id, v_status, v_payment_status
  FROM bookings b
  WHERE b.id = p_booking_id
    AND lower(b.email) = lower(p_email)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending' OR v_payment_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Only unpaid pending booking requests can be cancelled' USING ERRCODE = '22023';
  END IF;

  DELETE FROM booking_seat_holds h
  WHERE h.booking_id = v_booking_id;
  GET DIAGNOSTICS v_released = ROW_COUNT;

  UPDATE bookings b
  SET status = 'cancelled'
  WHERE b.id = v_booking_id;

  RETURN QUERY SELECT 'cancelled'::text, v_released;
END;
$$;
