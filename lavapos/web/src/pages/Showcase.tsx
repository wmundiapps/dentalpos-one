import { api } from '../api';
import { Badge, Card, Loading, Page, PrivatePhoto, useAction, useLoad } from '../ui';
import { useMe } from '../App';

export default function Showcase() {
  const { me } = useMe(); const list = useLoad<any[]>('/showcase'); const [run] = useAction();
  const link = `${location.origin}/l/${me.tenant?.slug}`;
  return (
    <Page title="Antes e depois" sub="Fotos em destaque na página pública do seu lava-rápido">
      <div className="alert info">Para publicar: abra uma ordem <b>entregue</b>, vá em “Publicar no antes e depois”. Só aparece quando o cliente autorizou no check-in e a placa está coberta. Sua página: <a href={link} target="_blank" rel="noreferrer">{link}</a></div>
      {!list.data ? <Loading error={list.error} /> : list.data.length === 0 ? <p className="muted">Nada publicado ainda.</p> : <div className="grid g2">{list.data.map((s) => (
        <Card key={s.id} title={s.data.title} right={s.data.published ? <Badge tone="ok">publicado</Badge> : <Badge>oculto</Badge>}>
          <div className="ba"><figure><PrivatePhoto id={s.data.beforePhotoId} alt="Antes" /><figcaption>Antes</figcaption></figure><figure><PrivatePhoto id={s.data.afterPhotoId} alt="Depois" /><figcaption>Depois</figcaption></figure></div>
          {s.data.published && <button className="sm" style={{ marginTop: 8 }} onClick={async () => { await run(() => api(`/showcase/${s.id}/unpublish`, { body: {} }), 'Foto retirada do ar.'); await list.reload(); }}>Retirar do ar</button>}
        </Card>))}</div>}
    </Page>
  );
}
