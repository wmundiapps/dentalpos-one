import type { OperationalAlert } from "../types/operationsHub";

export interface AlertGuide { problem: string; why: string; steps: string[]; keywords: string[] }

// Explicação do problema e o que fazer para resolver, conforme o tipo de aviso.
export function guideFor(a: OperationalAlert): AlertGuide {
  const id = a.id;
  if (id.startsWith("lab-overdue-")) return {
    problem: "O trabalho de laboratório passou do prazo de entrega.",
    why: "Prótese atrasada atrasa o retorno do paciente, a agenda do dentista e o recebimento do tratamento.",
    steps: ["Ligue para o laboratório e confirme a nova data de entrega.", "Atualize o prazo e o andamento do trabalho no Laboratório.", "Avise o paciente e, se preciso, remarque o retorno na Agenda.", "Registre o motivo do atraso para cobrar o laboratório."],
    keywords: ["laborat", "prótese", "protese", "moldagem", "escaneamento"],
  };
  if (id.startsWith("lab-risk-")) return {
    problem: "O trabalho de laboratório está perto do prazo ou do retorno do paciente.",
    why: "Se a peça não chegar a tempo, o retorno do paciente precisa ser remarcado.",
    steps: ["Confirme com o laboratório se a entrega vai acontecer no prazo.", "Se não for chegar, avise o paciente e remarque o retorno.", "Atualize o andamento do trabalho no Laboratório."],
    keywords: ["laborat", "prótese", "protese"],
  };
  if (id.startsWith("financial-overdue-")) return a.area === "Financeiro" ? {
    problem: "Uma conta a pagar da clínica está vencida.",
    why: "Atraso gera multa e juros e pode suspender o fornecimento.",
    steps: ["Confira o valor e o vencimento da conta.", "Pague ou negocie nova data com o fornecedor.", "Registre o pagamento em Contas a pagar para o aviso sair."],
    keywords: ["pagar", "financ", "fornecedor"],
  } : {
    problem: "Um recebimento do paciente está vencido.",
    why: "Recebimento em atraso afeta o caixa e, depois de alguns dias, entra na cobrança automática.",
    steps: ["Abra o lançamento e confira se o paciente já pagou.", "Se não pagou, entre em contato e ofereça nova forma de pagamento (Pix, boleto ou cartão) em Gerar financeiro.", "Se houve acordo, registre a nova data.", "Quando o valor entrar, dê baixa no lançamento."],
    keywords: ["cobran", "financ", "receber", "inadimpl"],
  };
  if (id.startsWith("financial-due-")) return {
    problem: "Uma conta está perto do vencimento.",
    why: "Pagar no prazo evita multa e juros.",
    steps: ["Confira o valor e a data.", "Programe o pagamento.", "Registre a baixa quando pagar."],
    keywords: ["pagar", "financ"],
  };
  if (id.startsWith("agenda-unbilled")) return {
    problem: "A consulta aconteceu e ainda não tem cobrança lançada.",
    why: "Atendimento sem financeiro vira dinheiro que a clínica não recebe.",
    steps: ["Abra a ficha do paciente, aba Financeiro.", "Toque em Gerar financeiro e escolha Pix, boleto, cartão, cheque ou dinheiro.", "Confira se o valor está certo."],
    keywords: ["financ", "cobran"],
  };
  if (id.startsWith("inventory-expiry-")) return {
    problem: "Há material com validade chegando.",
    why: "Material vencido não pode ser usado e vira prejuízo.",
    steps: ["Separe o lote e use primeiro o que vence antes.", "Se não der tempo de usar, veja com o fornecedor a troca.", "Descarte o que vencer, conforme a norma da clínica."],
    keywords: ["estoque", "material", "biosseguran"],
  };
  if (id.startsWith("inventory-")) return {
    problem: "Um material está abaixo do estoque mínimo.",
    why: "Sem reposição, o procedimento pode ser adiado por falta de material.",
    steps: ["Confira o saldo real na prateleira.", "Faça o pedido ao fornecedor.", "Quando chegar, registre a reposição em Estoque."],
    keywords: ["estoque", "material", "pedido", "compra"],
  };
  if (id.startsWith("hr-")) return {
    problem: "Há uma pendência de RH com prazo.",
    why: "Documento, experiência ou férias vencidos geram risco trabalhista.",
    steps: ["Abra a ficha do colaborador em RH.", "Regularize o documento ou o prazo.", "Registre a providência."],
    keywords: ["rh", "colaborador", "ponto", "trabalh"],
  };
  if (id.startsWith("agenda-")) return {
    problem: "Há uma consulta que pede atenção.",
    why: "Confirmar o paciente evita horário vazio.",
    steps: ["Confira a consulta na Agenda.", "Confirme com o paciente por mensagem ou telefone.", "Atualize o status da consulta."],
    keywords: ["agenda", "confirma", "paciente"],
  };
  return { problem: a.description, why: "O sistema marcou este aviso como pendente.", steps: ["Abra o item na origem e resolva a pendência.", "Se o aviso não se aplica, use Dispensar e informe o motivo."], keywords: [a.area.toLowerCase()] };
}
