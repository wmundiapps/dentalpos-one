// Gera os modelos de e-mail (HTML compatível com Gmail/Outlook + texto puro) em site/email/.
// Variáveis: {{nome}} {{lavacar}} {{link_cadastro}} {{link_descadastro}}. Uso: node tools/make-emails.mjs
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(import.meta.dirname, '../site/email');
fs.mkdirSync(out, { recursive: true });

const MAILS = [
  { id: '01-apresentacao', assunto: 'Seu lava-rápido com check-in com fotos, agenda e clube (30 dias grátis)', pre: 'Teste o LavaPos 30 dias, sem cartão.', titulo: 'Olá, {{nome}}!', corpo: [
      'Sou da equipe do <b>LavaPos</b>, um sistema feito para lava-rápido e estética automotiva. Escrevo porque o <b>{{lavacar}}</b> pode ganhar tempo e segurança no dia a dia.',
      '<b>O que o sistema faz:</b>', ['Check-in e entrega com fotos e checklist, para acabar com a discussão de "esse risco já estava aí"', 'Agenda online e aviso de carro pronto por WhatsApp, SMS e e-mail', 'Clube de assinatura (semanal, quinzenal, trisemanal e mensal) e cashback', 'Financeiro, estoque, fornecedores e avisos de licenças e alvarás'],
      'São <b>30 dias grátis, sem cartão</b>. Depois, R$ 119,00 por mês. Há também uma comissão de 10% sobre as lavagens pagas pelo sistema (explicada na página, antes de você criar a conta).'],
    cta: 'Testar 30 dias grátis', rodape: 'Você recebeu esta mensagem porque o endereço é de contato comercial do seu estabelecimento. Se não quiser receber mais, <a href="{{link_descadastro}}">clique aqui para sair da lista</a>.' },
  { id: '02-boas-vindas', assunto: 'Bem-vindo ao LavaPos — seus 30 dias grátis começaram', pre: 'Seus primeiros passos em 10 minutos.', titulo: 'Bem-vindo, {{nome}}!', corpo: [
      'A conta do <b>{{lavacar}}</b> está pronta. Para começar em 10 minutos:', ['<b>1.</b> Confira os preços em <i>Serviços e preços</i>', '<b>2.</b> Ajuste dias e horários em <i>Configurações</i>', '<b>3.</b> Faça seu primeiro check-in com fotos', '<b>4.</b> Compartilhe o link de agendamento com seus clientes'],
      'Dica: ligue a <b>verificação em 2 etapas</b> em <i>Configurações › Conta e dados</i>.', 'O LavaPos <b>nunca</b> pede sua senha por WhatsApp, SMS ou e-mail.'], cta: 'Abrir o LavaPos', rodape: 'Dúvidas? Responda este e-mail ou escreva para suporte@lavapos.com.br.' },
  { id: '03-dia-20-teste', assunto: 'Faltam 10 dias do seu teste grátis do LavaPos', pre: 'Veja o que já dá para fazer antes de acabar.', titulo: '{{nome}}, faltam 10 dias do seu teste', corpo: [
      'Seu teste do <b>{{lavacar}}</b> termina em 10 dias. Antes disso, vale experimentar:', ['O <b>clube de assinatura</b> com 2 ou 3 clientes fiéis', 'A tela de <b>Precificação</b>: veja o lucro por serviço e o ponto de equilíbrio', 'O <b>link de agendamento</b> no seu WhatsApp e no Instagram', 'O <b>antes e depois</b> na página pública (com autorização do cliente)'],
      'Se gostar, nada precisa ser feito agora: depois dos 30 dias a mensalidade é de R$ 119,00. Você pode cancelar quando quiser e exportar seus dados.'], cta: 'Continuar testando', rodape: 'Quer ajuda para configurar? Responda este e-mail.' },
  { id: '04-fim-do-teste', assunto: 'Seu teste do LavaPos terminou — como continuar', pre: 'Seus dados continuam guardados.', titulo: '{{nome}}, seu teste terminou', corpo: [
      'O período grátis do <b>{{lavacar}}</b> chegou ao fim. <b>Seus dados continuam guardados.</b>', 'Para continuar usando, a mensalidade é de <b>R$ 119,00</b>, por Pix, boleto ou cartão. Você recebe a cobrança em outro e-mail, da nossa plataforma de pagamentos.',
      'Se preferir não continuar, você pode exportar seus dados em <i>Configurações › Conta e dados</i>.'], cta: 'Entrar no LavaPos', rodape: 'Qualquer dúvida: suporte@lavapos.com.br. Desconfie de mensagens com links diferentes de lavapos.com.br ou app.lavapos.com.br.' },
];

