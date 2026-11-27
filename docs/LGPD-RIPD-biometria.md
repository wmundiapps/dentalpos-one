# RIPD específico — Biometria facial (presença e controle de acesso)

> **Modelo de apoio, não é parecer jurídico.** Preencher e validar com o encarregado (DPO) e advogado da instituição antes de ativar a biometria. Base: LGPD, art. 5º, II e XVII; art. 6º; art. 11; art. 14 (menores); art. 18; art. 38. Complementa `LGPD-RIPD-modelo.md`. Código: `backend/src/modules/presenca/`.

| Campo | Conteúdo |
|---|---|
| Controladora | [instituição, CNPJ] |
| Encarregado (DPO) | [nome, contato] |
| Operadora | WMundi (EduMaster Pro) — ver `LGPD-CONTRATO-DPA-modelo.md` |
| Versão / data | [v1.0, dd/mm/aaaa] · próxima revisão: a cada 12 meses ou mudança de modelo/câmera |

## 1. O que é tratado
- **Dado pessoal sensível (art. 5º, II): dado biométrico.** Um *template facial*: vetor de 128 números (embedding) calculado **no aparelho do próprio titular ou no tablet/celular do quiosque**, por modelo de visão computacional executado no navegador. O vetor não permite reconstruir a foto de forma prática, mas **continua sendo dado biométrico** e é tratado como tal.
- **Não é guardado:** foto, vídeo ou qualquer imagem do rosto. A câmera é processada no navegador; só o vetor trafega. (Verificável: `PreTemplateFacial` não tem campo de imagem.)
- Metadados: data/hora de presença/acesso, resultado da comparação, distância, dispositivo. Log sem vetor (`PreLogBiometrico`).
- Titulares: alunos (inclui menores de 18 anos), docentes e colaboradores que optarem.

## 2. Finalidades (restritas) e vedações
| Permitido | Vedado (o sistema não implementa e a instituição não deve fazer) |
|---|---|
| Registrar presença/atraso/saída em aulas | Vigilância contínua, monitoramento de comportamento ou localização |
| Controlar entrada e saída de laboratórios, biblioteca e espaços | Avaliação de desempenho, reconhecimento de emoções, perfilamento |
| Identificar quem retira/devolve livros, materiais e equipamentos | Marketing, uso comercial, venda ou compartilhamento com terceiros |
| | Uso do template em outra instituição ou sistema |

## 3. Base legal
**Consentimento específico e destacado** do titular (art. 11, I) — finalidade `BIOMETRIA_FACIAL` no módulo LGPD, com texto versionado e hash, canal (portal/presencial), registro de quem coletou, IP/UA em hash e **revogação a qualquer momento**. Para menores de 18 anos o cadastro só é aceito com **consentimento do responsável legal** (art. 14, §1º), exigido pelo sistema.
Não se usa "legítimo interesse" nem "execução de contrato" como base para dado sensível (art. 11 não os admite). A presença em si pode ser exigida por norma acadêmica; **a biometria, não** — por isso há sempre alternativa.

## 4. Necessidade, proporcionalidade e alternativa obrigatória
- **A biometria é opcional.** Quem não consentir (ou revogar) usa, sem prejuízo: **QR da carteirinha**, **código** ou **lista manual com justificativa**. As telas de quiosque oferecem os três caminhos com o mesmo destaque.
- Minimização (art. 6º, III): 1 a 5 amostras por pessoa; sem imagem; vetor cifrado; comparação restrita ao tenant; nada é compartilhado.
- Em turma, só é computada presença de aluno **matriculado**; reconhecimento de alguém fora da turma é recusado.

