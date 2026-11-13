-- Segurança: verificação em duas etapas (TOTP), revisão das fotos do paciente antes do dentista e bloqueio de caso.
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled_at timestamptz;
alter table users add column if not exists totp_recovery jsonb;
alter table users add column if not exists totp_last_step bigint;
alter table photos add column if not exists reviewed_at timestamptz;
alter table photos add column if not exists reviewed_by uuid references users(id) on delete set null;
-- fotos já existentes continuam visíveis para os dentistas
update photos set reviewed_at = created_at where reviewed_at is null;
alter table cases add column if not exists blocked_at timestamptz;
alter table cases add column if not exists blocked_reason text;
