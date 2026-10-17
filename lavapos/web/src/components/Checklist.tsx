import { useState } from 'react';
import { Chip } from '../ui';

export const STATE_LABEL: Record<string, string> = { ok: 'OK', sujo: 'Sujo', risco: 'Riscado', amassado: 'Amassado', trinca: 'Trincado', quebrado: 'Quebrado', mancha: 'Manchado', rasgado: 'Rasgado', faltando: 'Faltando' };
const STATES = Object.keys(STATE_LABEL);
const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'sujo' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
const AREAS: Record<string, string> = { exterior: 'Exterior (lataria, vidros, rodas)', interior: 'Interior', pertences: 'Pertences e documentos', mecanica: 'Painel e mecânica' };

export interface CheckItem { id: string; data: { name: string; area: string } }

/** Checklist por toque: cada item tem uma barra de opções e a marcação aparece com "✕". */
export default function Checklist({ items, value, onChange, before }: { items: CheckItem[]; value: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void; before?: Record<string, string[]> }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ exterior: true });
  const toggle = (id: string, s: string) => {
    const cur = value[id] ?? [];
    let next: string[];
    if (s === 'ok') next = cur.includes('ok') ? [] : ['ok'];
    else { const w = cur.filter((x) => x !== 'ok'); next = w.includes(s) ? w.filter((x) => x !== s) : [...w, s]; }
    onChange({ ...value, [id]: next });
  };
  const allOk = (area: string) => { const v = { ...value }; for (const i of items.filter((x) => x.data.area === area)) if (!(v[i.id]?.length)) v[i.id] = ['ok']; onChange(v); };
  return (
    <div>
      {Object.entries(AREAS).map(([area, title]) => {
        const list = items.filter((i) => i.data.area === area);
        if (!list.length) return null;
        const done = list.filter((i) => value[i.id]?.length).length;
        return (
          <section key={area} className="card" style={{ padding: 0 }}>
            <button type="button" className="ghost" style={{ width: '100%', justifyContent: 'space-between', border: 0 }} onClick={() => setOpen({ ...open, [area]: !open[area] })}>
              <b>{title}</b><span className="muted small">{done}/{list.length} {open[area] ? '▲' : '▼'}</span>
            </button>
            {open[area] && (
              <div style={{ padding: '0 14px 12px' }}>
                <button type="button" className="sm" onClick={() => allOk(area)}>✓ Marcar o que falta como OK</button>
                {list.map((i) => (
                  <div className="check-row" key={i.id}>
                    <b>{i.data.name}{before?.[i.id]?.some((s) => s !== 'ok') && <span className="muted small"> · na entrada: {before[i.id]!.map((s) => STATE_LABEL[s]).join(', ')}</span>}</b>
                    <div className="chips">{STATES.map((s) => <Chip key={s} on={!!value[i.id]?.includes(s)} tone={tone(s)} onClick={() => toggle(i.id, s)}>{STATE_LABEL[s]}</Chip>)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
