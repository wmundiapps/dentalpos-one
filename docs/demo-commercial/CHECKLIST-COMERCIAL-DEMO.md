# Checklist comercial — Demo DentalPos One

## Entrada do cliente
- Enviar `https://www.wmundi.com/dentalposone/demo`.
- Confirmar que o cliente entendeu que a demo é gratuita e temporária.
- Registrar internamente nome da clínica, contato e data final da demo.
- Cliente ou equipe DentalPos conclui o cadastro.
- Salvar o arquivo de credenciais gerado pela página somente em local seguro.

## Links entregues automaticamente
- Login: `https://www.wmundi.com/dentalposone/`
- Cadastro Demo: `https://www.wmundi.com/dentalposone/demo`
- Agendamento do paciente: `https://www.wmundi.com/dentalposone/agendamento-online?clinicId=ID_DA_CLINICA`

## Durante a demo
- Dia 15 restante: contato de experiência e identificação de necessidades.
- Dia 7 restante: apresentar módulos disponíveis e proposta de continuidade.
- Dia 3 restante: reforçar data de encerramento.
- Dia 1 restante: confirmar decisão comercial.
- Liberar novos módulos por clínica somente quando estiverem homologados.

## Conversão
No backend:
`npm run demo:admin -- convert --clinicId=ID_DA_CLINICA --plan=PRO`

A conversão altera o plano e desativa a trava da demo. Pacientes, agenda e histórico permanecem no mesmo banco.

## Extensão excepcional
`npm run demo:admin -- extend --clinicId=ID_DA_CLINICA --days=15`

## Liberar módulos
`npm run demo:admin -- modules --clinicId=ID_DA_CLINICA --modules=agenda,patients,clinical`

## Consultar demos
`npm run demo:admin -- list`
