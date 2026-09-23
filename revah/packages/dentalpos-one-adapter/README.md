# @revah/dentalpos-one-adapter

Único ponto de contato entre o DentalPos One e o REVAH. Sem dependências (Node 18+).

```ts
import { RevahClient, verifyRevahWebhook } from '@revah/dentalpos-one-adapter'

const revah = new RevahClient({ apiUrl: process.env.REVAH_API_URL!, appUrl: process.env.REVAH_APP_URL, sharedSecret: process.env.REVAH_SHARED_SECRET })

// 1. Licença / provisionamento (guarde apiKey e webhookSecret criptografados)
const { apiKey, webhookSecret } = await revah.provisionClinic({ clinicId, clinicName, ownerEmail, plan: 'PRO', webhookUrl })
await revah.setLicense(clinicId, false) // suspende

// 2. SSO — abre o Marketing embutido
const url = revah.ssoUrl({ clinicId, email, name, role: 'ADMIN' })

// 3. Eventos (ids estáveis = idempotência)
await revah.sendEvents(apiKey, [{ id: `appt:${a.id}:reminder`, type: 'appointment.reminder', patient: { id, name, phone }, data: { data: '25/09/2026', hora: '14:30' } }])

// 4. Webhooks do REVAH (opt-out, pedido de agendamento, ligação concluída)
verifyRevahWebhook(rawBody, req.header('x-revah-timestamp'), req.header('x-revah-signature'), webhookSecret)
```

Tipos de evento: `appointment.scheduled`, `appointment.reminder`, `appointment.no_show`, `appointment.canceled`,
`budget.pending`, `billing.due`, `recall.due`, `postop.followup`.

Build: `npm install && npm run build` (o `dist/` fica versionado para o DentalPos consumir sem etapa extra).
