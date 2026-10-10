// Sequência de 3 e-mails da prospecção (apresentação, benefício, última chamada).
// Texto curto, sem promessa além do que o sistema já faz, com identificação do remetente e descadastro.

export interface TemplateLead {
  displayName: string
  razaoSocial: string
  cnpj: string
  city: string | null
  uf: string
  segment: string
}

export interface TemplateLinks {
  click: string
  unsubscribe: string
}

const SENDER_LINE =
  process.env.PROSPECT_SENDER_ID ||
  'DentalPos · WMundi Technologies · Maringá/PR · contato@dentalpos.com.br'

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '').padStart(14, '0')
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function bodies(lead: TemplateLead, step: number): { subject: string; paragraphs: string[]; cta: string } {
  const nome = lead.displayName
  const cidade = lead.city ? `${lead.city}` : 'sua cidade'
  const isLab = lead.segment === 'LABORATORIO'

  if (step === 1) {
    return {
      subject: isLab ? `${nome}: ordens de serviço e prazos com as clínicas em um só lugar` : `${nome}: menos tempo na gestão, mais tempo no atendimento`,
      paragraphs: [
        'Olá, tudo bem?',
        isLab
          ? `Sou o Dr. Robson Ravel, de Maringá (PR). Criei o DentalPos, um sistema de gestão odontológica, e estou convidando laboratórios de prótese de ${cidade} para conhecer.`
          : `Sou o Dr. Robson Ravel, de Maringá (PR). Criei o DentalPos porque, como dentista, eu via o consultório perder horas com agenda, confirmação de pacientes e financeiro espalhados em vários lugares.`,
        isLab
          ? 'No DentalPos as clínicas registram a ordem de serviço com o prazo de entrega, e o laboratório acompanha tudo, com avisos automáticos de andamento.'
          : 'No DentalPos a agenda, a ficha do paciente, o prontuário, o orçamento e o financeiro ficam juntos, e os lembretes de consulta saem sozinhos pelo WhatsApp.',
        'Estamos em lançamento: são 30 dias grátis, sem cartão, e quem assinar tem 50% de desconto no primeiro ano.',
      ],
      cta: 'Conhecer o DentalPos',
    }
  }

  if (step === 2) {
    return {
      subject: isLab ? 'Menos ligação cobrando prazo de trabalho' : 'Menos falta de paciente na sua agenda',
      paragraphs: [
        'Olá, retomando meu contato de alguns dias atrás.',
        isLab
          ? 'Um dos pontos que mais tomam tempo entre clínica e laboratório é cobrar e confirmar prazo. No DentalPos a ordem de serviço já nasce com a data de entrega e os lembretes vão sozinhos.'
          : 'O que mais pesa no faturamento de um consultório costuma ser o horário vazio. No DentalPos o paciente recebe a confirmação ao agendar, um lembrete na véspera e outro no dia, e a recepção vê na hora quem confirmou.',
        'Você testa com a sua rotina real durante 30 dias, sem custo e sem compromisso.',
      ],
      cta: 'Testar 30 dias grátis',
    }
  }

  return {
    subject: `Última mensagem, ${nome}`,
    paragraphs: [
      'Olá, esta é a minha última mensagem sobre o assunto, para não lotar a sua caixa de entrada.',
      'Se fizer sentido para você, o teste gratuito de 30 dias e os 50% de desconto no primeiro ano continuam valendo para quem entrar durante o lançamento.',
      'E se preferir conversar antes, é só responder este e-mail que eu mesmo respondo.',
    ],
    cta: 'Ativar meu teste gratuito',
  }
}

export function renderProspectEmail(lead: TemplateLead, step: number, links: TemplateLinks) {
  const { subject, paragraphs, cta } = bodies(lead, step)
  const signature = ['Dr. Robson Ravel', 'DentalPos — você só precisa atender.']
  const why = `Você recebeu este e-mail porque ${lead.razaoSocial} (CNPJ ${formatCnpj(lead.cnpj)}) consta com atividade ${lead.segment === 'LABORATORIO' ? 'de prótese dentária' : 'odontológica'} nos dados públicos do CNPJ da Receita Federal. Este é um contato comercial entre empresas.`

  const text = [
    ...paragraphs,
    '',
    `${cta}: ${links.click}`,
    '',
    ...signature,
    '',
    '---',
    why,
    `Não quer mais receber? Descadastre-se: ${links.unsubscribe}`,
    SENDER_LINE,
  ].join('\n')

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f6f8;">
<div style="max-width:560px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2933;background:#ffffff;">
${paragraphs.map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p)}</p>`).join('\n')}
<p style="margin:22px 0;"><a href="${links.click}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;">${escapeHtml(cta)}</a></p>
<p style="margin:0 0 4px;">${escapeHtml(signature[0])}</p>
<p style="margin:0 0 24px;color:#52606d;">${escapeHtml(signature[1])}</p>
<hr style="border:none;border-top:1px solid #e4e7eb;margin:20px 0;">
<p style="margin:0 0 8px;font-size:12px;color:#7b8794;">${escapeHtml(why)}</p>
<p style="margin:0 0 8px;font-size:12px;color:#7b8794;">Não quer mais receber? <a href="${links.unsubscribe}" style="color:#7b8794;">Descadastre-se com um clique</a>.</p>
<p style="margin:0;font-size:12px;color:#7b8794;">${escapeHtml(SENDER_LINE)}</p>
</div></body></html>`

  return { subject, text, html }
}
