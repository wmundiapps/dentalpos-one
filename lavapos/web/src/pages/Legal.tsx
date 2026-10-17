import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

const FILES: Record<string, string> = { contrato: 'CONTRATO-WMUNDI-LAVACAR', privacidade: 'POLITICA-PRIVACIDADE-LAVAPOS', lgpd: 'ADENDO-LGPD-OPERADOR-LAVAPOS', clube: 'TERMO-CLUBE-ASSINATURA-CLIENTE', checkin: 'TERMO-CHECKIN-VEICULO' };

/** Exibe o texto dos documentos legais (arquivos em docs/legal copiados para /legal/*.md no build). Texto simples: sem HTML. */
export default function Legal() {
  const { doc } = useParams(); const [text, setText] = useState<string | null>(null);
  useEffect(() => { const f = FILES[doc ?? '']; if (!f) { setText('Documento não encontrado.'); return; } fetch(`/legal/${f}.md`).then((r) => (r.ok ? r.text() : 'Documento indisponível.')).then(setText).catch(() => setText('Documento indisponível.')); }, [doc]);
  return (<div className="pub" style={{ paddingTop: 16 }}><a href="/">← Voltar</a><div className="card" style={{ marginTop: 10 }}><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{text ?? 'Carregando…'}</div></div></div>);
}

export function OptOut() {
  const [state, setState] = useState<'ask' | 'ok' | 'err'>('ask');
  const t = new URLSearchParams(location.search).get('t') ?? '';
  return (<div className="pub" style={{ paddingTop: 30 }}><div className="card"><h1>Parar de receber mensagens</h1>
    {state === 'ok' ? <div className="alert ok">Pronto! Você não receberá mais mensagens deste lava-rápido.</div> : <>
      <p>Confirme para parar de receber lembretes e ofertas deste lava-rápido por WhatsApp, SMS e e-mail.</p>{state === 'err' && <div className="alert bad">Link inválido ou expirado.</div>}
      <button className="primary" onClick={() => api('/public/optout', { body: { t } }).then(() => setState('ok')).catch(() => setState('err'))}>Confirmar</button></>}</div></div>);
}
