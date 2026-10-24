// Kit da clínica: modelos de documentos, cartões digitais e lembretes em HTML.
// Tudo sai com a identidade da clínica (nome, logo, cor) e vira PNG/PDF no exportador.
import QRCode from "qrcode";

export interface KitClinic {
  name: string; tagline: string; logo: string; color: string;
  rtName: string; rtCro: string; cnpj: string;
  phone: string; whatsapp: string; email: string;
  address: string; city: string; site: string; instagram: string;
}
export interface KitPerson { key: string; name: string; role: string; cro: string; phone: string; email: string }

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const pad = (n: number) => String(n).padStart(2, "0");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const pd = (s: string) => { if (!s) return null; const [y, m, d] = s.slice(0, 10).split("-").map(Number); return y ? new Date(y, m - 1, d) : null; };
export const dLong = (s: string) => { const d = pd(s); return d ? `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : ""; };
export const dShort = (s: string) => { const d = pd(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ""; };
const dWeek = (s: string) => { const d = pd(s); return d ? DIAS[d.getDay()] : ""; };
export const slug = (s: string) => String(s || "arquivo").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "arquivo";
const first = (s: string) => String(s || "").trim().split(/\s+/)[0] || "";
const noAccent = (s: string) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ---------- QR ---------- */
const qrCache = new Map<string, string>();
export async function qrData(text: string): Promise<string> {
  if (!text) return "";
  const hit = qrCache.get(text); if (hit) return hit;
  try { const url = await QRCode.toDataURL(text, { margin: 0, width: 360, errorCorrectionLevel: "M" }); qrCache.set(text, url); return url; } catch { return ""; }
}
export function vcard(p: KitPerson, c: KitClinic) {
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${p.name}`, `N:${p.name};;;;`, `ORG:${c.name}`, `TITLE:${p.role}${p.cro ? " - " + p.cro : ""}`,
    p.phone ? `TEL;TYPE=CELL:${p.phone}` : "", p.email ? `EMAIL:${p.email}` : "", c.address ? `ADR;TYPE=WORK:;;${c.address};${c.city};;;` : "", c.site ? `URL:${c.site}` : "", "END:VCARD"].filter(Boolean).join("\n");
}
export const waLink = (n: string) => { const d = String(n || "").replace(/\D/g, ""); return d ? "https://wa.me/" + (d.length <= 11 ? "55" + d : d) : ""; };

/* ---------- logo ---------- */
function initials(n: string) { return String(n || "?").replace(/^(dra?\.|cl[ií]nica|odontol[oó]gica)\s*/gi, "").split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "C"; }
export function logoHTML(c: KitClinic, size: number) {
  return c.logo ? `<img src="${esc(c.logo)}" alt="" crossorigin="anonymous">` : `<div class="mono" style="width:${size}px;height:${size}px;background:${esc(c.color)};font-size:${Math.round(size * .36)}px">${esc(initials(c.name))}</div>`;
}

