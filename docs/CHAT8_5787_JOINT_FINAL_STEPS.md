# DentalPos One 5787 — passos finais conjuntos

Este arquivo existe para evitar uma sequência interminável de comandos.

## Etapa A — uma única execução no PowerShell

1. Baixar para a mesma pasta:
   - `APLICAR-DENTALPOS-ONE-5787-FINAL-V2.ps1`
   - `DENTALPOS-ONE-5787-FINAL-V2.zip`
2. Executar **um** comando:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\APLICAR-DENTALPOS-ONE-5787-FINAL-V2.ps1"
```

O script:
- encontra a cópia local do repositório;
- exige a branch `chat8-5787-integracao`;
- não toca `main`;
- faz backup dos arquivos alterados;
- aplica o payload final;
- roda `git diff --check`;
- compila backend;
- compila frontend;
- cria um único commit;
- envia um único push;
- restaura os arquivos tocados se qualquer validação falhar.

O script **não**:
- executa migration;
- executa `db push`;
- executa `migrate dev`;
- executa reset;
- lê ou imprime segredos;
- envia `.env.local` ao Git.

## Etapa B — Chat 8 valida remotamente

Depois do push, o Chat 8 verifica:
- SHA da PR #1;
- mergeabilidade;
- preview frontend/backend no Vercel;
- `/health`;
- `/ready`;
- logs;
- se o frontend está apontando para a API correta.

Não há novo comando de build nesta etapa.

## Etapa C — banco sem terminal

Abrir `Homologação e Segurança` no DentalPos One. A tela faz inspeção **somente leitura** do schema e mostra:
- tabelas 5787 ausentes;
- colunas 5787 ausentes;
- presença/ausência de `_prisma_migrations`.

Com esse resultado, o Chat 8 define a migração única e controlada. Não executar migrations antes desse diagnóstico.

## Etapa D — Vercel, somente se a validação apontar necessidade

No frontend:
- `VITE_API_URL` pode sobrescrever o destino; se não estiver definido, o build Vercel usa fallback seguro: preview da branch 5787 aponta para o backend preview da mesma branch e `main` aponta para o backend de produção. Nunca usa `localhost` em build Vercel.

No backend:
- `CORS_ORIGIN` continua sendo a fonte principal. O backend também reconhece apenas os aliases Vercel oficiais do frontend DentalPos necessários ao piloto, sem liberar `*.vercel.app` genericamente.

Nenhum segredo deve ser colado no chat.

## Etapa E — GitHub

Quando todos os gates estiverem verdes:
- revisar a PR #1;
- fazer merge em `main` uma única vez.

Sem push direto na `main`.
