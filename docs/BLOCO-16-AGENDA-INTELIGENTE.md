# Bloco 16 — Agenda Inteligente

## Objetivo

Transformar a agenda em um assistente operacional que confira se o tempo reservado e a previsão de retorno fazem sentido frente ao procedimento, ao laboratório, ao histórico de recorrência do paciente e ao plano financeiro.

## Regras implementadas

1. **Tempo clínico configurável** — regras por palavras-chave de procedimento definem duração sugerida, retorno mínimo e janela máxima.
2. **Complexidade por procedimento** — a clínica pode cadastrar tempos diferentes para implante unitário, múltiplos implantes/protocolo, extração simples, raiz residual, dente incluso, ortodontia, prótese etc.
3. **Laboratório** — cada laboratório pode ter prazo de produção e margem de segurança próprios. Exemplo: 15 + 6 dias = retorno a partir de 21 dias.
4. **Mesmo dia da semana** — o sistema identifica o dia do atendimento anterior e tenta manter o paciente no mesmo dia da semana, desde que isso permaneça dentro da janela clínica.
5. **Plano financeiro** — usa quantidade de parcelas e sessões estimadas restantes para calcular uma cadência administrativa de 7, 14, 21 ou 30 dias. Essa cadência é exibida como alternativa somente quando cabe dentro da janela clínica.
6. **Pendência financeira** — parcelas vencidas geram alerta para a equipe financeira, mas não bloqueiam nem alteram a indicação clínica.
7. **Alertas de agenda** — avisa quando o tempo reservado é inferior ao recomendado, quando a data atual se afasta da recomendação gravada na consulta anterior e quando o paciente muda do dia habitual.
8. **Próximo retorno** — a consulta passa a guardar a recomendação calculada e oferece ação para abrir um novo agendamento já pré-preenchido.

## Persistência da configuração

A configuração usa a infraestrutura já existente de `TenantFeatureFlag` com a chave `SMART_SCHEDULING`. Quando o usuário não possui acesso à API ou o backend está indisponível, o frontend mantém um fallback em `localStorage` para não interromper a Alpha.

## Segurança assistencial

- O sistema **sugere**, não bloqueia.
- Prazo clínico e laboratório têm prioridade sobre o financeiro.
- A agenda não deve atrasar urgência, pós-operatório ou qualquer retorno clinicamente necessário para acompanhar uma parcela.
- Os tempos padrão são exemplos iniciais editáveis pela clínica.