/* ---------- textos padrão (modelos; texto legal passa pela revisão jurídica) ---------- */
export const DEFAULT_TEXTS = {
  contrato: `# Das partes
CONTRATADA: {clinica}, inscrita no CNPJ {cnpj}, com sede em {endereco}, neste ato representada por {responsavel}, {cro_resp}.
CONTRATANTE: {paciente}, CPF {cpf}.

# Cláusula 1 – Do objeto
O presente contrato tem por objeto a prestação de serviços odontológicos referentes a: {tratamento}, conforme plano de tratamento apresentado e aprovado pelo(a) CONTRATANTE, que integra este instrumento.

# Cláusula 2 – Do valor e da forma de pagamento
Pelos serviços, o(a) CONTRATANTE pagará o valor total de {valor}, na seguinte condição: {pagamento}.
O atraso no pagamento implicará multa de 2% e juros de 1% ao mês sobre o valor em aberto.

# Cláusula 3 – Das obrigações da CONTRATADA
- Executar o tratamento com técnica e materiais adequados, observando o Código de Ética Odontológica.
- Informar riscos, alternativas, prognóstico e cuidados de cada etapa.
- Manter prontuário completo e guardar sigilo profissional.

# Cláusula 4 – Das obrigações do(a) CONTRATANTE
- Comparecer às consultas nos horários agendados e seguir as orientações pós-operatórias e de higiene.
- Informar alterações de saúde, medicações em uso e alergias.
- Avisar com no mínimo 24 horas de antecedência sobre a necessidade de remarcação.

# Cláusula 5 – Da garantia
Os trabalhos protéticos e restauradores têm garantia condicionada ao comparecimento às consultas de manutenção e ao cumprimento das orientações. Não estão cobertos danos por trauma, mau uso ou falta de higiene.

# Cláusula 6 – Da proteção de dados (LGPD)
O(a) CONTRATANTE autoriza o tratamento de seus dados pessoais e dados de saúde exclusivamente para a execução deste contrato, a guarda do prontuário e o envio de avisos de agendamento, nos termos da Lei 13.709/2018.

# Cláusula 7 – Da rescisão
Este contrato pode ser rescindido por qualquer das partes mediante comunicação por escrito. Os serviços já executados serão cobrados proporcionalmente.

# Cláusula 8 – Do foro
Fica eleito o foro da comarca de {cidade} para dirimir quaisquer dúvidas oriundas deste contrato.

E, por estarem de acordo, as partes assinam o presente em duas vias de igual teor.`,
  manual: `# 1. Objetivo
Estabelecer as medidas de biossegurança adotadas por {clinica} para proteger pacientes, profissionais e equipe, em conformidade com a NR 32, a RDC Anvisa 15/2012 (processamento de produtos para saúde) e a RDC Anvisa 222/2018 (resíduos de serviços de saúde).

# 2. Aplicação
Todos os cirurgiões-dentistas, auxiliares (ASB), técnicos (TSB), recepção e equipe de limpeza.

# 3. Precauções padrão
- Considerar todo paciente como potencialmente infectado.
- Higienizar as mãos antes e depois de cada atendimento e após retirar as luvas.
- Manter esquema vacinal atualizado (hepatite B com anti-HBs, tétano, influenza e demais previstas).

# 4. Equipamentos de proteção individual (EPI)
- Gorro, óculos de proteção ou protetor facial, máscara cirúrgica ou PFF2/N95 em procedimentos com aerossol, avental de manga longa e luvas.
- Paramentação: avental, gorro, máscara, óculos, luvas. Desparamentação: luvas, avental, óculos, gorro, máscara, sempre com higiene das mãos.

# 5. Limpeza e desinfecção do ambiente
- Entre atendimentos: superfícies de toque (cadeira, refletor, bandeja, comandos) com desinfetante de nível intermediário, ex.: álcool 70% ou quaternário de amônio.
- Barreiras descartáveis (filme PVC) trocadas a cada paciente.
- Ao fim do turno: limpeza terminal do piso e das superfícies.
- Linhas d'água: descarga de 30 segundos entre pacientes.

# 6. Processamento de artigos
- Pré-limpeza no expurgo, limpeza manual ou ultrassônica, enxágue e secagem.
- Inspeção com lupa, embalagem em grau cirúrgico identificada com data e responsável.
- Esterilização em autoclave com registro de cada ciclo, teste biológico semanal e indicador químico em cada pacote.

# 7. Resíduos (PGRSS)
- Grupo A (infectantes): saco branco leitoso.
- Grupo B (químicos, ex.: amálgama, reveladores): recipiente próprio identificado.
- Grupo D (comum): saco preto ou conforme coleta municipal.
- Grupo E (perfurocortantes): caixa rígida, preenchida até 2/3 da capacidade.

# 8. Acidente com material biológico
- Lavar o local com água e sabão; não espremer.
- Comunicar o responsável técnico imediatamente e procurar atendimento em até 2 horas para avaliação de profilaxia.
- Emitir CAT quando aplicável e registrar a ocorrência.

# 9. Revisão
Este manual deve ser revisado anualmente ou quando houver mudança de norma ou de processo.`,
  it: `# Objetivo
Padronizar a esterilização dos instrumentais em autoclave.

# Materiais
- Autoclave, embalagens de grau cirúrgico, seladora, indicadores químicos classe 5 e indicador biológico.

# Execução
1. Conferir se os pacotes estão secos, selados e identificados (data, conteúdo e responsável).
2. Inserir um indicador químico dentro de cada pacote.
3. Distribuir os pacotes na câmara sem encostar nas paredes, com a face de papel voltada para o mesmo lado.
4. Selecionar o ciclo indicado pelo fabricante e iniciar.
5. Ao término, aguardar a secagem completa antes de retirar os pacotes.
6. Conferir a viragem do indicador químico. Pacote sem viragem volta para reprocessamento.
7. Registrar o ciclo no livro de controle (data, número do ciclo, carga, responsável).
8. Armazenar em local limpo, seco e fechado.

# Frequência
- Teste biológico: semanal e após cada manutenção.

# Não conformidades
Ciclo interrompido, pacote úmido ou rasgado: reprocessar e registrar.`,
  pop: `# Objetivo
Garantir a limpeza e a desinfecção do consultório entre um atendimento e outro.

# Responsável
Auxiliar em saúde bucal (ASB) do consultório.

# Materiais
- Luvas de borracha, pano descartável, álcool 70% ou desinfetante padronizado, filme PVC.

# Procedimento
1. Ao fim do atendimento, descartar perfurocortantes na caixa própria e os demais resíduos no saco correspondente.
2. Encaminhar os instrumentais ao expurgo em recipiente fechado.
3. Remover as barreiras de PVC.
4. Aplicar desinfetante nas superfícies, no sentido da área mais limpa para a mais suja: refletor, braço, bandeja, comandos, cadeira, mocho.
5. Acionar as linhas d'água por 30 segundos.
6. Higienizar as mãos e aplicar novas barreiras.
7. Montar a bandeja do próximo paciente.

# Registro
Anotar no checklist diário o horário da desinfecção e as iniciais do responsável.`,
};

