-- Modelo único: Pix com desconto, cartão em até 18x ou boleto (entrada de 50% + saldo em boletos).
alter table charges add column if not exists pay_option text;
alter table charges add column if not exists entry_method text;
alter table charges add column if not exists boleto_enabled boolean not null default true;
alter table charges add column if not exists boleto_max int;
alter table charges add column if not exists rest_payment_id text;
alter table charges add column if not exists rest_installment_id text;
alter table payments add column if not exists installment_id text;
