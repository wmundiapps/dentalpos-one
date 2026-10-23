import { requireBusiness } from '@/lib/auth';
import { botHistory } from '@/lib/services/bot';
import { Chat } from '@/components/Chat';

export const metadata = { title: 'Ajuda' };

export default async function Ajuda() {
  const { session } = await requireBusiness();
  const hist = await botHistory(session.userId);
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Ajuda</h1>
      <Chat initial={hist.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }))} suggestions={['Quanto vendi este mês?', 'Como lanço uma compra?', 'Minhas faturas', 'Campanhas disponíveis']} />
    </div>
  );
}
