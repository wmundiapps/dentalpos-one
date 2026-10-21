# Modelo obrigatório de cada vídeo-tutorial

Escreva em português do Brasil, linguagem simples, frases curtas, sem jargão técnico (se usar um termo técnico, explique em uma frase). O leitor é dentista, recepcionista ou dono de clínica que nunca usou o sistema. O texto será lido em voz alta num avatar (HeyGen) e publicado no YouTube, Instagram e TikTok.

Use EXATAMENTE esta estrutura para cada vídeo (um bloco por vídeo, na ordem do catálogo):

---
## VNN — Título do vídeo (use o título do catálogo)
**Duração sugerida:** X a Y minutos · **Onde fica no sistema:** Menu > Grupo > Item (e as abas/seções internas)

### Roteiro para narrar
(texto corrido, em tom de conversa, dividido em cenas curtas: "Cena 1 — ...", "Cena 2 — ...". Comece dizendo o nome do vídeo e para que serve. Passo a passo de uso como se estivesse mostrando a tela: "toque em...", "preencha...". Termine com um resumo de 3 itens e a chamada para o próximo vídeo.)

### Ficha rápida
- **O que faz:**
- **Como aplicar (passo a passo):** (lista numerada, 4 a 8 passos)
- **Com que frequência usar:**
- **Quem tem acesso:** (por departamento/perfil e permissão; se o gestor pode liberar ou bloquear em Permissões)
- **Com que frequência precisa ser alimentado:**
- **O que acontece se não for alimentado:** (consequências reais no sistema, incluindo avisos, bloqueios e relatórios que ficam errados)
- **Onde impacta (interação com outros itens):** (liste cada módulo que lê ou depende desses dados)
- **Erros comuns e dicas:**

### Abas e seções deste item
(uma subseção curta para CADA aba, botão principal ou seção interna da tela: o que é, como usar, quando usar. Se a tela não tiver abas, descreva cada bloco da tela.)

### Trilha de vídeos
- **Assistir antes:** (códigos e títulos do catálogo; para cada um, uma frase: "por que ajuda"; diga "nenhum" se for o primeiro da trilha)
- **Assistir depois:** (próximos 1 a 3 vídeos recomendados, com o motivo)
- **Onde encontrar:** (dentro do sistema, no ícone de vídeo no canto da tela de cada item; e na playlist com o mesmo título)

### Texto para publicar (YouTube, Instagram e TikTok)
(título curto + descrição de 2 a 3 linhas + 5 hashtags; não cite estratégia de preços, promoções nem acadêmicos gratuitos)
---

Regras de conteúdo:
1. NÃO invente funções. Leia o código da tela (frontend/src/pages/..., frontend/src/components/..., backend/src/controllers e services ligados) e descreva só o que existe. Se algo for incerto, escreva "(conferir na tela antes de gravar)".
2. "Quem tem acesso" deve vir de frontend/src/config/menuAccess.ts, das permissões do backend (requirePermission nas rotas em backend/src/routes/index.ts) e de frontend/src/pages/Permissions.tsx. Perfis do sistema: Gestor, Recepção, Dentista, Auxiliar, Financeiro, Laboratório, Administração (e o Administrador, que vê tudo).
3. "O que acontece se não for alimentado" deve citar os efeitos reais: pendências e avisos vermelhos, travamento por departamento, e-mails ao gestor, listas de retorno de pacientes, relatórios e indicadores que ficam incompletos.
4. Não cite nem exponha: promoções, preços de planos, estratégia para acadêmicos, Prospecção (uso interno), Parceiros de estoque (equipe), Design e CAD/CAM.
5. Não rode comandos git. Escreva apenas os arquivos pedidos em /home/user/dentalpos-one/docs/tutoriais/.
6. Ao terminar, responda com UMA linha: o nome dos arquivos criados e quantos vídeos contêm.
