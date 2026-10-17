// CRUD genérico dos cadastros (clientes, veículos, serviços, planos, estoque, despesas, lembretes...).
// Nada é apagado: "excluir" arquiva (o registro some das listas, mas fica no banco).
import { Router } from 'express';
import { KINDS } from '../kinds.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { pool, one } from '../db.js';
import { archiveRec, getRec, insertRec, listRecs, patchRec, type Rec } from '../repo.js';
import { HttpError, audit, clientIp } from '../security.js';
import { decrypt, encrypt } from '../secure.js';
import { onlyDigits, validCpf } from '../validators.js';

export const recordsRouter = Router();

const maskCpf = (cpf: string) => (cpf ? `***.***.***-${cpf.slice(-2)}` : '');

/** Grava CPF cifrado (cpfEnc) e só os 2 últimos dígitos em claro; o CPF inteiro sai apenas no detalhe do cliente. */
function toStored(kind: string, d: Record<string, any>): Record<string, any> {
  if (kind !== 'customer' || d.cpf === undefined) return d;
  const { cpf, ...rest } = d;
  const digits = onlyDigits(cpf ?? '');
  if (digits && !validCpf(digits)) throw new HttpError(400, 'CPF inválido.', 'invalido');
  return { ...rest, cpfEnc: digits ? encrypt(digits) : '', cpfLast2: digits.slice(-2) };
}

function toClient(kind: string, rec: Rec, full: boolean): Rec {
  if (kind !== 'customer') return rec;
  const { cpfEnc, cpfLast2, ...rest } = rec.data;
  let cpf = '';
  if (cpfEnc) {
    if (full) { try { cpf = decrypt(cpfEnc); } catch { cpf = ''; } } else cpf = maskCpf(cpfLast2 ?? '');
  }
  return { ...rec, data: { ...rest, cpf, hasCpf: !!cpfEnc } };
}

function kindOf(name: string) {
  const k = KINDS[name];
  if (!k) throw new HttpError(404, 'Tipo de cadastro não existe.', 'nao_encontrado');
  return k;
}

async function checkRefs(tenantId: string, kind: string, d: Record<string, any>) {
  const refs: [string, string | undefined][] = [
    ['customer', d.customerId], ['supplier', d.supplierId], ['vehicle', d.vehicleId], ['plan', d.planId],
  ];
  for (const [k, id] of refs) if (id && !(await getRec(pool, tenantId, k, id))) throw new HttpError(400, 'Referência inválida.', 'invalido');
  if (kind === 'plan') for (const id of d.serviceIds ?? []) if (!(await getRec(pool, tenantId, 'service', id))) throw new HttpError(400, 'Serviço do plano não existe.', 'invalido');
  if (kind === 'vehicle' && d.customerId && d.plate) {
    const dup = await one(pool, "SELECT 1 FROM records WHERE tenant_id=$1 AND kind='vehicle' AND data->>'plate'=$2 AND data->>'customerId'=$3 AND COALESCE(data->>'archived','false')<>'true'", [tenantId, d.plate, d.customerId]);
    if (dup) throw new HttpError(409, 'Esse veículo já está cadastrado para o cliente.', 'duplicado');
  }
}

recordsRouter.get('/:kind', async (req: AuthedRequest, res) => {
  kindOf(req.params.kind as string);
  const q = req.query;
  let where: string | undefined; const params: unknown[] = [];
  if (typeof q.customerId === 'string') { params.push(q.customerId); where = `data->>'customerId' = $3`; }
  if (typeof q.plate === 'string' && req.params.kind === 'vehicle') { params.push(q.plate.toUpperCase().replace(/[^A-Z0-9]/g, '')); where = `data->>'plate' = $3`; }
  if (typeof q.q === 'string' && q.q.trim() && req.params.kind === 'customer') {
    params.push(`%${q.q.trim().slice(0, 40).replace(/[%_\\]/g, '')}%`);
    where = `(data->>'name' ILIKE $3 OR data->>'whatsapp' LIKE $3)`;
  }
  const list = await listRecs(pool, tenantOf(req), req.params.kind as string, { archived: q.archived === '1', where, params, limit: 2000 });
  res.json(list.map((r) => toClient(req.params.kind as string, r, false)));
});

recordsRouter.get('/:kind/:id', async (req: AuthedRequest, res) => {
  kindOf(req.params.kind as string);
  const r = await getRec(pool, tenantOf(req), req.params.kind as string, req.params.id as string);
  if (!r) throw new HttpError(404, 'Não encontrado.', 'nao_encontrado');
  if (req.params.kind === 'customer' && r.data.cpfEnc) await audit(pool, 'cpf_visualizado', { tenantId: tenantOf(req), userId: req.user!.id, ip: clientIp(req) }, { customerId: r.id });
  res.json(toClient(req.params.kind as string, r, true));
});

recordsRouter.post('/:kind', async (req: AuthedRequest, res) => {
  const kind = req.params.kind as string;
  const def = kindOf(kind);
  const tenantId = tenantOf(req);
  const data = def.schema.parse(req.body) as Record<string, any>;
  await checkRefs(tenantId, kind, data);
  const rec = await insertRec(pool, tenantId, kind, toStored(kind, data));
  res.status(201).json(toClient(kind, rec, false));
});

recordsRouter.put('/:kind/:id', async (req: AuthedRequest, res) => {
  const kind = req.params.kind as string;
  const def = kindOf(kind);
  const tenantId = tenantOf(req);
  const patch = def.schema.partial().parse(req.body) as Record<string, any>;
  await checkRefs(tenantId, kind, kind === 'vehicle' ? { ...patch, plate: undefined } : patch);
  if (kind === 'customer' && patch.cpf === '') patch.cpf = ''; // permite limpar o CPF
  const rec = await patchRec(pool, tenantId, kind, req.params.id as string, toStored(kind, patch));
  if (!rec) throw new HttpError(404, 'Não encontrado.', 'nao_encontrado');
  res.json(toClient(kind, rec, false));
});

recordsRouter.delete('/:kind/:id', async (req: AuthedRequest, res) => {
  const kind = req.params.kind as string;
  kindOf(kind);
  const rec = await archiveRec(pool, tenantOf(req), kind, req.params.id as string);
  if (!rec) throw new HttpError(404, 'Não encontrado.', 'nao_encontrado');
  await audit(pool, 'arquivado', { tenantId: tenantOf(req), userId: req.user!.id, ip: clientIp(req) }, { kind, id: rec.id });
  res.json({ ok: true, archived: true });
});
