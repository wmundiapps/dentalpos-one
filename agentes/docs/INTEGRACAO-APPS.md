# Como colocar os agentes e o ícone em cada aplicativo

## Peças
1. **Ícone "Peça o seu agente"** (`widget/wmundi-agentes.js`): um arquivo, sem dependências, usa Shadow DOM (não mexe no visual do aplicativo).
2. **Núcleo** (`core/`): catálogo, barreiras, motor, créditos e auditoria. Entra no backend do aplicativo.

## Ícone em qualquer aplicativo
1. Copie `widget/wmundi-agentes.js` para a pasta pública do aplicativo (mesma origem, compatível com CSP `script-src 'self'`).
2. No HTML principal, antes de `</body>`:
```html
<script src="/wmundi-agentes.js" defer></script>
<wmundi-agentes app="NOME-DO-APLICATIVO"></wmundi-agentes>
```
3. Sem o atributo `endpoint`, o pedido sai por **WhatsApp ou e-mail** (não exige mudar CSP nem ter servidor). Com `endpoint="https://.../"`, o pedido vai para um formulário.
Atributos: `app`, `endpoint`, `whatsapp`, `email`, `posicao` (direita ou esquerda), `cor`, `rotulo`.

## Núcleo no backend
```ts
import { AGENTES, executar, llmSimulado } from '../agentes/core/index.ts'
const r = await executar({ agente: AGENTES.agenda, perfil, historico, entrada, canal: 'whatsapp', llm, ferramentas, creditos, auditoria, aprovacao })
```
- `llm`: adaptador do provedor de IA (hoje o DentalPos usa OpenAI e o REVAH usa Anthropic; o adaptador isola a troca).
- `ferramentas`: funções do aplicativo (listar horários, enviar segunda via, ...). Só as ferramentas listadas no agente podem ser chamadas.
- `creditos`: ligar ao `creditService` (tipo IA).
- `auditoria`: gravar o evento (já vem mascarado: CPF, telefone e e-mail).
- `aprovacao`: fila para o que exige decisão humana.

## Mapa de aplicativos e agentes
Veja `core/apps.ts` (23 aplicativos). Resumo: odontologia e saúde recebem os 5; escola, comércio, serviços e mobilidade recebem de 3 a 5; marketing e carreira recebem atendente, pós-atendimento e resumo.

## Passos por aplicativo
| Aplicativo | Ícone | Agentes primeiro |
|---|---|---|
| Completodonto / Gerenciador Odontológico | `frontend/` | Atendente, Agenda, Cobrança |
| REVAH | `revah/web` | Atendente, Pós-atendimento |
| SpaceHour | `espacos/web` | Atendente, Agenda |
| Páginas de venda e site | HTML | Atendente (demonstração) |
| Demais aplicativos (fora deste repositório) | copiar o arquivo e as duas linhas | conforme `apps.ts` |
