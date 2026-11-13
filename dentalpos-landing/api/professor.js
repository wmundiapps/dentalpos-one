// API do credenciamento de professores (www.dentalpos.com.br/professores) — envia e-mail pelo Resend
// Exige a variável RESEND_API_KEY no projeto dentalpos-landing (Vercel)

const DESTINO = 'contato@dentalpos.com.br'
const REMETENTE = 'DentalPos <contato@dentalpos.com.br>'
const VERSAO_CONDICOES = '2026-10-12'
const TIPOS = ['Curso online gravado', 'Aula ou webinar ao vivo', 'Curso presencial / hands-on', 'Mentoria', 'E-book / material', 'Imersão / evento']

function limpo(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 200)
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')
}

function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  for (let t = 9; t < 11; t++) {
    let s = 0
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i)
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false
  }
  return true
}

function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((a, p, i) => a + Number(c[i]) * p, 0) % 11
    return s < 2 ? 0 : 11 - s
  }
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}

function linkSeguro(v) {
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : ''
}

async function enviar(payload) {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify(payload)
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error('Resend ' + resposta.status + ': ' + texto)
  return texto
}

function tabela(linhas) {
  return '<table style="border-collapse:collapse;font-size:15px">' + linhas.map(function (l) {
    return '<tr><td style="padding:6px 14px 6px 0;color:#6B6660;vertical-align:top;white-space:nowrap">' + esc(l[0]) +
      '</td><td style="padding:6px 0;color:#1D1D1F"><strong>' + (l[2] ? l[1] : esc(l[1])) + '</strong></td></tr>'
  }).join('') + '</table>'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' })
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ erro: 'Envio de e-mail não configurado.' })

  let corpo
  try {
    corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  } catch (e) {
    return res.status(400).json({ erro: 'Dados inválidos.' })
  }

  // robô preencheu o campo escondido: responde ok e não envia nada
  if (limpo(corpo.site, 200)) return res.status(200).json({ ok: true })

  const d = {
    nome: limpo(corpo.nome, 120),
    doc: limpo(corpo.doc, 20).replace(/\D/g, ''),
    cro: limpo(corpo.cro, 30),
    email: limpo(corpo.email, 160).toLowerCase(),
    zap: limpo(corpo.zap, 20),
    cidade: limpo(corpo.cidade, 80),
    titulacao: limpo(corpo.titulacao, 160),
    curriculo: limpo(corpo.curriculo, 1500),
    links: limpo(corpo.links, 300),
    tipos: (Array.isArray(corpo.tipos) ? corpo.tipos : []).map(function (t) { return limpo(t, 60) }).filter(function (t) { return TIPOS.indexOf(t) >= 0 }),
    curso: limpo(corpo.curso, 160),
    descricao: limpo(corpo.descricao, 2000),
    carga: limpo(corpo.carga, 40),
    preco: limpo(corpo.preco, 20),
    amostra: linkSeguro(limpo(corpo.amostra, 300)),
    novidades: corpo.novidades === true
  }

  if (!d.nome) return res.status(400).json({ erro: 'Informe seu nome.' })
  if (!(cpfValido(d.doc) || cnpjValido(d.doc))) return res.status(400).json({ erro: 'CPF ou CNPJ inválido. Confira os números.' })
  if (!emailValido(d.email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' })
  if (d.zap.replace(/\D/g, '').length < 10) return res.status(400).json({ erro: 'Informe seu WhatsApp com DDD.' })
  if (!d.cidade || !d.titulacao || !d.curriculo || !d.curso || !d.descricao) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' })
  if (!d.tipos.length) return res.status(400).json({ erro: 'Marque o que você quer publicar.' })
  if (corpo.aceite !== true || corpo.direitos !== true) return res.status(400).json({ erro: 'Para enviar, aceite as condições de credenciamento e confirme os direitos do conteúdo.' })

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || ''
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const docFmt = d.doc.length === 11
    ? d.doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  const zapDigitos = d.zap.replace(/\D/g, '')

  const linhas = [
    ['Nome', d.nome],
    ['CPF/CNPJ', docFmt],
    d.cro ? ['CRO', d.cro] : null,
    ['E-mail', d.email],
    ['WhatsApp', '<a href="https://wa.me/55' + zapDigitos + '">' + esc(d.zap) + '</a>', true],
    ['Cidade', d.cidade],
    ['Titulação', d.titulacao],
    ['Currículo', d.curriculo],
    d.links ? ['Links', d.links] : null,
    ['Quer publicar', d.tipos.join(', ')],
    ['Curso principal', d.curso],
    ['Descrição', d.descricao],
    d.carga ? ['Carga horária', d.carga] : null,
    d.preco ? ['Preço pretendido', d.preco] : null,
    d.amostra ? ['Amostra', '<a href="' + esc(d.amostra) + '">' + esc(d.amostra) + '</a>', true] : null,
    ['Aceite', 'Condições de credenciamento versão ' + VERSAO_CONDICOES + ' (retenção de 20%) e declaração de direitos autorais, em ' + quando + ', IP ' + ip],
    ['Novidades', d.novidades ? 'Aceitou receber' : 'Não aceitou']
  ].filter(Boolean)

  try {
    await enviar({
      from: REMETENTE,
      to: [DESTINO],
      reply_to: d.email,
      subject: 'Credenciamento de professor — ' + d.nome + ' — ' + d.curso,
      html: '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px">' +
        '<h2 style="color:#1D1D1F;margin:0 0 4px">Novo credenciamento de professor</h2>' +
        '<p style="color:#6B6660;margin:0 0 18px">www.dentalpos.com.br/professores · responder em até 5 dias úteis</p>' +
        tabela(linhas) + '</div>'
    })

    await enviar({
      from: REMETENTE,
      to: [d.email],
      reply_to: DESTINO,
      subject: 'Recebemos seu credenciamento de professor — DentalPos',
      html: '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;color:#1D1D1F">' +
        '<h2 style="margin:0 0 12px">Obrigado, ' + esc(d.nome.split(' ')[0]) + '!</h2>' +
        '<p style="line-height:1.6">Recebemos seu pedido de credenciamento para publicar <strong>' + esc(d.curso) + '</strong> na DentalPos. Nossa equipe analisa e responde em até 5 dias úteis.</p>' +
        '<p style="line-height:1.6"><strong>Próximos passos:</strong> depois da análise, enviamos o Termo de Credenciamento para assinatura e o cadastro da sua conta de recebimento. A cada venda, você recebe 80% do valor líquido direto na sua conta; a DentalPos retém 20%.</p>' +
        '<p style="line-height:1.6">Você aceitou as condições de credenciamento versão ' + VERSAO_CONDICOES + ' em ' + esc(quando) + '. Elas estão em <a href="https://www.dentalpos.com.br/professores#termo" style="color:#B9821F;font-weight:700">dentalpos.com.br/professores</a>.</p>' +
        '<p style="line-height:1.6">Dúvidas? Chame no WhatsApp: <a href="https://wa.me/5544984535069" style="color:#B9821F;font-weight:700">(44) 98453-5069</a>.</p>' +
        '<p style="margin-top:26px;color:#6B6660;font-size:13.5px">DentalPos · Instituto Ravel de Ensino Superior Ltda. · CNPJ 03.162.275/0001-10</p>' +
        '</div>'
    })

    return res.status(200).json({ ok: true })
  } catch (erro) {
    console.error(erro)
    return res.status(502).json({ erro: 'Não foi possível enviar agora. Tente de novo em instantes.' })
  }
}
