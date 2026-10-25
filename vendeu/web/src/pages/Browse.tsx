import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, usePageTitle } from '../lib/hooks';
import { CATEGORIES, CONDITIONS, CONDITION_LABEL, type Condition, type Operation } from '@shared/catalog';
import { Empty, ErrorState, ListingCard, Loading, Pager, PromiseStrip, type ListingCardData } from '../components/ui';
import { MoneyField, SelectField, TextField } from '../components/fields';
import { centsToMasked, moneyToCents, STATES } from '../lib/format';

interface Resp { items: ListingCardData[]; total: number; page: number; pageSize: number }
interface Groups { groups: { token: string; label: string; activeCount: number }[] }

export function Browse({ operation }: { operation: Operation }) {
  const [sp, setSp] = useSearchParams();
  const isRent = operation === 'locacao';
  const condition: Condition = (CONDITIONS as readonly string[]).includes(sp.get('condicao') ?? '') ? (sp.get('condicao') as Condition) : 'novo';
  const category = sp.get('categoria') ?? '';
  const group = sp.get('grupo') ?? '';
  const q = sp.get('q') ?? '';
  const city = sp.get('cidade') ?? '';
  const uf = sp.get('uf') ?? '';
  const min = sp.get('min') ?? '';
  const max = sp.get('max') ?? '';
  const sort = sp.get('ordem') ?? 'recent';
  const page = Math.max(1, Number(sp.get('pagina') ?? 1) || 1);

  usePageTitle(`${isRent ? 'Locação' : 'Compra'} de ${CONDITION_LABEL[condition].toLowerCase()}`);

  const [f, setF] = useState({ city, uf, min: min ? centsToMasked(Number(min)) : '', max: max ? centsToMasked(Number(max)) : '' });
  useEffect(() => { setF({ city, uf, min: min ? centsToMasked(Number(min)) : '', max: max ? centsToMasked(Number(max)) : '' }); }, [city, uf, min, max]);

  const [qLocal, setQLocal] = useState(q);
  useEffect(() => setQLocal(q), [q]);
  const timer = useRef<number | undefined>(undefined);

  const set = (patch: Record<string, string | undefined>, keepPage = false) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!keepPage) n.delete('pagina');
    setSp(n, { replace: true });
  };

  const list = useAsync(() => api.get<Resp>('/listings', {
    operation, condition, category: category || undefined, group: group || undefined, q: q || undefined, city: city || undefined,
    state: uf || undefined, min: min || undefined, max: max || undefined, sort, page,
  }), [operation, condition, category, group, q, city, uf, min, max, sort, page]);
  const groups = useAsync(() => api.get<Groups>('/outros/groups', { condition }), [condition], { enabled: category === 'outros' });

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    set({ cidade: f.city.trim(), uf: f.uf, min: f.min ? String(moneyToCents(f.min)) : '', max: f.max ? String(moneyToCents(f.max)) : '' });
  };
  const hasFilters = !!(q || city || uf || min || max || group);
  const unit = isRent ? 'de aluguel' : 'à venda';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{isRent ? 'Alugue' : 'Compre'} {CONDITION_LABEL[condition].toLowerCase()}</h1>
          <p className="muted">{isRent ? 'Imóveis, carros e objetos para alugar perto de você.' : 'Produtos novos e usados de vendedores da sua região.'}</p>
        </div>
        <Link to="/venda/anunciar" className="btn btn-accent">Anunciar</Link>
      </div>
      <PromiseStrip />

      <div className="segmented" role="group" aria-label="Condição do produto">
        {CONDITIONS.map((c) => (
          <button key={c} type="button" aria-pressed={c === condition} className={c === condition ? 'on' : ''} onClick={() => set({ condicao: c, grupo: undefined })}>
            {CONDITION_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>Novos e usados ficam separados para você não se confundir.</p>

      <div className="chips" role="group" aria-label="Categorias">
        <button type="button" className={`chip${!category ? ' on' : ''}`} aria-pressed={!category} onClick={() => set({ categoria: undefined, grupo: undefined })}>Todas</button>
        {CATEGORIES.map((c) => (
          <button key={c.slug} type="button" className={`chip${category === c.slug ? ' on' : ''}`} aria-pressed={category === c.slug} onClick={() => set({ categoria: c.slug, grupo: undefined })}>
            <span aria-hidden="true">{c.icon}</span> {c.label}
          </button>
        ))}
      </div>

      {category === 'outros' && (
        <div className="outros-box">
          <p className="small muted">A categoria <strong>Outros</strong> cria grupos automaticamente quando um produto se repete (por exemplo, várias bicicletas).</p>
          {groups.loading ? <span className="small muted">Carregando grupos…</span> : groups.data && groups.data.groups.length > 0 ? (
            <div className="chips" role="group" aria-label="Grupos de Outros">
              {groups.data.groups.map((g) => (
                <button key={g.token} type="button" className={`chip chip-sm${group === g.token ? ' on' : ''}`} aria-pressed={group === g.token} onClick={() => set({ grupo: group === g.token ? undefined : g.token })}>
                  {g.label} ({g.activeCount})
                </button>
              ))}
            </div>
          ) : <span className="small muted">Ainda não há grupos para {CONDITION_LABEL[condition].toLowerCase()}.</span>}
        </div>
      )}

      <form className="filters" onSubmit={applyFilters} aria-label="Filtros">
        <TextField label="Buscar" value={qLocal} onChange={(e) => { const v = e.target.value; setQLocal(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => set({ q: v.trim() }), 450); }} placeholder="Ex.: sofá, bicicleta" maxLength={80} />
        <TextField label="Cidade" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Ex.: São Paulo" maxLength={80} />
        <SelectField label="UF" value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })}>
          <option value="">Todas</option>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </SelectField>
        <MoneyField label="Preço mínimo" value={f.min} onChange={(v) => setF({ ...f, min: v })} />
        <MoneyField label="Preço máximo" value={f.max} onChange={(v) => setF({ ...f, max: v })} />
        <SelectField label="Ordenar por" value={sort} onChange={(e) => set({ ordem: e.target.value === 'recent' ? undefined : e.target.value })}>
          <option value="recent">Mais recentes</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
        </SelectField>
        <div className="filters-actions">
          <button className="btn btn-primary" type="submit">Aplicar filtros</button>
          {hasFilters && <button type="button" className="btn btn-outline" onClick={() => setSp(new URLSearchParams({ condicao: condition, ...(category ? { categoria: category } : {}) }), { replace: true })}>Limpar</button>}
        </div>
      </form>

      {list.loading && !list.data ? <Loading label="Buscando anúncios…" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data && (
        <>
          <p className="muted small" aria-live="polite">{list.data.total} {list.data.total === 1 ? 'anúncio' : 'anúncios'} {unit}</p>
          {list.data.items.length === 0 ? (
            <Empty icon="📭" title="Nenhum anúncio encontrado">
              Tente outra categoria ou limpe os filtros. {condition === 'novo' ? 'Veja também os ' : 'Veja também os '}
              <button className="linklike" onClick={() => set({ condicao: condition === 'novo' ? 'usado' : 'novo' })}>{CONDITION_LABEL[condition === 'novo' ? 'usado' : 'novo']}</button>.
            </Empty>
          ) : (
            <div className="grid">{list.data.items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          )}
          <Pager page={list.data.page} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => { set({ pagina: p > 1 ? String(p) : undefined }, true); window.scrollTo(0, 0); }} />
        </>
      )}
    </div>
  );
}
