# DentalPos One — Demo Comercial / Early Access

Bloco comercial preparado para disponibilizar módulos do DentalPos One gradualmente a clientes reais, com prazo de demonstração controlado pelo backend.

## Versão inicial
- Agenda
- Pacientes
- Agendamento online
- 1 profissional
- 30 dias de demo por padrão
- 7 dias de segurança em somente leitura
- bloqueio posterior sem exclusão automática dos dados
- conversão para plano pago mantendo o mesmo tenant e banco

## Provisionamento
O cliente acessa `/dentalposone/demo`, cadastra a clínica e recebe:
- ID da clínica
- e-mail
- senha escolhida
- link de login
- link de agendamento online
- data final da demo

## Segurança
A trava de módulos e de expiração é aplicada no backend antes do bypass de administrador. Ocultar menu no frontend é apenas uma camada adicional de UX.