const html = (m) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.assunto}</title></head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f2238">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${m.pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde4ec">
<tr><td style="background:#0b2a4a;padding:22px 28px"><span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.5px">Lava<span style="color:#14b8e6">Pos</span></span></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#0b2a4a">${m.titulo}</h1>
${m.corpo.map((c) => (Array.isArray(c) ? `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;font-size:16px">${c.map((x) => `<li style="margin-bottom:6px">${x}</li>`).join('')}</ul>` : `<p style="margin:0 0 14px;line-height:1.6;font-size:16px">${c}</p>`)).join('\n')}
<p style="margin:22px 0"><a href="{{link_cadastro}}" style="background:#0b5fd7;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:12px;display:inline-block">${m.cta}</a></p></td></tr>
<tr><td style="padding:8px 28px 26px;font-size:12px;line-height:1.5;color:#5b6b7e;border-top:1px solid #eef2f6">LavaPos — [RAZÃO SOCIAL DA WMUNDI], CNPJ [CNPJ], Maringá/PR.<br>${m.rodape}</td></tr>
</table></td></tr></table></body></html>`;
const strip = (s) => s.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2 ($1)').replace(/<[^>]+>/g, '');
const txt = (m) => `${strip(m.titulo)}\n\n${m.corpo.map((c) => (Array.isArray(c) ? c.map((x) => '- ' + strip(x)).join('\n') : strip(c))).join('\n\n')}\n\n${m.cta}: {{link_cadastro}}\n\n--\nLavaPos — [RAZÃO SOCIAL DA WMUNDI], CNPJ [CNPJ], Maringá/PR.\n${strip(m.rodape)}\n`;
for (const m of MAILS) { fs.writeFileSync(path.join(out, `${m.id}.html`), html(m)); fs.writeFileSync(path.join(out, `${m.id}.txt`), `Assunto: ${m.assunto}\n\n` + txt(m)); }
fs.writeFileSync(path.join(out, 'LEIA-ME.md'), `# Modelos de e-mail do LavaPos\n\n| Arquivo | Quando usar | Assunto |\n|---|---|---|\n${MAILS.map((m) => `| ${m.id} | ${m.id.startsWith('01') ? 'Apresentação a lava-rápidos (contato comercial B2B)' : m.id.startsWith('02') ? 'Logo após o cadastro (o sistema já envia uma versão em texto)' : m.id.startsWith('03') ? 'Dia 20 do teste' : 'Dia 31 (fim do teste)'} | ${m.assunto} |`).join('\n')}\n\n**Antes de enviar (👤):**\n- Troque \`{{nome}}\`, \`{{lavacar}}\`, \`{{link_cadastro}}\` (\`https://app.lavapos.com.br/?cadastro=1\`) e \`{{link_descadastro}}\` na sua ferramenta de e-mail (RD Station, Mailchimp, Brevo…).\n- Preencha razão social e CNPJ no rodapé.\n- **Prospecção (e-mail 01):** só para e-mails de contato comercial de empresas, identificando quem envia e com opção de sair. **Não** copiar listas de contatos de outros sistemas (regra WMundi) e **não** usar o e-mail 01 para pessoas físicas. Envie pelo domínio com SPF, DKIM e DMARC configurados (veja docs/SEGURANCA.md).\n- Os e-mails 02–04 vão apenas para quem criou conta.\n`);
console.log(MAILS.length, 'modelos gerados em', out);
