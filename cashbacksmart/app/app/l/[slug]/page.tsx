import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leadPage } from '@/lib/services/leads';
import { LeadForm } from './LeadForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await leadPage((await params).slug);
  return { title: p ? p.title : 'Oferta', description: p?.offer?.slice(0, 150) };
}

/** Página de captação: oferta + formulário curto (nome e WhatsApp) */
export default async function Lead({ params }: { params: Promise<{ slug: string }> }) {
  const p = await leadPage((await params).slug, true);
  if (!p) notFound();
  return (
    <main className="auth">
      <div className="card" style={{ maxWidth: 520 }}>
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        {p.business_name && (
          <p className="muted" style={{ margin: '0 0 4px' }}>
            {p.business_name}
            {p.city ? ` · ${p.neighborhood ? p.neighborhood + ', ' : ''}${p.city}/${p.state}` : ''}
          </p>
        )}
        <h1 style={{ marginTop: 0 }}>{p.title}</h1>
        <p style={{ whiteSpace: 'pre-line' }}>{p.offer}</p>
        {p.active ? <LeadForm slug={p.slug} question={p.question} storeName={p.business_name} /> : <p className="alert warn">Esta oferta foi encerrada.</p>}
      </div>
    </main>
  );
}