## 5. Ciclo de vida, retenção e exclusão
| Evento | Efeito |
|---|---|
| Revogação (portal, secretaria ou Central LGPD) | Templates **excluídos imediatamente**; consentimento fica REVOGADO (prova mantida, art. 8º, §2º); credencial QR/código permanece |
| Consentimento revogado por outro caminho | Template **deixa de participar da comparação na hora** e é removido pelo job `presenca:expurgo-biometria` |
| Desligamento (aluno CANCELADO/DESISTENTE/FORMADO/CONCLUIDO; usuário inativo) | Template excluído pelo job |
| Sem uso por 365 dias (configurável, mín. 30) | Template excluído pelo job |
| Logs de reconhecimento/acesso | Retenção 90 dias (configurável, mín. 30), depois expurgados |
| Presenças consolidadas (frequência) | Mantidas pelo prazo do acervo acadêmico (art. 16, I), **sem dado biométrico** |
Pedidos do titular (art. 18): acesso/portabilidade (pacote LGPD informa metadados, **sem exportar o vetor**), eliminação (template = `ELIMINAR` no catálogo) e revogação. Prazo de 15 dias pelo módulo LGPD.

## 6. Segurança
- Template cifrado **AES-256-GCM** com o cofre do módulo Segurança (`SECURITY_ENC_KEY`), **amarrado ao tenant e à pessoa** (outra linha/instituição não decifra; adulteração é detectada).
- Cliente envia **somente o vetor** (HTTPS). Servidor valida dimensão/faixa, compara por distância euclidiana (limiar 0,5, configurável 0,2–0,7) e exige margem para o 2º colocado (evita falsa identificação por semelhança).
- **Liveness básico** (desafio de piscar ou mover a cabeça, nonce de uso único com expiração de 60 s, avaliado por amostras/amplitude). **Limite:** é uma checagem feita no cliente; não substitui detector de ataque de apresentação (PAD) certificado. Mitiga foto estática simples; **não garante** contra vídeo ou máscara.
- Limite de tentativas: após N falhas (padrão 5; 4 nos testes) o operador/dispositivo é bloqueado por alguns minutos, com alerta crítico.
- Acesso: apenas coordenação/secretaria consultam status; toda consulta administrativa gera **log de acesso a dado sensível** (`LgpAcessoSensivel`) e auditoria. Ninguém lê o vetor pela API.
- Multi-tenant: tudo filtrado por `tenantId`; testado.

## 7. Riscos e medidas
| Risco | Prob. | Impacto | Medida | Residual |
|---|---|---|---|---|
| Vazamento do banco expõe templates | Baixa | Alto | Cifra AES-GCM com chave fora do banco; sem imagens; chave rotacionável (`SECURITY_ENC_KEY`) | Médio |
| Uso para finalidade diversa | Baixa | Alto | Finalidade restrita no termo; sem endpoints de busca por rosto fora de presença/acesso/empréstimo; auditoria | Baixo |
| Falso positivo (alguém marcado por outro) | Média | Médio | Limiar rígido, margem de ambiguidade, restrição à turma, correção manual com trilha | Médio |
| Falso negativo / viés por modelo ou câmera | Média | Médio | Alternativas sem biometria; ajuste de limiar; **teste de campo obrigatório** com a população real | Médio |
| Fraude (foto/vídeo) | Média | Médio | Liveness básico + supervisão do professor/portaria; QR como alternativa | Médio |
| Consentimento forçado | Baixa | Alto | Alternativa igual e sem prejuízo; texto claro; revogação em 1 clique | Baixo |
| Menor sem autorização do responsável | Baixa | Alto | Bloqueio automático do cadastro sem responsável | Baixo |
| Retenção excessiva | Baixa | Médio | Jobs de expurgo (consentimento, desligamento, desuso, logs) | Baixo |

## 8. Parecer
[ ] Aprovado para uso piloto em [turmas/espaços] por [prazo]. [ ] Aprovado com condições: [...]. [ ] Não aprovado.
Responsáveis: [DPO] · [Direção] · [Jurídico] · [TI]. Data: [__/__/____]

## 9. Pendências antes de produção
1. Revisão jurídica do termo (`BIOMETRIA_FACIAL`) e do aviso no cadastro; publicar a versão da instituição se for diferente do modelo.
2. Piloto com medição de taxa de falsa aceitação/rejeição na população e nos equipamentos reais; ajustar `limiarDistancia`.
3. Definir quem pode operar quiosques e treinar docentes sobre a alternativa sem biometria.
4. Se houver transferência internacional de infraestrutura (nuvem), registrar no ROPA.
