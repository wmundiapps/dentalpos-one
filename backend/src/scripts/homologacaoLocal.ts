import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config()

type JsonObject = Record<string, unknown>

interface SmartConfigResponse {
  policy: {
    enabled: boolean
    respectPreferredWeekday: boolean
    financeOptimizationEnabled: boolean
    financeNeverOverridesClinical: boolean
    overdueWarningOnly: boolean
    defaultDurationMinutes: number
    defaultReturnIntervalDays: number
    maxLookAheadDays: number
  }
  procedureRules: Array<{
    id: string
    procedureKey: string
    procedureName: string
    durationMinutes: number
    clinicalMinReturnDays: number
    clinicalMaxReturnDays: number | null
    preferredReturnIntervalDays: number | null
    isActive: boolean
  }>
  laboratoryRules: Array<{
    id: string
    laboratoryName: string
    serviceKey: string
    serviceName: string
    leadTimeDays: number
    safetyDays: number
    isActive: boolean
  }>
  clinicalPriority: boolean
}

interface SuggestionResponse {
  decisionId: string
  suggestedReturnAt: string
  clinicalPriority: boolean
  factors?: {
    laboratory?: {
      leadTimeDays?: number
      safetyDays?: number
    } | null
    clinical?: {
      priority?: string
    } | null
  }
}

interface DecisionResponse {
  id?: string
  status?: string
  chosenReturnAt?: string | null
}

function ok(label: string) {
  console.log(`OK  ${label}`)
}

function fail(message: string): never {
  throw new Error(message)
}

