import { prisma } from "../lib/prisma"

// Arquivo de emissao em lote do Receita Saude (Carne-Leao Web > Escrituracao > Importar Escrituracao).
// Leiaute oficial: manual Receita Saude v2.1, perguntas 24 e 25, e pagina "Formato do arquivo de Escrituracao".
// 16 campos separados por ";", sem cabecalho, decimal com virgula, ate 1.000 linhas, todos os pagamentos do mesmo ano.

type Ctx = { clinicId: string; tenantId: string; actorId?: string }

const CODIGO_RENDIMENTO = "R01.001.001" // trabalho nao assalariado
const OCUPACAO_ODONTOLOGO = "226"
const MAX_LINHAS = 1000
export const MARCA_EXPORTADO = "[Receita Saude: arquivo gerado"

const digits = (v?: string | null) => String(v || "").replace(/\D/g, "")

export function cpfValido(v?: string | null) {
  const c = digits(v)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

// Texto livre sem acento, sem ";" e sem quebra de linha: evita erro de codificacao no Carne-Leao.
function textoSeguro(v: string, max: number) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/;/g, ",").replace(/\s+/g, " ").trim().slice(0, max)
}

function dataBR(d: Date) {
  // paymentDate e coluna DATE (meia-noite UTC): usar os campos UTC para nao voltar um dia.
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
}

const valorBR = (v: number) => v.toFixed(2).replace(".", ",")

