# Conteúdo + Biblioteca — Guia de Integração

## 1. Onde colocar

```
backend/
  prisma/schema.prisma      <- cole schema-conteudo.prisma no final
                                (depois de academico e financeiro)
  src/modules/conteudo/
    validators.ts
    content.ts
    flashcards.ts
    library.ts
    routes.ts
```

Mesmos 2 ajustes dos módulos anteriores (caminho do Prisma client;
`middleware.ts` reaproveitado de `../academico/middleware`).

```powershell
npx prisma migrate dev --name conteudo_biblioteca
npx prisma generate
```

```ts
// src/app.ts
import conteudoRouter from './modules/conteudo/routes';
app.use('/api/conteudo', conteudoRouter);
```

## 2. Sobre a correção do Flashcard

O módulo anterior (Núcleo Acadêmico) colocou `intervalo`, `fatorFacilidade`
e `proximaRevisao` direto no model `Flashcard` — isso funcionaria só se
existisse um aluno por cartão, o que não é o caso. A partir de agora, o
estado de revisão vive em `StudentFlashcardState` (um registro por par
aluno+cartão). Os 3 campos antigos em `Flashcard` ficam órfãos — pode
removê-los numa migração futura, sem pressa, ou já remover agora se
preferir (nenhum código deste módulo os usa).

## 3. Fluxo de exemplo

```bash
# Professor sobe um vídeo de aula
POST /api/conteudo/content
{ "disciplineId": "...", "tipo": "VIDEO", "titulo": "Aula 4 — Farmacocinética", "urlArquivo": "https://..." }

# Professor cria um resumo de aula (texto direto, sem arquivo)
POST /api/conteudo/content
{ "disciplineId": "...", "tipo": "RESUMO", "titulo": "Resumo — Farmacocinética", "resumoTexto": "..." }

# Aluno lista o conteúdo da disciplina (já vem com o progresso dele)
GET /api/conteudo/disciplines/{disciplineId}/content

# Aluno marca que assistiu 100% do vídeo
POST /api/conteudo/content/{contentItemId}/progress
{ "percentualAssistido": 100, "concluido": true }

# Coordenação vê o engajamento da turma com o conteúdo
GET /api/conteudo/disciplines/{disciplineId}/content/progress-resumo

# Professor cria flashcards a partir de um conteúdo
POST /api/conteudo/flashcards
{ "contentItemId": "...", "pergunta": "O que é meia-vida plasmática?", "resposta": "..." }

# Aluno pega os cartões que precisa revisar hoje
GET /api/conteudo/flashcards/due?disciplineId=...

# Aluno responde um cartão (qualidade 0-5, escala SM-2) e o algoritmo
# decide quando ele volta a aparecer
POST /api/conteudo/flashcards/{id}/review
{ "qualidade": 4 }

# Instituição cadastra um provedor de biblioteca terceirizado
POST /api/conteudo/library/providers
{ "nome": "Minha Biblioteca", "tipoAcesso": "ADESAO_INDIVIDUAL", "urlAcesso": "https://...", "custoMensal": 19.90 }

# Aluno adere — se for adesão individual com custo, já nasce uma cobrança
# no financeiro automaticamente (mesma base, sem reimplementar nada lá)
POST /api/conteudo/library/subscribe
{ "libraryProviderId": "..." }

# Aluno vê as próprias assinaturas de biblioteca
GET /api/conteudo/library/my
```

## 4. Próximo módulo na fila

Provas com correção por IA — é o que depende deste módulo e do Núcleo
Acadêmico ao mesmo tempo (usa o conteúdo pra gerar questões e a turma pra
saber quem faz a prova). Seguindo pra ele.
