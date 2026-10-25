import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { Alert, Badge, ErrorAlert, ErrorState, Loading, PageHead } from '../components/ui';

interface KycState { status: 'none' | 'pending' | 'verified' | 'rejected'; rejectReason: string | null; required: string[]; uploaded: string[]; missing: string[] }

const KINDS: Record<string, { title: string; help: string; accept: string; capture?: 'user' | 'environment' }> = {
  doc_front: { title: 'Documento com foto — frente', help: 'RG ou CNH aberta, mostrando a frente inteira, com foto e dados legíveis.', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  doc_back: { title: 'Documento com foto — verso', help: 'O verso do mesmo documento. Se for CNH aberta, envie de novo a mesma foto.', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  selfie: { title: 'Selfie segurando o documento', help: 'Seu rosto e o documento aberto, no mesmo enquadramento, com boa luz. Sem óculos escuros ou boné.', accept: 'image/jpeg,image/png,image/webp', capture: 'user' },
  address_proof: { title: 'Comprovante de endereço', help: 'Conta de luz, água, telefone ou banco dos últimos 90 dias, no seu nome (ou da empresa).', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  cnpj_card: { title: 'Cartão CNPJ', help: 'Comprovante de inscrição e situação cadastral da empresa, emitido pela Receita Federal.', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
};

export function Kyc() {
  usePageTitle('Verificação de identidade');
  const { user, refresh } = useApp();
  const k = useAsync(() => api.get<KycState>('/kyc'), [user?.id]);
  const submit = useAction();

  if (!user) return <Loading />;
  if (user.accountType !== 'anunciante') {
    return (
      <div className="narrow stack">
        <PageHead title="Verificação de identidade" />
        <Alert tone="warn" title="Antes, complete o cadastro de anunciante">Informe seu CPF ou CNPJ e seu endereço.</Alert>
        <Link to="/conta/anunciante" className="btn btn-primary btn-lg">Virar anunciante</Link>
      </div>
    );
  }
  if (k.loading && !k.data) return <Loading />;
  if (k.error && !k.data) return <ErrorState error={k.error} onRetry={k.reload} />;
  const s = k.data!;
  const contactsOk = user.emailVerified && user.phoneVerified;
  const editable = s.status !== 'pending' && s.status !== 'verified';
  const done = (kind: string) => s.uploaded.includes(kind);

  const send = async () => {
    const r = await submit.run(() => api.post<KycState>('/kyc/submit'));
    if (r) { k.setData(r); await refresh(); }
  };

  return (
    <div className="narrow stack-l">
      <PageHead title="Verificação de identidade" sub="Para publicar anúncios, precisamos confirmar quem você é. Isso protege compradores e vendedores." />

      {s.status === 'verified' && <Alert tone="ok" title="Identidade verificada">Tudo certo! Você já pode publicar anúncios. <Link to="/venda/anunciar">Anunciar agora</Link></Alert>}
      {s.status === 'pending' && <Alert tone="info" title="Documentos em análise">Recebemos seus documentos e nossa equipe está analisando. Você receberá um e-mail com o resultado. Enquanto isso, não é preciso fazer mais nada.</Alert>}
      {s.status === 'rejected' && <Alert tone="bad" title="Verificação recusada">Motivo: {s.rejectReason ?? 'não informado'}. Corrija e envie os documentos novamente abaixo.</Alert>}
      {!contactsOk && <Alert tone="warn" title="Confirme e-mail e telefone primeiro">Você precisa confirmar os dois antes de enviar para análise. <Link to="/conta/confirmar">Confirmar agora</Link></Alert>}

      <Alert tone="info" title="🔒 Sua privacidade">
        Seus documentos são guardados <strong>cifrados</strong> e só a equipe de moderação consegue vê-los, com registro de cada acesso. Usamos apenas para verificar sua identidade e prevenir fraudes (<Link to="/legal/politica-de-privacidade">Política de Privacidade</Link>).
      </Alert>

      {editable && (
        <div className="panel">
          <h2>Dicas para uma foto aprovada</h2>
          <ul>
            <li>Foto <strong>nítida</strong>, com o documento inteiro dentro do quadro.</li>
            <li><strong>Sem reflexo</strong> nem sombra sobre os dados.</li>
            <li>Todos os <strong>dados legíveis</strong>. Não corte as bordas.</li>
            <li>Formatos: JPG, PNG, WebP ou PDF (até 8 MB por arquivo).</li>
          </ul>
        </div>
      )}

      <ol className="kyc-steps">
        {s.required.map((kind, i) => (
          <KycStep key={kind} n={i + 1} kind={kind} done={done(kind)} editable={editable} onUploaded={(st) => k.setData(st)} />
        ))}
      </ol>

      {editable && (
        <div className="stack">
          <ErrorAlert error={submit.error} />
          {s.missing.length > 0 && <p className="small muted">Faltam: {s.missing.map((m) => KINDS[m]?.title ?? m).join('; ')}.</p>}
          <button className="btn btn-primary btn-lg" disabled={s.missing.length > 0 || !contactsOk || submit.busy} onClick={send}>{submit.busy ? 'Enviando…' : 'Enviar para análise'}</button>
        </div>
      )}
    </div>
  );
}

function KycStep({ n, kind, done, editable, onUploaded }: { n: number; kind: string; done: boolean; editable: boolean; onUploaded: (s: KycState) => void }) {
  const def = KINDS[kind] ?? { title: kind, help: '', accept: 'image/*' };
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  const act = useAction();
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f: File | undefined) => {
    setErr('');
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr('Arquivo maior que 8 MB.'); return; }
    if (!(def.accept.split(',').includes(f.type))) { setErr('Formato não aceito. Envie JPG, PNG, WebP' + (def.accept.includes('pdf') ? ' ou PDF.' : '.')); return; }
    setFile(f);
  };
  const upload = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('kind', kind); // o servidor lê o texto antes do arquivo
    fd.append('file', file, file.name);
    const r = await act.run(() => api.upload<KycState>('/kyc/documents', fd));
    if (r) { onUploaded(r); setFile(null); }
  };

  return (
    <li className={`kyc-step${done ? ' done' : ''}`}>
      <div className="kyc-head">
        <span className="stepper-n" aria-hidden="true">{done ? '✔' : n}</span>
        <div>
          <h2>{def.title} {done ? <Badge tone="ok">Enviado</Badge> : <Badge tone="warn">Pendente</Badge>}</h2>
          <p className="small muted">{def.help}</p>
        </div>
      </div>
      {editable && (
        <div className="stack">
          <input ref={inp} type="file" accept={def.accept} {...(def.capture ? { capture: def.capture } : {})} hidden aria-label={def.title} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {file && (
            <div className="kyc-preview">
              {preview ? <img src={preview} alt={`Pré-visualização: ${def.title}`} /> : <div className="pdf-ico" aria-hidden="true">📄</div>}
              <span className="small">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </div>
          )}
          {err && <Alert tone="bad">{err}</Alert>}
          <ErrorAlert error={act.error} />
          <div className="row wrap">
            <button type="button" className="btn btn-outline" onClick={() => inp.current?.click()}>{file ? 'Trocar arquivo' : done ? 'Enviar outro arquivo' : def.capture ? 'Tirar foto / escolher' : 'Escolher arquivo'}</button>
            {file && <button type="button" className="btn btn-primary" disabled={act.busy} onClick={upload}>{act.busy ? 'Enviando…' : 'Enviar este arquivo'}</button>}
          </div>
        </div>
      )}
    </li>
  );
}
