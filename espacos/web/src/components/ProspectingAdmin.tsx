import { useEffect, useMemo, useState } from 'react';
import { api, apiBlobUrl } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../errors';

// Captação de anfitriões (equipe): busca na Receita Federal e no Google Maps, importação de
// planilhas (leads de anúncios do Meta/LinkedIn, Sales Navigator, eventos), lista e
// sequência de 3 e-mails com clique rastreado e descadastro (LGPD). Tela só em português.

type Segment = { id: string; label: string; cnaes: string[]; maps: string };
type Candidate = {
  source: 'receita' | 'maps' | 'csv' | 'manual'; sourceRef?: string; name: string; segment?: string | null; email?: string | null;
  phone?: string | null; website?: string | null; address?: string | null; city?: string | null; uf?: string | null; alreadyAdded?: boolean; webmail?: boolean;
};
type Config = { sending_enabled: boolean; daily_limit: number; step2_after_days: number; step3_after_days: number; send_to_webmail: boolean };
type Stats = { byStatus: Record<string, number>; sent_today: number; sent_7d: number; clicks_7d: number };
type Overview = { segments: Segment[]; base: { companies: number; withEmail: number; refMonth: string | null }; stats: Stats; config: Config; mapsEnabled: boolean; inviteMailbox: { address: string | null; problem: string | null } };
type Prospect = { id: string; source: string; name: string; segment: string | null; email: string | null; phone: string | null; website: string | null; city: string | null; uf: string | null; status: string; last_step: number; last_sent_at: string | null; notes: string | null; token: string; wa_invited_at: string | null };

const STATUS: Record<string, string> = {
  new: 'Nova', in_sequence: 'Recebendo e-mails', done: 'Sequência concluída', hot: '🔥 Quente (clicou)', replied: 'Respondeu',
  converted: '✅ Cadastrou', unsubscribed: 'Não quer receber', bounced: 'E-mail inválido', excluded: 'Excluída',
};
const SOURCE: Record<string, string> = { receita: 'Receita', maps: 'Google Maps', csv: 'Planilha', manual: 'Manual' };

export function ProspectingAdmin() {
  const { t } = useI18n();
  const [ov, setOv] = useState<Overview | null>(null);
  const [msg, setMsg] = useState('');
  const [ver, setVer] = useState(0); // recarrega a lista depois de adicionar
  const load = () => api<Overview>('/admin/prospecting/overview').then(setOv).catch((e) => setMsg(errorText(e, t)));
  useEffect(() => { load(); }, []);
  if (!ov) return <p className="muted">{msg || t('common.wait')}</p>;
  const s = ov.stats;
  return (
    <div className="prospecting">
      <div className="kpis">
        <div className="kpi"><strong>{ov.base.companies.toLocaleString('pt-BR')}</strong><span>empresas na base da Receita{ov.base.refMonth ? ` (${ov.base.refMonth})` : ''}</span></div>
        <div className="kpi"><strong>{Object.values(s.byStatus).reduce((a, b) => a + b, 0)}</strong><span>na lista de captação</span></div>
        <div className="kpi"><strong>{s.sent_today} · {s.sent_7d}</strong><span>e-mails hoje · 7 dias</span></div>
        <div className="kpi"><strong>{s.clicks_7d} · {s.byStatus.hot ?? 0}</strong><span>cliques 7 dias · quentes</span></div>
        <div className="kpi"><strong>{s.byStatus.converted ?? 0}</strong><span>viraram cadastro</span></div>
      </div>
      {msg && <p className="notice small">{msg}</p>}
      <Search ov={ov} onAdded={(m) => { setMsg(m); load(); setVer((v) => v + 1); }} />
      <ImportCsv onAdded={(m) => { setMsg(m); load(); setVer((v) => v + 1); }} />
      <ProspectList key={ver} />
      <Sequence ov={ov} onChange={load} />
      <details className="panel">
        <summary><strong>Como carregar a base da Receita Federal</strong></summary>
        <ol className="small">
          <li>No PC com Windows (o site da Receita só aceita conexões do Brasil), use a pasta <code>espacos/tools/receita-import</code> do repositório.</li>
          <li>Dê dois cliques em <code>carregar-dentistas-PR.bat</code> e cole o <code>DATABASE_URL</code> do SpaceHour (Vercel). Outros estados: <code>node importar.cjs --ufs=PR,SC --cnaes=8630504</code>.</li>
          <li>A carga leva de 30 a 90 minutos e pode ser repetida todo mês (a Receita atualiza mensalmente).</li>
        </ol>
      </details>
    </div>
  );
}