export async function professionals(c: Ctx) {
  const docs = await prisma.doctor.findMany({
    where: { clinicId: c.clinicId, isActive: true },
    select: { id: true, cpf: true, cro: true, croState: true, user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  })
  return docs.map((d) => ({
    id: d.id,
    name: `${d.user.firstName} ${d.user.lastName}`.trim(),
    cro: [d.cro, d.croState].filter(Boolean).join("-"),
    cpfOk: cpfValido(d.cpf),
  }))
}

export async function pending(c: Ctx) {
  const rows = await prisma.fiscalDocument.findMany({
    where: { clinicId: c.clinicId, kind: "RECEITA_SAUDE", status: "AGUARDANDO_RECEITA_SAUDE" },
    orderBy: { paymentDate: "asc" },
    take: 2000,
  })
  return rows.map((r) => ({
    id: r.id,
    payerName: r.payerName,
    payerDocument: r.payerDocument,
    description: r.description,
    amount: Number(r.amount),
    paymentDate: r.paymentDate,
    year: r.paymentDate ? r.paymentDate.getUTCFullYear() : null,
    exported: String(r.notes || "").includes(MARCA_EXPORTADO),
    problem: !r.paymentDate ? "Sem data de pagamento." : !cpfValido(r.payerDocument) ? "CPF do pagador ausente ou invalido." : Number(r.amount) <= 0 ? "Valor zerado." : null,
  }))
}

export async function exportFile(c: Ctx, body: any) {
  const doctorId = String(body?.doctorId || "")
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : []
  if (!doctorId) throw new Error("Escolha o profissional que vai importar o arquivo no Carne-Leao.")
  if (!ids.length) throw new Error("Selecione ao menos um pagamento.")
  if (ids.length > MAX_LINHAS) throw new Error(`O Carne-Leao aceita ate ${MAX_LINHAS} recibos por arquivo. Selecione menos pagamentos.`)

  const doutor = await prisma.doctor.findFirst({ where: { id: doctorId, clinicId: c.clinicId }, select: { cpf: true, user: { select: { firstName: true, lastName: true } } } })
  if (!doutor) throw new Error("Profissional nao encontrado.")
  const cpfProfissional = digits(doutor.cpf)
  if (!cpfValido(cpfProfissional)) throw new Error("Cadastre o CPF do profissional (o mesmo do acesso ao Carne-Leao) antes de gerar o arquivo.")
  const registro = textoSeguro(String(body?.professionalRegistry || ""), 15)

  const docs = await prisma.fiscalDocument.findMany({
    where: { id: { in: ids }, clinicId: c.clinicId, kind: "RECEITA_SAUDE", status: "AGUARDANDO_RECEITA_SAUDE" },
    orderBy: { paymentDate: "asc" },
  })
  const pacientes = await prisma.patient.findMany({
    where: { clinicId: c.clinicId, id: { in: docs.map((d) => d.patientId).filter(Boolean) as string[] } },
    select: { id: true, cpf: true },
  })
  const cpfPaciente = new Map(pacientes.map((p) => [p.id, digits(p.cpf)]))

  const ano = docs.find((d) => d.paymentDate)?.paymentDate?.getUTCFullYear()
  const linhas: string[] = []
  const incluidos: string[] = []
  const ignorados: { id: string; payerName: string; motivo: string }[] = []

  for (const d of docs) {
    const valor = Number(d.amount)
    const pagador = digits(d.payerDocument)
    if (!d.paymentDate) { ignorados.push({ id: d.id, payerName: d.payerName, motivo: "Sem data de pagamento." }); continue }
    if (d.paymentDate.getUTCFullYear() !== ano) { ignorados.push({ id: d.id, payerName: d.payerName, motivo: `Pagamento de outro ano (${d.paymentDate.getUTCFullYear()}); gere um arquivo separado.` }); continue }
    if (!cpfValido(pagador)) { ignorados.push({ id: d.id, payerName: d.payerName, motivo: "CPF do pagador ausente ou invalido." }); continue }
    if (!(valor > 0)) { ignorados.push({ id: d.id, payerName: d.payerName, motivo: "Valor zerado." }); continue }
    const doPaciente = d.patientId ? cpfPaciente.get(d.patientId) : ""
    const beneficiario = doPaciente && cpfValido(doPaciente) ? doPaciente : pagador
    const descricao = textoSeguro(`Tratamento odontologico${d.description ? ` - ${d.description}` : ""}`, 255)
    linhas.push([
      dataBR(d.paymentDate), // 1 data do pagamento
      CODIGO_RENDIMENTO, // 2 codigo do rendimento
      OCUPACAO_ODONTOLOGO, // 3 codigo da ocupacao
      valorBR(valor), // 4 valor do pagamento
      "", // 5 valor da deducao
      descricao, // 6 descricao
      "PF", // 7 recebido de
      pagador, // 8 CPF do pagador
      beneficiario, // 9 CPF do beneficiario
      "", // 10 ind. CPF nao informado
      "", // 11 CNPJ
      "", // 12 indicador de IRRF
      "", // 13 valor IRRF
      "S", // 14 indicador de recibo
      cpfProfissional, // 15 CPF do profissional
      registro, // 16 registro profissional
    ].join(";"))
    incluidos.push(d.id)
  }
  for (const id of ids) if (!docs.some((d) => d.id === id)) ignorados.push({ id, payerName: "-", motivo: "Documento nao esta aguardando Receita Saude." })
  if (!linhas.length) throw new Error("Nenhum pagamento pode entrar no arquivo. Corrija os itens apontados e tente de novo.")

  // Marca (sem apagar observacoes) para evitar importar o mesmo pagamento duas vezes.
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  for (const d of docs.filter((x) => incluidos.includes(x.id))) {
    if (String(d.notes || "").includes(MARCA_EXPORTADO)) continue
    const nota = `${MARCA_EXPORTADO} em ${hoje}]`
    await prisma.fiscalDocument.update({ where: { id: d.id }, data: { notes: d.notes ? `${d.notes}\n${nota}` : nota, updatedAt: new Date() } })
  }

  const nome = textoSeguro(`${doutor.user.firstName}-${doutor.user.lastName}`, 40).replace(/[^A-Za-z0-9-]/g, "-").toLowerCase()
  return {
    filename: `receita-saude-${ano}-${nome}.csv`,
    csv: linhas.join("\r\n") + "\r\n",
    incluidos: incluidos.length,
    ignorados,
  }
}
