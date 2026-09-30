import { useEffect, useState } from 'react';
import { api } from '../api';

type Cfg = {
  adminEmailsConfigured: number; emailSending: boolean; smtpLogin: string; emailFrom: string;
  emailLast24h: { sent: number; failed: number; pending: number; lastSentAt: string | null; lastError: string | null } | null;
  mercadoPago: boolean; appUrl: string | null; version: string | null;
};

// Diagnóstico da configuração na Vercel (sem segredos), para a equipe resolver problemas sem entrar no código
export default function Diagnostics() {
  const [c, setC] = useState<Cfg | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Cfg>('/health/config').then(setC).catch(() => setError('Não foi possível consultar o servidor.')); }, []);
  if (!c) return <div className="container narrow"><h1>Diagnóstico</h1><p>{error || 'Consultando…'}</p></div>;
  const row = (ok: boolean, title: string, detail: string, fix?: string) => (
    <div className={`panel diag ${ok ? '' : 'warn'}`}>
      <strong>{ok ? '✅' : '❌'} {title}</strong>
      <p className="small">{detail}</p>
      {!ok && fix && <p className="small notice">👉 {fix}</p>}
    </div>
  );
  const m = c.emailLast24h;
  return (
    <div className="container narrow">
      <h1>Diagnóstico do SpaceHour</h1>
      <p className="muted small">Mostra o que a Vercel está entregando ao servidor agora. Nenhuma senha ou chave aparece aqui.{c.version ? ` Versão ${c.version}.` : ''}</p>
      {row(c.adminEmailsConfigured > 0, 'Administradores (ADMIN_EMAILS)', `${c.adminEmailsConfigured} e-mail(s) configurado(s).`,
        'Na Vercel (projeto spacehour → Settings → Environment Variables), crie ADMIN_EMAILS marcando o ambiente Production e faça Redeploy.')}
      {row(c.emailSending, 'Envio de e-mail configurado (SMTP_HOST)', c.emailSending ? 'Servidor de e-mail informado.' : 'Sem SMTP_HOST: nenhum e-mail sai (código de confirmação, senha, avisos).',
        'Cadastre SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER e SMTP_PASS na Vercel (ambiente Production) e faça Redeploy.')}
      {c.emailSending && row(c.smtpLogin === 'ok', 'Login no servidor de e-mail', c.smtpLogin === 'ok' ? 'O servidor aceitou usuário e senha.' : `Recusado: ${c.smtpLogin}`,
        'Confira SMTP_USER (e-mail completo) e SMTP_PASS (senha da caixa noreply@space-hour.com). Na GoDaddy/Microsoft 365, o "SMTP autenticado" precisa estar ativado para essa caixa.')}
      {m && row(m.failed === 0, 'E-mails nas últimas 24 h', `Enviados: ${m.sent} · com falha: ${m.failed} · na fila: ${m.pending}${m.lastSentAt ? ` · último envio: ${new Date(m.lastSentAt).toLocaleString('pt-BR')}` : ''}${m.lastError ? ` · último erro: ${m.lastError}` : ''}`)}
      {row(c.mercadoPago, 'Mercado Pago (MP_CLIENT_ID / MP_CLIENT_SECRET)', c.mercadoPago ? 'Credenciais da aplicação configuradas.' : 'Sem credenciais: anfitriões não conseguem conectar a conta.',
        'Cadastre MP_CLIENT_ID e MP_CLIENT_SECRET (Credenciais de produção) na Vercel e faça Redeploy.')}
      {row(!!c.appUrl, 'Endereço do site (APP_URL)', c.appUrl ?? 'Não configurado: links dos e-mails podem apontar para o lugar errado.', 'Cadastre APP_URL = https://space-hour.com na Vercel.')}
    </div>
  );
}
