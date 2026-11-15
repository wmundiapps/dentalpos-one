import { Shell } from "../../edu/contabil/carteira/host";
import PortalCliente from "../../edu/contabil/carteira/PortalCliente";

/** Portal do cliente da contabilidade (visão do cliente final). */
export default function EduPortalContabil() {
  return (
    <Shell title="Portal do cliente" subtitle="Guias a pagar, documentos e mensagens com o seu escritório de contabilidade." hero={false}>
      <PortalCliente />
    </Shell>
  );
}
