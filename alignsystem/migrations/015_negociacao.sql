-- Negociação on-line (inspirada no SimulaClinic): o dentista consente e configura os limites (dentro do teto da AlignSystem),
-- abre a negociação no caso e o paciente fecha o tratamento ou faz contraproposta.
alter table dentists add column if not exists negotiation jsonb;
alter table cases add column if not exists negotiation jsonb;
-- juros mensais do saldo em boletos acima de 18 parcelas (definido no momento da cobrança)
alter table charges add column if not exists interest_pct numeric(6,3);
