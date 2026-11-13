-- O aceite do termo só vale se feito por maior de 18 anos: guarda a data de nascimento de quem aceitou.
alter table consents add column if not exists accepted_birth_date date;
