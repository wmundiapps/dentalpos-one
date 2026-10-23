import { activeNotices } from '@/lib/services/security';

const LABEL: Record<string, string> = { info: 'Aviso', maintenance: 'Manutenção', update: 'Atualização', incident: 'Instabilidade' };

export async function Notices({ audience }: { audience: 'consumer' | 'business' | 'admin' }) {
  const list = await activeNotices(audience).catch(() => []);
  if (!list.length) return null;
  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      {list.map((n) => (
        <p key={n.id} className={`alert ${n.kind === 'incident' || n.kind === 'maintenance' ? 'warn' : 'info'}`} role="status">
          <strong>{LABEL[n.kind]}:</strong> {n.message.replace(/^\[auto\] /, '')}
        </p>
      ))}
    </div>
  );
}
