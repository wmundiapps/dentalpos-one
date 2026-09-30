// Termo de Consentimento Livre e Esclarecido para atendimento odontológico a distância
// (Lei nº 14.510/2022 e Resolução CFO nº 278/2025). Ao mudar o texto, troque TCLE_VERSION:
// os aceites antigos continuam ligados à versão que a pessoa leu.
import { escapeHtml as e, sha256 } from './util.js';
import { company } from './contracts.js';

export const TCLE_KIND = 'tcle_teleodontologia';
export const TCLE_VERSION = 'tcle-2026-09-30-v2';

export function tcleText() {
  const k = company();
  const rt = process.env.PUBLIC_RESPONSAVEL_TECNICO || '';
  const contact = process.env.PUBLIC_CONTACT_EMAIL || 'contato@alignsystem.com.br';
  const title = 'Termo de Consentimento Livre e Esclarecido — Atendimento odontológico a distância (Teleodontologia)';
  const p = (t) => `<p>${t}</p>`;
  const h = (t) => `<h3>${e(t)}</h3>`;
  const body = [
    `<h2>${e(title)}</h2>`,
    p(`Este termo explica como funciona a parte a distância do atendimento da AlignSystem${k.name ? ` (${e(k.name)}${k.cnpj ? `, CNPJ ${e(k.cnpj)}` : ''})` : ''}${rt ? `, sob a responsabilidade técnica de ${e(rt)}` : ''}, conforme a Lei nº 14.510/2022 (Telessaúde) e a Resolução CFO nº 278/2025 (Teleodontologia).`),
    h('1. O que é feito a distância'),
    p('A distância, por meio desta plataforma e de chamada de vídeo, podem ser feitos: a pré-avaliação (teletriagem) a partir das fotos que você envia; a teleorientação, para tirar dúvidas sobre o tratamento com alinhadores e as próximas etapas; e o telemonitoramento durante o tratamento. O exame clínico, a documentação (escaneamento, fotos clínicas e radiografia), a instalação e as consultas de acompanhamento são feitos presencialmente, no consultório do cirurgião-dentista responsável pelo seu caso.'),
    h('2. Limitações'),
    p('O atendimento a distância não permite exame físico completo. Por isso, o parecer dado a partir das fotos é apenas orientativo: ele não é diagnóstico definitivo nem garante que o tratamento com alinhadores seja indicado para você. A indicação só é confirmada após exame clínico e documentação presenciais. O cirurgião-dentista pode, sempre que julgar necessário, pedir que você compareça ao consultório. A qualidade das fotos e da conexão de internet pode limitar a avaliação.'),
    h('3. Seus direitos'),
    p('Você pode recusar o atendimento a distância, interrompê-lo a qualquer momento e optar pelo atendimento presencial, sem nenhum prejuízo ao seu atendimento. Você pode pedir cópia deste termo e das informações registradas sobre você.'),
    h('4. Fotos, dados e sigilo'),
    p('As fotos do rosto e do sorriso e as informações de saúde que você envia são dados pessoais sensíveis (art. 11 da Lei nº 13.709/2018 — LGPD). Elas são usadas somente para a sua avaliação e o seu tratamento, ficam guardadas em ambiente protegido, fazem parte do seu prontuário e só são acessadas pela equipe AlignSystem e pelo cirurgião-dentista responsável pelo seu caso, que mantêm sigilo profissional. As fotos não são usadas em divulgação sem uma autorização específica sua, por escrito. Os registros são mantidos pelo prazo exigido pelas normas de guarda de prontuário. Para exercer seus direitos previstos na LGPD, escreva para ' + e(contact) + '.'),
    h('5. Chamadas de vídeo (teleconferências)'),
    p('As teleorientações são feitas por um serviço de chamada de vídeo aberto pelo navegador, em sala criada só para o seu atendimento. <b>As teleconferências não são gravadas, nem em vídeo nem em áudio, pela AlignSystem ou pelo cirurgião-dentista, e por isso não podem ser recuperadas depois de encerradas.</b> O que for relevante para o seu tratamento é anotado pelo profissional no seu prontuário. Recomendamos que você participe de um local reservado. Se a conexão falhar, o atendimento pode ser remarcado.'),
    h('6. Quem pode aceitar este termo'),
    p('<b>Este termo só pode ser aceito por pessoa maior de 18 anos.</b> Se o paciente tiver menos de 18 anos, o aceite deve ser feito pelo pai, pela mãe ou pelo responsável legal, que acompanha o atendimento. Quem aceita informa o nome completo e a data de nascimento e declara ser maior de idade.'),
    h('7. Registro do aceite'),
    p('Ao marcar a caixa "Li e aceito", você declara que é maior de 18 anos, que leu este termo, entendeu as informações e concorda com o atendimento a distância nas condições descritas. O aceite é registrado com seu nome, sua data de nascimento, data e hora, endereço IP, navegador e o código de integridade deste texto, e pode ser revogado a qualquer momento pelos canais de atendimento, sem afetar o que foi feito antes da revogação.'),
  ].join('\n');
  return { version: TCLE_VERSION, kind: TCLE_KIND, title, body, hash: sha256(body) };
}

// Garante que a versão atual do texto esteja gravada no banco (texto imutável por versão).
export async function ensureTcle(sql) {
  const t = tcleText();
  const [row] = await sql`select version, body, body_hash from consent_texts where version = ${t.version}`;
  if (row) return { ...t, body: row.body, hash: row.body_hash };
  await sql`insert into consent_texts (version, kind, title, body, body_hash)
            values (${t.version}, ${t.kind}, ${t.title}, ${t.body}, ${t.hash}) on conflict (version) do nothing`;
  return t;
}

export async function currentConsent(sql, caseId) {
  const [c] = await sql`select id, version, accepted_name, accepted_by_guardian, guardian_name, accepted_birth_date, accepted_at
    from consents where case_id = ${caseId} and kind = ${TCLE_KIND} and version = ${TCLE_VERSION}
    order by accepted_at desc limit 1`;
  return c || null;
}
