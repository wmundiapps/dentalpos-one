export interface RuntimeCheck {
  key: string
  label: string
  ok: boolean
  critical: boolean
  detail: string
}

function value(name: string) {
  return String(process.env[name] || '').trim()
}

function looksPlaceholder(input: string) {
  const normalized = input.toLowerCase()
  return !input || normalized.includes('troque') || normalized.includes('change-me') || normalized.includes('example')
}

function configuredSecret(name: string, minLength = 32) {
  const current = value(name)
  return current.length >= minLength && !looksPlaceholder(current)
}

export function runtimeChecks(): RuntimeCheck[] {
  const nodeEnv = value('NODE_ENV') || 'development'
  const appEnv = value('APP_ENV') || nodeEnv
  const corsOrigin = value('CORS_ORIGIN')
  const publicUrl = value('PUBLIC_APP_URL')
  const backupEnabled = value('BACKUP_ENABLED') === 'true'
  const restoreTest = value('BACKUP_LAST_RESTORE_TEST_AT')

  return [
    {
      key: 'jwt-secret',
      label: 'JWT_SECRET forte e exclusivo',
      ok: configuredSecret('JWT_SECRET', 48),
      critical: true,
      detail: 'Use uma chave aleatória com pelo menos 48 caracteres no servidor.'
    },
    {
      key: 'tenant-master-key',
      label: 'Chave mestra de segredos por clínica',
      ok: configuredSecret('TENANT_SECRET_MASTER_KEY', 32),
      critical: true,
      detail: 'Necessária para proteger credenciais de integrações armazenadas no backend.'
    },
    {
      key: 'cors',
      label: 'CORS restrito ao domínio autorizado',
      ok: Boolean(corsOrigin) && corsOrigin !== '*',
      critical: true,
      detail: 'Não use CORS_ORIGIN=* em homologação pública ou produção.'
    },
    {
      key: 'registration',
      label: 'Cadastro público desabilitado',
      ok: value('ALLOW_PUBLIC_REGISTRATION') !== 'true',
      critical: true,
      detail: 'Novas clínicas e usuários devem entrar por provisionamento controlado.'
    },
    {
      key: 'public-url',
      label: 'URL pública com HTTPS',
      ok: /^https:\/\//i.test(publicUrl),
      critical: true,
      detail: 'PUBLIC_APP_URL deve apontar para a URL HTTPS do ambiente.'
    },
    {
      key: 'database-url',
      label: 'Banco de dados configurado',
      ok: Boolean(value('DATABASE_URL')),
      critical: true,
      detail: 'DATABASE_URL deve estar definida somente no ambiente seguro do servidor.'
    },
    {
      key: 'release-channel',
      label: 'Canal de release identificado',
      ok: ['internal', 'pilot', 'production'].includes(value('RELEASE_CHANNEL').toLowerCase()),
      critical: false,
      detail: `Ambiente atual: ${appEnv}; canal: ${value('RELEASE_CHANNEL') || 'não informado'}.`
    },
    {
      key: 'backup-enabled',
      label: 'Política de backup habilitada',
      ok: backupEnabled,
      critical: true,
      detail: 'Habilite somente depois de configurar e validar o job real de backup.'
    },
    {
      key: 'restore-tested',
      label: 'Restauração de backup testada',
      ok: Boolean(restoreTest),
      critical: true,
      detail: restoreTest ? `Último teste informado: ${restoreTest}.` : 'Nenhum teste de restauração foi registrado no ambiente.'
    }
  ]
}

export function assertRuntimeConfiguration() {
  if (value('NODE_ENV') !== 'production') return

  const failures = runtimeChecks().filter(check => check.critical && !check.ok)
  if (!failures.length) return

  const message = failures.map(check => `- ${check.label}`).join('\n')
  throw new Error(`Configuração insegura para produção:\n${message}`)
}

export function allowedCorsOrigins() {
  return value('CORS_ORIGIN')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}
