import type {
AIInsight,
BIIndicator,
} from "../types/businessIntelligence";

export const indicators:BIIndicator[]=[

{
id:1,
title:"Faturamento",
value:"R$ 412.800",
variation:14,
positive:true,
description:"Comparado ao mês anterior."
},

{
id:2,
title:"Novos Pacientes",
value:"86",
variation:9,
positive:true,
description:"Últimos 30 dias."
},

{
id:3,
title:"Conversão Comercial",
value:"37%",
variation:6,
positive:true,
description:"Orçamentos fechados."
},

{
id:4,
title:"Faltas",
value:"11",
variation:-18,
positive:true,
description:"Redução das faltas."
}

];

export const aiInsights:AIInsight[]=[

{
id:1,
priority:"Alta",
title:"Implantodontia caiu 18%",
description:"O número de avaliações reduziu nesta semana.",
recommendation:"A IA recomenda aumentar campanha Meta Ads em R$300 e disparar campanha de WhatsApp para pacientes interessados."
},

{
id:2,
priority:"Alta",
title:"Estoque crítico",
description:"Mini Pilar CM 3.5 possui estoque para aproximadamente 9 dias.",
recommendation:"Realizar pedido automaticamente."
},

{
id:3,
priority:"Média",
title:"Laboratório",
description:"Tempo médio aumentou 1,8 dias.",
recommendation:"Redistribuir carga entre protéticos."
},

{
id:4,
priority:"Baixa",
title:"Google",
description:"Existem 18 pacientes satisfeitos que ainda não avaliaram a clínica.",
recommendation:"Enviar convite automaticamente."
}

];