-- Reserva antecipada parcelada (20/11/2026): reserva com até 18 meses, até 10 parcelas mensais, 7% de desconto.
-- Cada parcela é um pagamento próprio pelo split (o anfitrião recebe direto); o SpaceHour não guarda o dinheiro.
CREATE TABLE IF NOT EXISTS booking_installments (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  seq           INTEGER NOT NULL,
  due_date      DATE NOT NULL,
  amount        NUMERIC(16,4) NOT NULL,
  partner_fees  NUMERIC(16,4) NOT NULL DEFAULT 0,   -- corretor e zelador (só na última)
  host_share    NUMERIC(16,4) NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','paid','void','refunded')),
  payment_id    TEXT,                               -- pagamento atual da parcela (checkout)
  paid_at       TIMESTAMPTZ,
  reminded_at   TIMESTAMPTZ,
  UNIQUE (booking_id, seq)
);
CREATE INDEX IF NOT EXISTS booking_installments_due_idx ON booking_installments (status, due_date);
CREATE INDEX IF NOT EXISTS booking_installments_payment_idx ON booking_installments (payment_id);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS accepts_advance BOOLEAN NOT NULL DEFAULT true;

-- Uma reserva antecipada tem um pagamento por parcela (antes era um por reserva)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_booking_id_key;
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);
