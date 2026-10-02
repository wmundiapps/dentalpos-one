-- Pagamento só integral: o paciente escolhe Pix à vista ou cartão de crédito (valor total no limite do cartão).
alter table charges drop constraint if exists charges_kind_check;
alter table charges add constraint charges_kind_check check (kind in ('integral','avulsa','parcelada','assinatura'));
alter table charges add column if not exists pay_token text unique;
alter table charges add column if not exists max_installments int;