async function main() {
  const [{ default: app }, { prisma }] = await Promise.all([
    import('../app'),
    import('../lib/prisma'),
  ])

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) fail('JWT_SECRET não configurado no backend/.env.')

  await prisma.$connect()

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!admin) {
    fail('Nenhum administrador ativo encontrado. Execute o bootstrap do administrador antes da homologação.')
  }

  const clinic = await prisma.clinic.findFirst({
    where: { id: admin.clinicId, tenantId: admin.tenantId },
  })

  if (!clinic) fail('Clínica do administrador não encontrada.')

  const token = jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      clinicId: admin.clinicId,
      tenantId: admin.tenantId,
      role: admin.role,
    },
    jwtSecret,
    { expiresIn: '15m' },
  )

  const port = Number(process.env.HOMOLOGATION_PORT || 3199)
  const base = `http://127.0.0.1:${port}/api`

  let patientId: string | undefined
  let server: ReturnType<typeof app.listen> | undefined

  const request = async <T>(
    path: string,
    method = 'GET',
    body?: JsonObject,
  ): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Clinic-ID': admin.clinicId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const parsed = (await response.json()) as { error?: string }
        if (parsed.error) detail = parsed.error
      } catch {
        // mantém o status HTTP
      }
      throw new Error(`${method} ${path}: ${detail}`)
    }

    return (await response.json()) as T
  }

  try {
    server = app.listen(port, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', () => resolve())
      server!.once('error', reject)
    })

    ok('API local iniciada para homologação')
    ok('JWT multi-tenant emitido sem expor credenciais')

    let config = await request<SmartConfigResponse>('/smart-scheduling/config')
    ok('Leitura da configuração da Agenda Inteligente')

    if (!config.procedureRules.length || !config.laboratoryRules.length) {
      config = await request<SmartConfigResponse>(
        '/smart-scheduling/bootstrap',
        'POST',
      )
      ok('Bootstrap das regras da Agenda Inteligente')
    }

    if (!config.clinicalPriority) {
      fail('A prioridade clínica não está ativa.')
    }

    await request(
      '/smart-scheduling/policy',
      'PUT',
      {
        enabled: config.policy.enabled,
        respectPreferredWeekday: config.policy.respectPreferredWeekday,
        financeOptimizationEnabled: config.policy.financeOptimizationEnabled,
        defaultDurationMinutes: config.policy.defaultDurationMinutes,
        defaultReturnIntervalDays: config.policy.defaultReturnIntervalDays,
        maxLookAheadDays: config.policy.maxLookAheadDays,
      },
    )
    ok('Gravação idempotente da política no PostgreSQL')

    const procedureRule = config.procedureRules.find((row) => row.isActive)
    if (!procedureRule) fail('Nenhuma regra clínica ativa encontrada.')

    await request(
      `/smart-scheduling/procedure-rules/${encodeURIComponent(procedureRule.procedureKey)}`,
      'PUT',
      {
        procedureName: procedureRule.procedureName,
        durationMinutes: procedureRule.durationMinutes,
        clinicalMinReturnDays: procedureRule.clinicalMinReturnDays,
        preferredReturnIntervalDays: procedureRule.preferredReturnIntervalDays,
        clinicalMaxReturnDays: procedureRule.clinicalMaxReturnDays,
        isActive: true,
      },
    )
    ok('Sincronização de regra clínica')

    const laboratoryRule = config.laboratoryRules.find((row) => row.isActive)
    if (!laboratoryRule) fail('Nenhuma regra laboratorial ativa encontrada.')

    await request(
      '/smart-scheduling/laboratory-rules',
      'PUT',
      {
        laboratoryName: laboratoryRule.laboratoryName,
        serviceName: laboratoryRule.serviceName,
        leadTimeDays: laboratoryRule.leadTimeDays,
        safetyDays: laboratoryRule.safetyDays,
        isActive: true,
      },
    )
    ok('Sincronização de regra laboratorial')

    const patient = await request<{ id: string }>(
      '/patients',
      'POST',
      {
        fullName: `Homologação Agenda ${Date.now()}`,
        phone: '0000000000',
        photos: [],
        xrays: [],
        notes: 'Registro temporário criado automaticamente pelo Bloco 20.',
        isActive: true,
      },
    )
    patientId = patient.id
    ok('Paciente temporário criado com isolamento por clínica')

    const referenceAt = new Date()
    referenceAt.setHours(12, 0, 0, 0)

    const suggestion = await request<SuggestionResponse>(
      '/smart-scheduling/suggest',
      'POST',
      {
        patientId,
        procedure: laboratoryRule.serviceName || procedureRule.procedureName,
        referenceAt: referenceAt.toISOString(),
        laboratoryName: laboratoryRule.laboratoryName,
        laboratoryService: laboratoryRule.serviceName,
      },
    )

    if (!suggestion.decisionId) {
      fail('A sugestão não retornou decisionId.')
    }

    if (!suggestion.clinicalPriority) {
      fail('A sugestão não confirmou prioridade clínica.')
    }

    if (suggestion.factors?.clinical?.priority !== 'CLINICAL_FIRST') {
      fail('O cálculo não registrou CLINICAL_FIRST.')
    }

    if (!suggestion.factors?.laboratory) {
      fail('A regra laboratorial não foi considerada na sugestão.')
    }

    ok('Sugestão real persistida no PostgreSQL')
    ok('Prioridade clínica CLINICAL_FIRST confirmada')
    ok('Prazo laboratorial considerado pelo backend')

    const accepted = await request<DecisionResponse>(
      `/smart-scheduling/decisions/${encodeURIComponent(suggestion.decisionId)}/accept`,
      'POST',
      {
        chosenReturnAt: suggestion.suggestedReturnAt,
      },
    )

    if (String(accepted.status || '').toUpperCase() !== 'ACCEPTED') {
      fail('A decisão não foi registrada como ACCEPTED.')
    }

    ok('Decisão aceita e registrada')

    const finalConfig =
      await request<SmartConfigResponse>('/smart-scheduling/config')

    if (!finalConfig.clinicalPriority) {
      fail('A configuração final perdeu a prioridade clínica.')
    }

    ok('Releitura pós-gravação consistente')
    console.log('')
    console.log('HOMOLOGAÇÃO LOCAL APROVADA — BLOCO 20')
  } finally {
    if (patientId) {
      try {
        await prisma.smartSchedulingDecision.deleteMany({
          where: { patientId, clinicId: admin.clinicId },
        })
        await prisma.patientSchedulingPreference.deleteMany({
          where: { patientId, clinicId: admin.clinicId },
        })
        await prisma.patient.delete({ where: { id: patientId } })
        ok('Dados temporários de homologação removidos')
      } catch (cleanupError) {
        console.warn(
          'AVISO: não foi possível remover integralmente o paciente temporário; ele será inativado.',
        )
        try {
          await prisma.patient.update({
            where: { id: patientId },
            data: { isActive: false },
          })
        } catch {
          // não mascara o resultado principal
        }
      }
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }

    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('')
  console.error('HOMOLOGAÇÃO LOCAL REPROVADA — BLOCO 20')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
