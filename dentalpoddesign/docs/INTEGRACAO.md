# Integração

## Produto separado
`npm run build` gera `dist/` estático (`base: './'`): publique em qualquer hospedagem (Vercel, Netlify, S3, Nginx) na raiz ou em subpasta.
Nenhuma variável de ambiente é necessária. Dados do paciente permanecem no navegador.

## Dentalpos One (já ligado)
* `npm run build:integrado` → `dentalpoddesign/dist` copiado para `frontend/public/dentalpoddesign/` (versionado no repositório, para que o deploy do frontend funcione sem passos extras).
* Rota **`/smile-design`** (`frontend/src/pages/SmileDesign.tsx`) + item de menu *Clínico → DentalPod Design*. A página lista os pacientes do Dentalpos One e embute
  `/dentalpoddesign/index.html?embedded=1` num `<iframe>`.
* Após alterar o código do DentalPod, rode novamente `npm run build:integrado` e faça commit da pasta `frontend/public/dentalpoddesign/`.

## Protocolo `postMessage`
| Direção | Mensagem | Efeito |
|---|---|---|
| host → app | `{ type: 'dpd:init', patient: { id, name }, caseName?, clinic? }` | abre o caso existente do paciente ou cria um novo |
| app → host | `{ type: 'dpd:ready' }` | app carregado (envie `dpd:init` depois disso) |
| app → host | `{ type: 'dpd:saved', project: { id, name, patient, variants, updatedAt } }` | caso salvo (use para registrar no prontuário) |

## Evolução sugerida (backend)
Os casos ficam no IndexedDB do navegador. Para sincronizar com o servidor do Dentalpos One: na mensagem `dpd:saved` o host pode solicitar o
arquivo `.dpd` (o app já gera `exportProjectFile()`), e armazená-lo junto ao paciente (por exemplo, em *Arquivos e exames clínicos*). Também é possível
expor `buildProduction()` para enviar peças diretamente ao módulo de Laboratório.
