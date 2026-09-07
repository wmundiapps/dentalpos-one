import crypto from 'crypto'
import { prisma } from '../lib/prisma'

type StorageContext = { clinicId: string; tenantId: string; storageKey: string }

function encodePath(value: string) {
  return value.split('/').map(part => encodeURIComponent(part)).join('/')
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function credentials() {
  const accessKeyId = process.env.CLINICAL_STORAGE_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLINICAL_STORAGE_SECRET_ACCESS_KEY
  const sessionToken = process.env.CLINICAL_STORAGE_SESSION_TOKEN
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, sessionToken } : null
}

async function configFor(clinicId: string, tenantId: string) {
  return prisma.tenantStorageConfig.findFirst({
    where: { clinicId, tenantId, isActive: true },
    orderBy: { updatedAt: 'desc' }
  })
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-180)
}

export function normalizeExtension(originalName: string, informed?: string) {
  const fromName = originalName.includes('.') ? originalName.split('.').pop() || '' : ''
  return (informed || fromName).replace(/^\./, '').toLowerCase().slice(0, 12)
}

export function classifyPreview(extension: string, mimeType: string, kind: string) {
  const ext = extension.toLowerCase()
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'PDF'
  if (['stl', 'ply', 'obj'].includes(ext)) return 'DENTAL_3D'
  if (ext === 'dcm' || kind === 'DICOM') return 'DICOM'
  return 'DOWNLOAD'
}

export function buildClinicalStorageKey(input: {
  tenantId: string; clinicId: string; patientId: string; fileId: string; originalName: string
}) {
  const date = new Date().toISOString().slice(0, 10)
  return [
    'tenants', safeName(input.tenantId),
    'clinics', safeName(input.clinicId),
    'patients', safeName(input.patientId),
    'clinical-files', date,
    `${safeName(input.fileId)}-${safeName(input.originalName)}`
  ].join('/')
}

function presign(input: {
  method: 'GET' | 'PUT'
  endpoint: string
  bucket: string
  region: string
  key: string
  expiresSeconds: number
  contentType?: string
  downloadName?: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const service = 's3'
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`
  const endpoint = new URL(input.endpoint)
  const canonicalUri = `/${encodeURIComponent(input.bucket)}/${encodePath(input.key)}`
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  })
  if (input.sessionToken) query.set('X-Amz-Security-Token', input.sessionToken)
  if (input.downloadName && input.method === 'GET') {
    query.set('response-content-disposition', `attachment; filename="${safeName(input.downloadName)}"`)
  }
  query.sort()

  const canonicalHeaders = `host:${endpoint.host}\n`
  const canonicalRequest = [
    input.method, canonicalUri, query.toString(), canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'
  ].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  query.set('X-Amz-Signature', signature)

  return `${endpoint.origin}${canonicalUri}?${query.toString()}`
}

async function accessBase(ctx: StorageContext) {
  const config = await configFor(ctx.clinicId, ctx.tenantId)
  const creds = credentials()
  if (!config || !creds) {
    return {
      configured: false as const,
      provider: config?.provider || 'S3_COMPATIBLE',
      reason: !config ? 'TENANT_STORAGE_CONFIG_MISSING' : 'STORAGE_CREDENTIALS_MISSING'
    }
  }
  if (config.provider !== 'S3_COMPATIBLE') {
    return { configured: false as const, provider: config.provider, reason: 'PROVIDER_ADAPTER_NOT_CONFIGURED' }
  }
  const region = config.region || process.env.CLINICAL_STORAGE_REGION || 'us-east-1'
  const endpoint = config.endpoint || process.env.CLINICAL_STORAGE_ENDPOINT || `https://s3.${region}.amazonaws.com`
  const prefix = config.rootPrefix ? `${config.rootPrefix.replace(/^\/|\/$/g, '')}/` : ''
  return {
    configured: true as const,
    provider: config.provider,
    region, endpoint, bucket: config.bucket, key: `${prefix}${ctx.storageKey}`,
    ...creds
  }
}

export async function createUploadAccess(ctx: StorageContext & { contentType: string }) {
  const base = await accessBase(ctx)
  if (!base.configured) return { ...base, method: 'PUT' as const, url: null, expiresAt: null }
  const expiresSeconds = 900
  return {
    configured: true as const,
    provider: base.provider,
    method: 'PUT' as const,
    url: presign({
      method: 'PUT', endpoint: base.endpoint, bucket: base.bucket, region: base.region, key: base.key,
      expiresSeconds, accessKeyId: base.accessKeyId, secretAccessKey: base.secretAccessKey,
      sessionToken: base.sessionToken
    }),
    headers: { 'Content-Type': ctx.contentType },
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString()
  }
}

export async function createDownloadAccess(ctx: StorageContext & { fileName: string }) {
  const base = await accessBase(ctx)
  if (!base.configured) return { ...base, url: null, expiresAt: null }
  const expiresSeconds = 600
  return {
    configured: true as const,
    provider: base.provider,
    url: presign({
      method: 'GET', endpoint: base.endpoint, bucket: base.bucket, region: base.region, key: base.key,
      expiresSeconds, downloadName: ctx.fileName, accessKeyId: base.accessKeyId,
      secretAccessKey: base.secretAccessKey, sessionToken: base.sessionToken
    }),
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString()
  }
}
