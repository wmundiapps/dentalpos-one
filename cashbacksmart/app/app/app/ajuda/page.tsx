import { requireRole } from '@/lib/auth';
import { botHistory } from '@/lib/services/bot';
import { Chat } from '@/components/Chat';

export const metadata = { title: 'Ajuda' };

export default async function Ajuda() {
  const { userId } = await requireRole('consumer');
  const hist = await botHistory(userId);
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Ajuda</h1>
      <Chat initial={hist.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }))} suggestions={['Qual meu saldo?', 'Como uso meu saldo?', 'Quando vence minha fatura?', 'Lojas perto de mim']} />
    </div>
  );
}
