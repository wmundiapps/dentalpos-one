// API do formulário da landing — envia e-mail pelo Resend
// Fica em: dentalpos-site/api/contato.js
// Exige a variável RESEND_API_KEY no projeto dentalpos-landing (Vercel)

const DESTINO = 'contato@dentalpos.com.br'
const REMETENTE = 'DentalPos One <contato@dentalpos.com.br>'

function limpo(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200)
}

function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

async function enviar(payload) {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY
    },
    body: JSON.stringify(payload)
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error('Resend ' + resposta.status + ': ' + texto)
  return texto
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido.' })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ erro: 'Envio de e-mail não configurado.' })
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  const perfil = limpo(corpo.perfil, 40)
  const nome = limpo(corpo.nome, 120)
  const clinica = limpo(corpo.clinica, 160)
  const email = limpo(corpo.email, 160)
  const zap = limpo(corpo.zap, 40)
  const mensagem = limpo(corpo.mensagem, 1200)
  const cidade = limpo(corpo.cidade, 80)
  const cro = limpo(corpo.cro, 40)
  const faculdade = limpo(corpo.faculdade, 120)
  const anoFormatura = limpo(corpo.anoFormatura, 6)
  const canalBruto = limpo(corpo.canal, 20).toLowerCase()
  const canal = ['whatsapp', 'email', 'agora'].indexOf(canalBruto) >= 0 ? canalBruto : ''

  if (!nome) return res.status(400).json({ erro: 'Informe seu nome.' })
  if (!emailValido(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' })
  if (canal === 'whatsapp' && zap.replace(/\D/g, '').length < 10) return res.status(400).json({ erro: 'Informe seu WhatsApp com DDD para receber o acesso por lá.' })

  const linhas = [
    perfil ? ['Perfil', perfil] : null,
    ['Nome', nome],
    clinica ? ['Clínica ou instituição', clinica] : null,
    ['E-mail', email],
    zap ? ['WhatsApp', zap] : null,
    cidade ? ['Cidade', cidade] : null,
    cro ? ['CRO', cro] : null,
    faculdade ? ['Faculdade que cursa', faculdade] : null,
    anoFormatura ? ['Ano de formatura', anoFormatura] : null,
    canal ? ['Acesso', canal === 'whatsapp' ? 'Receber por WhatsApp (enviar manualmente)' : (canal === 'agora' ? 'Acessar agora (foi redirecionado ao login)' : 'Receber só por e-mail')] : null,
    mensagem ? ['Mensagem', mensagem] : null
  ].filter(Boolean)

  const tabela = linhas
    .map(function (l) {
      return '<tr><td style="padding:6px 14px 6px 0;color:#6B6660;white-space:nowrap">' + l[0] +
             '</td><td style="padding:6px 0;color:#1D1D1F"><strong>' + l[1] + '</strong></td></tr>'
    })
    .join('')

  try {
    // 1. aviso para a equipe
    await enviar({
      from: REMETENTE,
      to: [DESTINO],
      reply_to: email,
      subject: (canal === 'whatsapp' ? 'ENVIAR ACESSO POR WHATSAPP — ' : 'Novo contato pela landing — ') + nome + (perfil ? ' (' + perfil + ')' : ''),
      html:
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px">' +
        '<h2 style="color:#1D1D1F;margin:0 0 4px">Novo contato pela landing</h2>' +
        '<p style="color:#6B6660;margin:0 0 18px">one.dentalpos.com.br</p>' +
        '<table style="border-collapse:collapse;font-size:15px">' + tabela + '</table>' +
        '</div>'
    })

    // 2. confirmação e acesso para quem preencheu
    const linkAcesso = 'https://app.dentalpos.com.br'
    const blocoAcesso = canal === 'whatsapp'
      ? '<p style="line-height:1.6">Você pediu para receber o acesso pelo <strong>WhatsApp</strong>. Nossa equipe vai enviar para o número que você informou. Para começar agora, crie seu acesso por aqui: <a href="' + linkAcesso + '" style="color:#B9821F;font-weight:700">' + linkAcesso + '</a>.</p>'
      : '<p style="line-height:1.6">Para <strong>criar o seu acesso agora</strong>, entre em <a href="' + linkAcesso + '" style="color:#B9821F;font-weight:700">' + linkAcesso + '</a> e escolha "Começar gratuito". São 30 dias grátis, sem cartão de crédito.</p>'
    await enviar({
      from: REMETENTE,
      to: [email],
      subject: canal ? 'Seu acesso ao DentalPos One' : 'Recebemos seu contato — DentalPos One',
      html:
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;color:#1D1D1F">' +
        '<h2 style="margin:0 0 12px">Obrigado, ' + nome + '!</h2>' +
        '<p style="line-height:1.6">Recebemos seus dados e entraremos em contato em breve para mostrar o DentalPos One funcionando com a rotina da sua clínica.</p>' +
        (canal ? blocoAcesso : '') +
        '<p style="line-height:1.6">Se preferir falar agora, é só chamar no WhatsApp: ' +
        '<a href="https://wa.me/5544984535069" style="color:#B9821F;font-weight:700">(44) 98453-5069</a>.</p>' +
        '<p style="line-height:1.6">O Experience são 30 dias gratuitos, sem cartão de crédito, e tudo o que você registrar fica guardado mesmo que decida não seguir.</p>' +
        '<p style="margin-top:26px;color:#6B6660;font-size:13.5px">DentalPos One · Desenvolvido por WMundi Technologies &amp; Co</p>' +
        '</div>'
    })

    return res.status(200).json({ ok: true })
  } catch (erro) {
    console.error(erro)
    return res.status(502).json({ erro: 'Não foi possível enviar agora.' })
  }
}
