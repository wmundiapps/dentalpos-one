import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/hooks';
import { Empty } from '../components/ui';

export function NotFound() {
  usePageTitle('Página não encontrada');
  return (
    <Empty icon="🧭" title="Página não encontrada">
      O endereço pode estar errado ou a página mudou de lugar. <Link to="/compra">Ir para a vitrine</Link> ou <Link to="/venda">anunciar grátis</Link>.
    </Empty>
  );
}