function Search({ ov, onAdded }: { ov: Overview; onAdded: (m: string) => void }) {
  const { t } = useI18n();
  const [source, setSource] = useState<'receita' | 'maps'>('receita');
  const [segment, setSegment] = useState(ov.segments[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('Maringá');
  const [uf, setUf] = useState('PR');
  const [onlyEmail, setOnlyEmail] = useState(true);
  const [results, setResults] = useState<Candidate[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function search(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api<{ results: Candidate[] }>('/admin/prospecting/search', { body: { source, segment, query: query || undefined, city, uf: source === 'receita' ? uf : undefined, onlyWithEmail: onlyEmail, limit: 300 } });
      setResults(r.results);
      setSel(new Set(r.results.map((c, i) => (!c.alreadyAdded ? i : -1)).filter((i) => i >= 0)));
    } catch (x) { setErr(errorText(x, t)); } finally { setBusy(false); }
  }
  async function add() {
    const items = results.filter((_, i) => sel.has(i)).map((c) => ({ ...c, segment: c.segment ?? ov.segments.find((x) => x.id === segment)?.label }));
    if (!items.length) return;
    try {
      const r = await api<{ added: number; skipped: number; blocked: number }>('/admin/prospecting/add', { body: { items } });
      onAdded(`${r.added} empresa(s) adicionada(s) à lista${r.skipped ? ` · ${r.skipped} já estavam` : ''}${r.blocked ? ` · ${r.blocked} pediram para não receber` : ''}.`);
      setResults((cur) => cur.map((c, i) => (sel.has(i) ? { ...c, alreadyAdded: true } : c))); setSel(new Set());
    } catch (x) { setErr(errorText(x, t)); }
  }
  return (
    <section className="panel">
      <h2>🔎 Buscar empresas</h2>
      <form className="form-grid" onSubmit={search}>
        <label>Fonte<select value={source} onChange={(e) => setSource(e.target.value as 'receita' | 'maps')}>
          <option value="receita">Receita Federal (CNPJ, e-mail e telefone)</option>
          <option value="maps" disabled={!ov.mapsEnabled}>Google Maps (telefone e site){ov.mapsEnabled ? '' : ' — falta GOOGLE_PLACES_API_KEY'}</option>
        </select></label>
        <label>Segmento<select value={segment} onChange={(e) => setSegment(e.target.value)}>{ov.segments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        {source === 'maps' && <label className="span2">Busca livre (opcional)<input value={query} placeholder="ex.: consultório odontológico zona 7" onChange={(e) => setQuery(e.target.value)} /></label>}
        <label>Cidade<input value={city} onChange={(e) => setCity(e.target.value)} required={source === 'maps'} /></label>
        {source === 'receita' && <label>UF<input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></label>}
        {source === 'receita' && <label className="check span2"><input type="checkbox" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} /> Só empresas com e-mail</label>}
        <button className="btn btn-primary span2" disabled={busy}>{busy ? t('common.wait') : 'Buscar'}</button>
      </form>
      {err && <p className="errors small">{err}</p>}
      {results.length > 0 && <>
        <p className="row gap small">
          <strong>{results.length} resultado(s)</strong>
          <button className="link-btn" onClick={() => setSel(new Set(results.map((c, i) => (!c.alreadyAdded ? i : -1)).filter((i) => i >= 0)))}>marcar todos</button>
          <button className="link-btn" onClick={() => setSel(new Set())}>desmarcar</button>
          <button className="btn btn-primary small" disabled={!sel.size} onClick={add}>Adicionar {sel.size} à lista</button>
        </p>
        <div className="table-wrap"><table className="table small">
          <thead><tr><th /><th>Empresa</th><th>E-mail</th><th>Telefone</th><th>Cidade</th></tr></thead>
          <tbody>{results.map((c, i) => (
            <tr key={i} className={c.alreadyAdded ? 'muted' : ''}>
              <td><input type="checkbox" disabled={c.alreadyAdded} checked={sel.has(i)} onChange={(e) => setSel((cur) => { const n = new Set(cur); if (e.target.checked) n.add(i); else n.delete(i); return n; })} /></td>
              <td>{c.name}{c.alreadyAdded && <span className="badge">na lista</span>}{c.website && <> · <a href={c.website} target="_blank" rel="noreferrer noopener">site</a></>}</td>
              <td>{c.email ?? '—'}{c.webmail && <span className="badge" title="E-mail pessoal: por padrão não recebe a sequência (LGPD)">pessoal</span>}</td>
              <td>{c.phone ?? '—'}</td>
              <td>{[c.city, c.uf].filter(Boolean).join('/')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>}
    </section>
  );
}

/** Lê CSV simples (vírgula ou ponto e vírgula, com cabeçalho). */
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ix = { name: col('nome', 'empresa', 'name', 'company'), email: col('mail'), phone: col('telefone', 'fone', 'phone', 'celular', 'whatsapp'), city: col('cidade', 'city'), uf: col('uf', 'estado', 'state'), segment: col('segmento', 'area', 'profiss', 'cargo', 'title') };
  return lines.slice(1).map(split).map((c, i) => ({
    source: 'csv' as const, sourceRef: undefined as string | undefined, row: i + 2,
    name: (ix.name >= 0 ? c[ix.name] : '') || (ix.email >= 0 ? c[ix.email] : '') || `Linha ${i + 2}`,
    email: ix.email >= 0 ? c[ix.email] || null : null, phone: ix.phone >= 0 ? c[ix.phone] || null : null,
    city: ix.city >= 0 ? c[ix.city] || null : null, uf: ix.uf >= 0 ? (c[ix.uf] || '').slice(0, 2) || null : null,
    segment: ix.segment >= 0 ? c[ix.segment] || null : null,
  })).filter((r) => r.email || r.phone);
}

function ImportCsv({ onAdded }: { onAdded: (m: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const rows = useMemo(() => parseCsv(text), [text]);
  async function send() {
    setErr('');
    try {
      const items = rows.map(({ row, ...r }) => ({ ...r, sourceRef: r.email ? `email:${r.email.toLowerCase()}` : `linha:${row}:${r.phone}` }));
      for (let i = 0; i < items.length; i += 1000) {
        const r = await api<{ added: number; skipped: number; blocked: number }>('/admin/prospecting/add', { body: { items: items.slice(i, i + 1000) } });
        onAdded(`Planilha: ${r.added} contato(s) adicionado(s)${r.skipped ? ` · ${r.skipped} repetidos` : ''}${r.blocked ? ` · ${r.blocked} pediram para não receber` : ''}.`);
      }
      setText('');
    } catch (x) { setErr(errorText(x, t)); }
  }
  return (
    <details className="panel">
      <summary><strong>📥 Importar planilha (LinkedIn, Facebook, Instagram, eventos)</strong></summary>
      <p className="small muted">Exporte os contatos em CSV e importe aqui: formulários de anúncio do <strong>Meta Lead Ads</strong> (Facebook e Instagram) e do <strong>LinkedIn Lead Gen</strong>, listas do <strong>Sales Navigator</strong>, de eventos ou de parceiros. Colunas reconhecidas: nome, e-mail, telefone, cidade, UF, segmento. Importe só contatos obtidos de forma legítima (formulários, cartões, contatos comerciais públicos).</p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      <textarea rows={5} placeholder="nome;email;telefone;cidade;uf&#10;Clínica X;contato@clinicax.com.br;44999990000;Maringá;PR" value={text} onChange={(e) => setText(e.target.value)} />
      {text && <p className="small">{rows.length} contato(s) com e-mail ou telefone encontrados.</p>}
      {err && <p className="errors small">{err}</p>}
      <button className="btn btn-primary small" disabled={!rows.length} onClick={send}>Importar {rows.length}</button>
    </details>
  );
}

function ProspectList() {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Prospect[]>([]);
  const [err, setErr] = useState('');
  const load = () => api<{ prospects: Prospect[] }>(`/admin/prospecting/prospects?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`)
    .then((r) => setList(r.prospects)).catch((e) => setErr(errorText(e, t)));
  useEffect(() => { load(); }, [status]);
  async function patch(id: string, body: Partial<Prospect>) {
    try { await api(`/admin/prospecting/prospects/${id}`, { method: 'PATCH', body }); load(); } catch (e) { setErr(errorText(e, t)); }
  }
  async function exportXlsx(sample?: number) {
    try {
      const url = await apiBlobUrl(`/admin/prospecting/export.xlsx?${new URLSearchParams({ ...(status ? { status } : {}), ...(sample ? { amostra: String(sample) } : {}) })}`);
      const a = document.createElement('a'); a.href = url; a.download = `captacao-spacehour-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr(errorText(e, t)); }
  }
  async function optOut(p: Prospect) {
    if (confirm(`${p.name} pediu para não receber? O telefone e o e-mail serão apagados e o contato nunca mais recebe mensagens.`)) await patch(p.id, { status: 'unsubscribed' });
  }
  return (
    <section className="panel">
      <h2>📋 Lista de captação</h2>
      <p className="small muted">O WhatsApp abre com o convite pronto, só entre 8h e 21h, um convite por pessoa e no máximo 30 por dia. Use um número só para convites. Quem responder SAIR: clique em <strong>Não quer</strong> e o contato nunca mais recebe nada (nem se for importado de novo).</p>
      <div className="row gap">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="row gap"><input placeholder="Buscar nome, e-mail ou cidade" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-outline small">Buscar</button></form>
        <button className="btn btn-outline small" disabled={!list.length} onClick={() => exportXlsx()}>Baixar Excel</button>
        <button className="btn btn-outline small" disabled={!list.length} onClick={() => exportXlsx(3)} title="Até 3 por segmento, ainda não convidados e com celular, sorteados">Amostra para convidar (3 por segmento)</button>
      </div>
      {err && <p className="errors small">{err}</p>}
      <div className="table-wrap"><table className="table small">
        <thead><tr><th>Empresa</th><th>Contato</th><th>Origem</th><th>Status</th><th>E-mails</th></tr></thead>
        <tbody>{list.map((p) => (
          <tr key={p.id} className={p.status === 'hot' ? 'hot' : ''}>
            <td>{p.name}<div className="muted">{[p.segment, [p.city, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</div></td>
            <td>{p.email ?? '—'}<div className="muted">{p.phone ?? ''}{p.phone && (p.wa_invited_at
              ? <> · convidado em {new Date(p.wa_invited_at).toLocaleDateString('pt-BR')}</>
              : <> · <a href={`/api/p/w/${p.token}`} target="_blank" rel="noreferrer noopener" onClick={() => setTimeout(load, 1500)}>Convidar no WhatsApp</a></>)}
              {p.status !== 'unsubscribed' && <> · <button className="link-btn" onClick={() => optOut(p)}>Não quer</button></>}</div></td>
            <td>{SOURCE[p.source] ?? p.source}</td>
            <td><select value={p.status} onChange={(e) => patch(p.id, { status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td>{p.last_step}/3{p.last_sent_at && <div className="muted">{new Date(p.last_sent_at).toLocaleDateString('pt-BR')}</div>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!list.length && <p className="muted small">Nenhum contato ainda. Use a busca acima ou importe uma planilha.</p>}
    </section>
  );
}

function Sequence({ ov, onChange }: { ov: Overview; onChange: () => void }) {
  const { t } = useI18n();
  const [c, setC] = useState<Config>(ov.config);
  const [info, setInfo] = useState('');
  const [preview, setPreview] = useState<Array<{ name: string; email: string; step: number }> | null>(null);
  async function save(n: Partial<Config>) {
    setInfo('');
    try { setC(await api<Config>('/admin/prospecting/config', { method: 'PUT', body: n })); onChange(); setInfo(t('common.saved')); } catch (e) { setInfo(errorText(e, t)); }
  }
  async function test(step: 1 | 2 | 3) {
    try { const r = await api<{ to: string }>('/admin/prospecting/test', { body: { step } }); setInfo(`E-mail de teste do passo ${step} enviado para ${r.to}.`); } catch (e) { setInfo(errorText(e, t)); }
  }
  async function dry() {
    try { setPreview((await api<{ wouldSend: Array<{ name: string; email: string; step: number }> }>('/admin/prospecting/run', { body: { dryRun: true } })).wouldSend ?? []); } catch (e) { setInfo(errorText(e, t)); }
  }
  return (
    <section className="panel">
      <h2>✉️ Sequência de e-mails</h2>
      <p className="small muted">3 e-mails para clínicas e empresas (passo 1 na hora, passo 2 e passo 3 depois dos intervalos abaixo), só em dias úteis das 9h às 18h, aos poucos. Quem clica vira <strong>🔥 quente</strong> e você recebe um aviso por e-mail. Todo e-mail tem descadastro em um clique, e quem se descadastra nunca mais recebe.</p>
      {ov.inviteMailbox.problem
        ? <p className="notice small">⚠️ <strong>Caixa de convites não configurada.</strong> {ov.inviteMailbox.problem} Os convites saem por uma caixa só deles (ex.: convites@space-hour.com), nunca pela caixa dos e-mails de senha e pagamento: uma denúncia de spam não derruba o sistema. Enquanto isso, nada é enviado.</p>
        : <p className="small muted">Convites saem por <strong>{ov.inviteMailbox.address}</strong> (respostas chegam nessa caixa).</p>}
      <label className="check"><input type="checkbox" checked={c.sending_enabled} onChange={(e) => save({ sending_enabled: e.target.checked })} /> <strong>Envio automático ligado</strong></label>
      <div className="form-grid">
        <label>Limite por dia<input type="number" min={1} max={200} value={c.daily_limit} onChange={(e) => setC({ ...c, daily_limit: Number(e.target.value) })} onBlur={() => save({ daily_limit: c.daily_limit })} /></label>
        <label>Passo 2 após (dias)<input type="number" min={1} max={30} value={c.step2_after_days} onChange={(e) => setC({ ...c, step2_after_days: Number(e.target.value) })} onBlur={() => save({ step2_after_days: c.step2_after_days })} /></label>
        <label>Passo 3 após o passo 2 (dias)<input type="number" min={1} max={60} value={c.step3_after_days} onChange={(e) => setC({ ...c, step3_after_days: Number(e.target.value) })} onBlur={() => save({ step3_after_days: c.step3_after_days })} /></label>
        <label className="check"><input type="checkbox" checked={c.send_to_webmail} onChange={(e) => save({ send_to_webmail: e.target.checked })} /> Enviar também para e-mails pessoais (Gmail, Hotmail…)</label>
      </div>
      <p className="muted small">Comece com 20 por dia: limites baixos protegem a reputação do domínio e evitam cair no spam.</p>
      <div className="row gap">
        {([1, 2, 3] as const).map((s) => <button key={s} className="btn btn-outline small" disabled={!!ov.inviteMailbox.problem} onClick={() => test(s)}>Testar passo {s} no meu e-mail</button>)}
        <button className="btn btn-outline small" onClick={dry}>Quem recebe na próxima rodada?</button>
      </div>
      {info && <p className="notice small">{info}</p>}
      {preview && (preview.length
        ? <ul className="small">{preview.map((p, i) => <li key={i}>{p.name} · {p.email} · passo {p.step}</li>)}</ul>
        : <p className="small muted">Ninguém na fila agora.</p>)}
    </section>
  );
}
