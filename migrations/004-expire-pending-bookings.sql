-- HEPRA BUS V8: safe cleanup for expired temporary seat holds.
-- Apply after schema.sql and migrations 001, 002 and 003.

CREATE OR REPLACE FUNCTION expire_pending_booking_holds()
RETURNS TABLE(released_holds integer, expired_bookings integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_released integer := 0;
  v_expired integer := 0;
  v_booking record;
BEGIN
  -- Mark abandoned pending requests expired while holding each booking row lock.
  FOR v_booking IN
    SELECT b.id
    FROM bookings b
    WHERE b.status = 'pending'
      AND b.payment_status IN ('unpaid', 'pending')
      AND b.created_at <= now() - interval '10 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM booking_seat_holds h
        WHERE h.booking_id = b.id
          AND h.hold_status = 'held'
          AND h.expires_at > now()
      )
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    UPDATE bookings SET status = 'expired' WHERE id = v_booking.id AND status = 'pending';
    IF FOUND THEN
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  DELETE FROM booking_seat_holds
  WHERE hold_status = 'held'
    AND expires_at <= now();
  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- Also clean up holds left behind by already cancelled/expired requests.
  DELETE FROM booking_seat_holds h
  USING bookings b
  WHERE h.booking_id = b.id
    AND b.status IN ('cancelled', 'expired');

  RETURN QUERY SELECT v_released, v_expired;
END;
$$;
