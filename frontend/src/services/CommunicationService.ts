import type {
  CommunicationChannel,
  CommunicationMessage,
} from "../types/communication";

export const communicationMessages: CommunicationMessage[] = [
  {
    id: 1,
    recipientName: "Maria Oliveira",
    recipientContact: "(44) 99999-0001",
    channel: "WhatsApp",
    subject: "Confirmação de consulta",
    message:
      "Olá, Maria. Confirmamos sua consulta para amanhã às 08:00.",
    status: "Entregue",
    sentAt: "Hoje, 09:10",
  },
  {
    id: 2,
    recipientName: "Carlos Pereira",
    recipientContact: "carlos@email.com",
    channel: "E-mail",
    subject: "Orçamento do tratamento",
    message:
      "Encaminhamos o orçamento e as opções de pagamento do tratamento.",
    status: "Lida",
    sentAt: "Hoje, 08:40",
  },
  {
    id: 3,
    recipientName: "Fernanda Lima",
    recipientContact: "(44) 99999-0003",
    channel: "SMS",
    subject: "Lembrete de retorno",
    message:
      "Seu retorno odontológico está programado para 05/08/2026.",
    status: "Agendada",
    scheduledAt: "04/08/2026, 09:00",
  },
  {
    id: 4,
    recipientName: "Base de pacientes inativos",
    recipientContact: "248 destinatários",
    channel: "WhatsApp",
    subject: "Campanha de reativação",
    message:
      "Preparamos condições especiais para você retomar seu tratamento.",
    status: "Agendada",
    scheduledAt: "05/08/2026, 10:00",
    campaignName: "Reativação Agosto",
  },
  {
    id: 5,
    recipientName: "Leads de Implantodontia",
    recipientContact: "86 destinatários",
    channel: "E-mail",
    subject: "Implantes e reabilitação oral",
    message:
      "Conheça nossas opções de tratamento implantodôntico.",
    status: "Rascunho",
    campaignName: "Implantes Agosto",
  },
];

export function countMessagesByChannel(
  channel: CommunicationChannel,
): number {
  return communicationMessages.filter(
    (message) => message.channel === channel,
  ).length;
}