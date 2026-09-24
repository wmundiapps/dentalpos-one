import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { ListingCard, type ListingSummary } from '../components/ListingCard';

export default function Favorites() {
  const { t } = useI18n();
  const [list, setList] = useState<ListingSummary[]>([]);
  useEffect(() => { api<ListingSummary[]>('/favorites').then(setList).catch(() => {}); }, []);
  async function remove(id: string) {
    await api(`/favorites/${id}`, { method: 'DELETE' }).catch(() => {});
    setList(list.filter((l) => l.id !== id));
  }
  return (
    <div className="container">
      <h1>{t('nav.favorites')}</h1>
      {list.length === 0 && <p className="muted">{t('fav.empty')}</p>}
      <div className="grid">{list.map((l) => <ListingCard key={l.id} l={l} fav onFav={() => remove(l.id)} />)}</div>
    </div>
  );
}
