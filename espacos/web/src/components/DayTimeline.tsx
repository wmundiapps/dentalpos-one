import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { toMinutes } from '../../../shared/rules';
import type { TimeRange } from '../../../shared/types';

const FROM = 6 * 60;
const TO = 23 * 60;
const pct = (m: number) => `${((m - FROM) / (TO - FROM)) * 100}%`;

// Linha do tempo do dia: janelas ociosas (verde), ocupado (cinza) e seleção.
export function DayTimeline({ listingId, date, selection }: { listingId: string; date: string; selection?: TimeRange }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ busy: TimeRange[]; windows: TimeRange[]; blocked: boolean; bufferMinutes: number } | null>(null);
  useEffect(() => {
    if (!date) return;
    api<typeof data>(`/listings/${listingId}/busy?date=${date}`).then(setData).catch(() => setData(null));
  }, [listingId, date]);
  if (!date || !data) return null;
  return (
    <div className="timeline" aria-label={t('timeline.label')}>
      <div className="timeline-bar">
        {!data.blocked && data.windows.map((w, i) => <span key={i} className="tl-free" style={{ left: pct(toMinutes(w.start)), width: `calc(${pct(toMinutes(w.end))} - ${pct(toMinutes(w.start))})` }} title={`${w.start}–${w.end}`} />)}
        {data.busy.map((b, i) => <span key={i} className="tl-busy" style={{ left: pct(toMinutes(b.start) - data.bufferMinutes), width: `calc(${pct(toMinutes(b.end) + data.bufferMinutes)} - ${pct(toMinutes(b.start) - data.bufferMinutes)})` }} title={`${b.start}–${b.end}`} />)}
        {selection && toMinutes(selection.end) > toMinutes(selection.start) && <span className="tl-sel" style={{ left: pct(toMinutes(selection.start)), width: `calc(${pct(toMinutes(selection.end))} - ${pct(toMinutes(selection.start))})` }} />}
      </div>
      <div className="timeline-scale small muted"><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      <div className="small muted legend">
        <span><i className="lg-free" /> {t('timeline.free')}</span> <span><i className="lg-busy" /> {t('timeline.busy')}</span>
        {data.blocked && <strong> · {t('timeline.blocked')}</strong>}
      </div>
    </div>
  );
}
