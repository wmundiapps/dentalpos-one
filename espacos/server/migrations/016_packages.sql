-- Pacote recorrente: desconto opcional do anfitrião e aviso de renovação
ALTER TABLE listings ADD COLUMN package_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN renewal_reminded_at TIMESTAMPTZ;
