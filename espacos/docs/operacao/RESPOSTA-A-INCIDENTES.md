# Roteiro de resposta a incidentes de segurança (LGPD)

**Controlador:** Instituto Ravel de Ensino Superior Ltda. — CNPJ 03.162.275/0001-10
**Encarregado (DPO):** Robson Ravel de Oliveira — info@wmundi.com
**Base legal:** LGPD, arts. 46 a 49; Resolução CD/ANPD nº 15/2024 (comunicação de incidente de segurança).

> Documento interno. Não substitui orientação jurídica no momento do incidente.

## Prazos que importam

| O quê | Prazo |
|---|---|
| Comunicar a ANPD (se houver risco ou dano relevante aos titulares) | **3 dias úteis** a partir do conhecimento de que o incidente afetou dados pessoais |
| Comunicar os titulares afetados | **3 dias úteis**, pelo mesmo critério |
| Complementar a comunicação à ANPD, se faltar informação | até **20 dias úteis** após a comunicação inicial |
| Guardar o registro do incidente (mesmo sem comunicação) | no mínimo **5 anos** |

**Risco ou dano relevante** = pode afetar significativamente interesses e direitos dos titulares **e** envolve ao menos um destes: dados sensíveis; dados de crianças, adolescentes ou idosos; dados financeiros; dados de autenticação (senhas); dados protegidos por sigilo legal ou profissional; ou grande volume de titulares.
Na SpaceHour, vazamento de **documentos de registro profissional**, **senhas** ou dados de **pagamento** deve ser tratado como relevante.

## Passo a passo

### 1. Primeira hora — conter
- [ ] Quem detectou avisa o encarregado (info@wmundi.com) e o responsável técnico **imediatamente**.
- [ ] Anotar data e hora em que se soube do incidente (o prazo conta daí).
- [ ] Conter sem apagar evidências: revogar chaves e tokens expostos, trocar senhas de acesso, bloquear o acesso indevido, tirar do ar o que estiver vazando.
- [ ] **Não** apagar logs nem desligar servidores antes de copiar os registros.

### 2. Até 24 horas — entender
- [ ] Quais dados foram afetados? Usar a trilha de acesso aos documentos (`/api/admin/verifications/:id/access-log` e tabela `document_access_log`) e os logs de hospedagem e banco.
- [ ] Quantos titulares? De quais países? (Titulares da UE → RGPD: 72 horas para a autoridade.)
- [ ] Os documentos vazados estavam cifrados? (Arquivos de registro profissional são cifrados com AES-256; se a chave `DOCUMENT_ENCRYPTION_KEY` **não** vazou, o risco é bem menor, e isso deve constar na avaliação.)
- [ ] O incidente continua ativo?

### 3. Até 2 dias úteis — decidir
- [ ] Avaliar se há risco ou dano relevante (critérios acima).
- [ ] Se houver: preparar a comunicação à ANPD e aos titulares.
- [ ] Se não houver: registrar a justificativa por escrito (vai para o registro do incidente).
- [ ] Se a chave de criptografia puder ter vazado: gerar nova chave e recifrar os documentos.

### 4. Até 3 dias úteis — comunicar
**À ANPD:** formulário de comunicação de incidente no site da ANPD (gov.br/anpd), com:
- descrição e natureza dos dados afetados;
- titulares envolvidos (quantidade e categorias);
- medidas técnicas e de segurança que já existiam (TLS, senhas com hash, documentos cifrados, pagamento fora da plataforma, registro de acessos, eliminação após 90 dias);
- riscos para os titulares;
- motivo de eventual atraso;
- medidas adotadas para reverter ou reduzir os efeitos;
- data do incidente e data do conhecimento;
- dados do encarregado.

**Aos titulares:** e-mail individual (e aviso no app, se forem muitos), em linguagem simples, com:
- o que aconteceu e quais dados foram afetados;
- riscos e o que a pessoa pode fazer (ex.: trocar a senha, ficar atenta a golpes que usem o número do registro);
- o que a SpaceHour já fez;
- contato do encarregado: info@wmundi.com.

### 5. Depois — registrar e corrigir
- [ ] Registro do incidente: o que aconteceu, quando se soube, dados e titulares afetados, avaliação de risco, comunicações feitas e medidas adotadas (guardar por 5 anos).
- [ ] Corrigir a causa e revisar este roteiro.
- [ ] Se houver seguro de riscos cibernéticos, acionar a seguradora (em geral o aviso deve ser imediato).

## Contatos

| Quem | Contato |
|---|---|
| Encarregado (DPO) | Robson Ravel de Oliveira — info@wmundi.com |
| Suporte ao usuário | support@space-hour.com |
| ANPD | gov.br/anpd — comunicação de incidente de segurança |
| Hospedagem (Vercel), banco de dados, Mercado Pago, Anthropic | pelos painéis e canais de suporte de cada fornecedor |