/* ---------- documentos ---------- */
export type DocType = "atestado" | "receita" | "contrato" | "manual" | "it" | "pop";
export const DOC_LABELS: Record<DocType, string> = { atestado: "Atestado", receita: "Receituário", contrato: "Contrato", manual: "Manual de biossegurança", it: "IT – Instrução de trabalho", pop: "POP – Procedimento operacional padrão" };
export interface ControlledDoc { titulo: string; codigo: string; rev: string; elab: string; aprov: string; texto: string }
export interface DocInput {
  paciente: string; cpf: string; data: string; prof: KitPerson | null;
  atestado: { tipo: "afastamento" | "comparecimento"; dataAt: string; h1: string; h2: string; dias: string; cid: string; cidOk: boolean };
  receita: { uso: string; itens: string };
  contrato: { tratamento: string; valor: string; pagamento: string; texto: string };
  manual: ControlledDoc; it: ControlledDoc; pop: ControlledDoc;
}

function fill(t: string, c: KitClinic, d: DocInput) {
  const map: Record<string, string> = {
    clinica: c.name, cnpj: c.cnpj, endereco: [c.address, c.city].filter(Boolean).join(", "), responsavel: c.rtName, cro_resp: c.rtCro, cidade: c.city,
    paciente: d.paciente, cpf: d.cpf, data: dLong(d.data), tratamento: d.contrato.tratamento, valor: d.contrato.valor, pagamento: d.contrato.pagamento, profissional: d.prof?.name || "",
  };
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in map ? esc(map[k]) : m));
}
function md(t: string, c: KitClinic, d: DocInput) {
  let h = ""; let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { h += `</${list}>`; list = null; } };
  const f = (s: string) => fill(esc(s), c, d);
  for (const raw of String(t).split("\n")) {
    const l = raw.trim(); let m: RegExpMatchArray | null;
    if (!l) { close(); continue; }
    if ((m = l.match(/^##\s+(.*)/))) { close(); h += `<h4>${f(m[1])}</h4>`; continue; }
    if ((m = l.match(/^#\s+(.*)/))) { close(); h += `<h3>${f(m[1])}</h3>`; continue; }
    if ((m = l.match(/^[-•]\s+(.*)/))) { if (list !== "ul") { close(); h += "<ul>"; list = "ul"; } h += `<li>${f(m[1])}</li>`; continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); h += "<ol>"; list = "ol"; } h += `<li>${f(m[1])}</li>`; continue; }
    close(); h += `<p>${f(l)}</p>`;
  }
  close(); return h;
}
export function letterhead(c: KitClinic) {
  const l2 = [c.rtName, c.rtCro, c.cnpj ? "CNPJ " + c.cnpj : ""].filter(Boolean).map(esc).join(" · ");
  const l3 = [c.address, c.city].filter(Boolean).map(esc).join(" · ");
  const l4 = [c.phone, c.whatsapp ? "WhatsApp " + c.whatsapp : "", c.email].filter(Boolean).map(esc).join(" · ");
  return `<div class="dh"><div class="lg">${logoHTML(c, 72)}</div><div class="who"><b>${esc(c.name)}</b>${l2 ? `<span>${l2}</span>` : ""}${l3 ? `<span>${l3}</span>` : ""}${l4 ? `<span>${l4}</span>` : ""}</div></div>`;
}
const footer = (c: KitClinic) => `<div class="df">${[c.name, c.address, c.city, c.phone, c.site].filter(Boolean).map(esc).join(" · ")}</div>`;
function sig(p: { name?: string; role?: string; cro?: string } | null) { p = p || {}; return `<div class="sig"><div class="ln"></div><b>${esc(p.name || "")}</b>${p.role ? `<span>${esc(p.role)}</span>` : ""}${p.cro ? `<span class="cro">${esc(p.cro)}</span>` : ""}</div>`; }
function extenso(n: string) { const u = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte"]; const x = Number(n); return x >= 0 && x <= 20 ? u[x] : x === 30 ? "trinta" : String(n); }

export function docHTML(type: DocType, c: KitClinic, d: DocInput) {
  const city = (c.city || "").split(/[–-]/)[0].trim();
  const place = `<p class="place">${esc(city)}${city ? ", " : ""}${dLong(d.data)}.</p>`;
  const pac = `<b>${esc(d.paciente)}</b>${d.cpf ? `, CPF ${esc(d.cpf)}` : ""}`;
  let title = ""; let body = "";
  if (type === "atestado") {
    const a = d.atestado; title = "Atestado";
    const t = a.tipo === "comparecimento"
      ? `Atesto, para os devidos fins, que ${pac}, compareceu a atendimento odontológico neste consultório no dia ${dLong(a.dataAt)}, no período das ${esc(a.h1)} às ${esc(a.h2)}.`
      : `Atesto, para os devidos fins, que ${pac}, esteve sob meus cuidados profissionais no dia ${dLong(a.dataAt)}, no período das ${esc(a.h1)} às ${esc(a.h2)}, devendo permanecer afastado(a) de suas atividades por <b>${esc(a.dias)} (${esc(extenso(a.dias))}) dia(s)</b>, a contar desta data.`;
    const cid = a.cid && a.cidOk;
    body = `<p>${t}</p>${cid ? `<p>CID-10: <b>${esc(a.cid)}</b> — informado com autorização expressa do(a) paciente.</p>${place}<div class="sigs">${sig(d.prof)}<div class="sig"><div class="ln"></div><b>${esc(d.paciente)}</b><span>Autorizo a inclusão do CID</span></div></div>` : `${place}${sig(d.prof)}`}`;
  } else if (type === "receita") {
    title = "Receituário";
    const items = d.receita.itens.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => { const [h, ...rest] = b.split("\n"); return `<li><b>${esc(h)}</b>${rest.length ? `<span class="pos">${esc(rest.join(" "))}</span>` : ""}</li>`; }).join("");
    body = `<p><b>Paciente:</b> ${esc(d.paciente)}${d.cpf ? ` &nbsp; <b>CPF:</b> ${esc(d.cpf)}` : ""}</p><div class="rx"><div class="uso">${esc(d.receita.uso)}</div><ol>${items}</ol></div>${place}${sig(d.prof)}`;
  } else if (type === "contrato") {
    title = "Contrato de prestação de serviços odontológicos";
    body = md(d.contrato.texto, c, d) + place + `<div class="sigs">${sig({ name: c.name, role: "CONTRATADA", cro: c.rtCro })}<div class="sig"><div class="ln"></div><b>${esc(d.paciente)}</b><span>CONTRATANTE</span>${d.cpf ? `<span class="cro">CPF ${esc(d.cpf)}</span>` : ""}</div></div><div class="sigs"><div class="sig"><div class="ln"></div><span>Testemunha 1 · CPF</span></div><div class="sig"><div class="ln"></div><span>Testemunha 2 · CPF</span></div></div>`;
  } else {
    const x = d[type]; const name = type === "manual" ? "Manual de biossegurança" : type === "it" ? "Instrução de trabalho" : "Procedimento operacional padrão";
    title = type === "manual" ? name : `${name} · ${x.codigo}`;
    body = `<table class="ctl"><tr><td colspan="3"><b>Título</b>${esc(type === "manual" ? name : x.titulo)}</td><td><b>Código</b>${esc(x.codigo)}</td></tr><tr><td><b>Revisão</b>${esc(x.rev)}</td><td><b>Emissão</b>${dShort(d.data)}</td><td><b>Elaborado por</b>${esc(x.elab)}</td><td><b>Aprovado por</b>${esc(x.aprov)}</td></tr></table><div style="height:14px"></div>${md(x.texto, c, d)}<div class="sigs">${sig({ name: x.elab, role: "Elaborado por" })}${sig({ name: x.aprov, role: "Aprovado por" })}</div>`;
  }
  return `<div class="a4" style="--b:${esc(c.color)}">${letterhead(c)}<div class="dt">${esc(title)}</div><div class="db">${body}</div>${footer(c)}</div>`;
}

/* ---------- cartões de visita ---------- */
export type Orient = "h" | "v";
function bizCard(c: KitClinic, o: Orient, x: { eye: string; title: string; sub?: string; badge?: string; lines: [string, string][]; qr?: string; qrcap?: string }) {
  const ls = x.lines.filter((l) => l[1]).map((l) => `<li><span>${esc(l[0])}</span><em>${esc(l[1])}</em></li>`).join("");
  const q = x.qr ? `<div class="qr"><img src="${x.qr}" alt=""></div>${o === "v" ? `<div class="qrcap">${esc(x.qrcap || "")}</div>` : ""}` : "";
  return `<div class="bc ${o}" style="--b:${esc(c.color)}"><div class="side"><div class="lgbox">${logoHTML(c, o === "v" ? 74 : 60)}</div></div><div class="main"><div class="eye">${esc(x.eye)}</div><div class="tt">${esc(x.title)}</div>${x.sub ? `<div class="st">${esc(x.sub)}</div>` : ""}${x.badge ? `<div class="bd">${esc(x.badge)}</div>` : ""}<ul class="ls">${ls}</ul></div>${q}${o === "v" ? '<div class="foot"></div>' : ""}</div>`;
}
export const clinicCardQR = (c: KitClinic) => waLink(c.whatsapp || c.phone) || c.site;
export function clinicCard(c: KitClinic, o: Orient, qr: string) {
  return bizCard(c, o, { eye: c.tagline || "Odontologia", title: c.name, sub: [c.rtName, c.rtCro].filter(Boolean).join(" · "), lines: [["TEL", c.phone], ["WHATSAPP", c.whatsapp], ["E-MAIL", c.email], ["ENDEREÇO", [c.address, c.city].filter(Boolean).join(" · ")], ["SITE", c.site || c.instagram]], qr, qrcap: "Fale no WhatsApp" });
}
export function personCard(c: KitClinic, p: KitPerson, o: Orient, qr: string) {
  return bizCard(c, o, { eye: c.name, title: p.name, sub: p.role, badge: p.cro, lines: [["TEL", p.phone], ["E-MAIL", p.email], ["CLÍNICA", c.phone], ["ENDEREÇO", o === "v" ? [c.address, c.city].filter(Boolean).join(" · ") : ""]], qr, qrcap: "Salvar contato" });
}

/* ---------- lembretes ---------- */
export type ReminderKind = "confirmacao" | "lembrete24" | "lembretedia" | "reagendamento";
export const REMINDER_LABELS: Record<ReminderKind, string> = { confirmacao: "Agendamento confirmado", lembrete24: "Lembrete: sua consulta é amanhã", lembretedia: "Lembrete: sua consulta é hoje", reagendamento: "Consulta reagendada" };
export interface ReminderInput { kind: ReminderKind; paciente: string; data: string; hora: string; prof: KitPerson | null; proc: string; obs: string }
export function reminderCard(c: KitClinic, a: ReminderInput) {
  const d = pd(a.data); const p = a.prof;
  return `<div class="rm" style="--b:${esc(c.color)}"><div class="hd"><div class="lg">${logoHTML(c, 40)}</div><div><b>${esc(c.name)}</b><span>${esc([c.phone, c.whatsapp ? "WhatsApp " + c.whatsapp : ""].filter(Boolean).join(" · "))}</span></div></div>
  <div class="kind">${esc(REMINDER_LABELS[a.kind])}</div><div class="day">${esc(first(a.paciente))}, ${esc(dWeek(a.data))}</div>
  <div class="when"><div class="dnum">${d ? pad(d.getDate()) : "--"}</div><div class="mon">${d ? MESES[d.getMonth()] : ""}<br>${d ? d.getFullYear() : ""}</div><div class="hr"><small>Horário</small><b>${esc(a.hora)}</b></div></div>
  <dl><dt>Paciente</dt><dd>${esc(a.paciente)}</dd><dt>Profissional</dt><dd>${esc(p?.name || "")}${p?.cro ? ` · <span class="m">${esc(p.cro)}</span>` : ""}</dd>${a.proc ? `<dt>Procedimento</dt><dd>${esc(a.proc)}</dd>` : ""}<dt>Endereço</dt><dd>${esc([c.address, c.city].filter(Boolean).join(", "))}</dd>${a.obs ? `<dt>Observação</dt><dd>${esc(a.obs)}</dd>` : ""}</dl>
  <div class="ft"><span>Responda <b>1</b> para confirmar ou <b>2</b> para reagendar</span><span>${esc(c.whatsapp || c.phone)}</span></div></div>`;
}
export interface ChannelMessage { key: "whatsapp" | "sms" | "email" | "dm"; label: string; text: string; limit?: number }
export function reminderMessages(c: KitClinic, a: ReminderInput): ChannelMessage[] {
  const n = first(a.paciente); const dt = `${dWeek(a.data)}, ${dShort(a.data)}`; const h = a.hora; const pr = a.prof?.name || ""; const proc = a.proc ? ` (${a.proc})` : ""; const end = [c.address, c.city].filter(Boolean).join(", ");
  const L: Record<ReminderKind, [string, string]> = {
    confirmacao: ["Seu horário está agendado", `Seu horário na *${c.name}* está agendado.`],
    lembrete24: ["Sua consulta é amanhã", `Passando para lembrar da sua consulta *amanhã* na *${c.name}*.`],
    lembretedia: ["Sua consulta é hoje", `Hoje é dia da sua consulta na *${c.name}*.`],
    reagendamento: ["Sua consulta foi reagendada", `Sua consulta na *${c.name}* foi reagendada.`],
  };
  const [subj0, line] = L[a.kind]; const plain = line.replace(/\*/g, "");
  const wa = `Olá, ${n}! ${line}\n\n📅 *${dt}*\n🕑 *${h}*\n🦷 ${pr}${proc}\n📍 ${end}${a.obs ? `\n\n${a.obs}` : ""}\n\nResponda *1* para confirmar ou *2* para reagendar.`;
  const sms = noAccent(`${c.name}: Ola ${n}, ${subj0.toLowerCase()}: ${dShort(a.data)} as ${h} com ${pr}. Responda 1 p/ confirmar ou 2 p/ reagendar.`);
  const mail = `Assunto: ${subj0} – ${dShort(a.data)} às ${h} | ${c.name}\n\nOlá, ${a.paciente},\n\n${plain}\n\nData: ${dt}\nHorário: ${h}\nProfissional: ${pr}${a.prof?.cro ? " – " + a.prof.cro : ""}${a.proc ? `\nProcedimento: ${a.proc}` : ""}\nEndereço: ${end}${a.obs ? `\n\n${a.obs}` : ""}\n\nPara confirmar ou reagendar, responda este e-mail ou fale conosco pelo WhatsApp ${c.whatsapp || c.phone}.\n\nAtenciosamente,\n${c.name}\n${[c.phone, c.email].filter(Boolean).join(" · ")}`;
  const dm = `Olá, ${n}! ${plain}\n${dt} às ${h}, com ${pr}.\nEndereço: ${end}\nResponda 1 para confirmar ou 2 para reagendar.`;
  return [{ key: "whatsapp", label: "WhatsApp", text: wa }, { key: "sms", label: "SMS", text: sms, limit: 160 }, { key: "email", label: "E-mail", text: mail }, { key: "dm", label: "Instagram / Messenger", text: dm }];
}

/* ---------- estilos (objetos de impressão: cores fixas) ---------- */
export const KIT_CSS = `
.bkit{--doc:"Source Serif 4",Georgia,"Times New Roman",serif;--ui:"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
.bkit *{box-sizing:border-box}
.bkit .mono{display:grid;place-items:center;border-radius:50%;color:#fff;font-weight:800;font-family:var(--ui)}
.bkit .a4{width:794px;min-height:1123px;background:#fff;color:#1a1a1a;font-family:var(--doc);font-size:13.5px;line-height:1.6;padding:56px 64px 48px;display:flex;flex-direction:column}
.bkit .dh{display:flex;align-items:center;gap:18px;padding-bottom:16px;border-bottom:2px solid var(--b)}
.bkit .dh .lg{width:78px;height:78px;display:grid;place-items:center;flex:none}
.bkit .dh .lg img{max-width:78px;max-height:78px}
.bkit .dh .who{flex:1;min-width:0}
.bkit .dh .who b{font-family:var(--ui);font-size:19px;color:var(--b);display:block;line-height:1.2}
.bkit .dh .who span{display:block;font-family:var(--ui);font-size:11px;color:#555;line-height:1.5}
.bkit .dt{font-family:var(--ui);font-size:20px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;text-align:center;margin:30px 0 22px;color:#111}
.bkit .ctl{width:100%;border-collapse:collapse;font-family:var(--ui);font-size:10.5px;margin-top:4px}
.bkit .ctl td{border:1px solid #bbb;padding:5px 7px;vertical-align:top}
.bkit .ctl td b{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#666;font-weight:700}
.bkit .db{flex:1}
.bkit .db p{margin:0 0 10px;text-align:justify}
.bkit .db h3{font-family:var(--ui);font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--b);margin:18px 0 6px}
.bkit .db h4{font-family:var(--ui);font-size:12.5px;margin:12px 0 4px}
.bkit .db ul,.bkit .db ol{margin:0 0 10px;padding-left:22px}
.bkit .db li{margin-bottom:3px}
.bkit .rx .uso{font-family:var(--ui);font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:16px 0 8px;color:var(--b)}
.bkit .rx ol li{margin-bottom:12px}
.bkit .rx .pos{display:block;color:#444;font-style:italic}
.bkit .sig{margin-top:56px;display:flex;flex-direction:column;align-items:center;gap:2px;font-family:var(--ui);font-size:12px}
.bkit .sig .ln{width:300px;border-top:1px solid #222;margin-bottom:4px}
.bkit .sig .cro{font-family:var(--mono);font-size:11px}
.bkit .sigs{display:flex;justify-content:space-around;gap:20px;margin-top:48px}
.bkit .sigs .sig{margin-top:0}
.bkit .sigs .sig .ln{width:240px}
.bkit .place{text-align:right;margin-top:28px}
.bkit .df{margin-top:28px;padding-top:10px;border-top:1px solid #ccc;font-family:var(--ui);font-size:10px;color:#666;text-align:center}
.bkit .bc{font-family:var(--ui);background:#fff;color:#16202a;overflow:hidden;position:relative}
.bkit .bc.h{width:350px;height:200px;display:grid;grid-template-columns:96px 1fr}
.bkit .bc .side{background:var(--b);display:flex;align-items:center;justify-content:center}
.bkit .bc .lgbox{background:#fff;border-radius:10px;width:70px;height:70px;display:grid;place-items:center;overflow:hidden}
.bkit .bc .lgbox img{max-width:62px;max-height:62px}
.bkit .bc.h .main{padding:16px;display:flex;flex-direction:column;min-width:0;position:relative}
.bkit .bc .eye{font-size:7.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--b);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bkit .bc .tt{font-size:15.5px;font-weight:800;line-height:1.15;letter-spacing:-.01em}
.bkit .bc .st{font-size:9.5px;color:#4d5862;margin-top:2px}
.bkit .bc .bd{display:inline-block;font-family:var(--mono);font-size:8.5px;font-weight:600;border:1px solid var(--b);color:var(--b);border-radius:4px;padding:1px 5px;margin-top:5px;align-self:flex-start}
.bkit .bc .ls{list-style:none;margin:auto 0 0;padding:0;display:flex;flex-direction:column;gap:2px;font-size:8.6px;max-width:170px}
.bkit .bc .ls li{display:flex;gap:5px;line-height:1.3}
.bkit .bc .ls li span{font-size:6.5px;font-weight:800;letter-spacing:.1em;color:var(--b);width:38px;flex:none;padding-top:1px}
.bkit .bc .ls li em{font-style:normal;word-break:break-word}
.bkit .bc.h .qr{position:absolute;right:12px;bottom:12px;width:64px;height:64px;padding:3px;background:#fff;border:1px solid #e4e8eb;border-radius:4px}
.bkit .bc .qr img{width:100%;height:100%;display:block}
.bkit .bc.v{width:270px;height:480px;display:flex;flex-direction:column;align-items:center;text-align:center}
.bkit .bc.v .side{width:100%;height:112px;align-items:flex-end;flex:none}
.bkit .bc.v .lgbox{width:84px;height:84px;transform:translateY(42px);box-shadow:0 2px 8px rgba(0,0,0,.15)}
.bkit .bc.v .lgbox img{max-width:74px;max-height:74px}
.bkit .bc.v .main{padding:54px 20px 0;display:flex;flex-direction:column;align-items:center;width:100%}
.bkit .bc.v .tt{font-size:18px}
.bkit .bc.v .bd{align-self:center}
.bkit .bc.v .ls{margin:12px 0 0;align-items:center;max-width:none}
.bkit .bc.v .ls li{flex-direction:column;gap:0;align-items:center}
.bkit .bc.v .ls li span{width:auto}
.bkit .bc.v .qr{margin-top:auto;margin-bottom:22px;width:104px;height:104px;padding:4px;border:1px solid #e4e8eb;border-radius:6px;background:#fff}
.bkit .bc.v .qrcap{font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:#7a858e;margin:-18px 0 14px}
.bkit .bc .foot{position:absolute;left:0;right:0;bottom:0;height:5px;background:var(--b)}
.bkit .rm{width:360px;height:450px;background:#fff;color:#14202a;font-family:var(--ui);display:flex;flex-direction:column;overflow:hidden}
.bkit .rm .hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #e6eaed}
.bkit .rm .hd .lg{width:40px;height:40px;display:grid;place-items:center;flex:none}
.bkit .rm .hd .lg img{max-width:40px;max-height:40px}
.bkit .rm .hd b{font-size:13px;line-height:1.2;display:block}
.bkit .rm .hd span{font-size:9.5px;color:#66727c}
.bkit .rm .kind{margin:18px 18px 0;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--b)}
.bkit .rm .day{margin:4px 18px 0;font-size:15px;font-weight:600;color:#3d4953}
.bkit .rm .when{display:flex;align-items:flex-end;gap:14px;margin:6px 18px 0}
.bkit .rm .dnum{font-size:64px;font-weight:800;line-height:.9;letter-spacing:-.03em;color:var(--b)}
.bkit .rm .mon{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;line-height:1.2}
.bkit .rm .hr{margin-left:auto;text-align:right;padding-bottom:4px}
.bkit .rm .hr small{display:block;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#7a858e;font-weight:700}
.bkit .rm .hr b{font-family:var(--mono);font-size:30px;font-weight:600;line-height:1}
.bkit .rm dl{margin:18px 18px 0;display:grid;grid-template-columns:78px 1fr;gap:6px 10px;font-size:11.5px}
.bkit .rm dt{font-size:8.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7a858e;padding-top:2px}
.bkit .rm dd{margin:0;font-weight:600}
.bkit .rm .m{font-family:var(--mono);font-weight:500}
.bkit .rm .ft{margin-top:auto;background:var(--b);color:#fff;padding:12px 18px;font-size:10.5px;display:flex;justify-content:space-between;gap:10px;align-items:center}
`;
export const KIT_FONTS = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@500;600&display=swap";
