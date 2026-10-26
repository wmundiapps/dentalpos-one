// Cartões da rede: código assinado, validação e SVG (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.CARD_SECRET = process.env.CARD_SECRET || 'teste-segredo-cartao';
const kit = await import('../lib/kit.js');

test('código do paciente: gera, valida e recusa alteração', () => {
  const code = kit.makeCode('ASP', kit.patientRef(1042), '2099-12');
  assert.match(code, /^ASP-001042-9912-[0-9A-Z]{8}$/);
  const p = kit.parseCode(code);
  assert.equal(p.valid, true);
  assert.equal(p.expired, false);
  assert.equal(p.validUntil, '12/2099');
  assert.equal(kit.parseCode(code.replace('001042', '001043')).valid, false);
  assert.equal(kit.parseCode(code.replace('-9912-', '-9911-')).valid, false);
  assert.equal(kit.parseCode(`https://alignsystem.com.br/validar?c=${encodeURIComponent(code)}`).valid, true);
  assert.equal(kit.parseCode(code.toLowerCase()).valid, true);
});

test('código do credenciado e vencimento', () => {
  const ref = kit.dentistRef('3f2a9c1e-0000-4000-8000-000000000000');
  assert.equal(ref, '3F2A9C1E');
  const old = kit.makeCode('ASC', ref, '2020-01');
  assert.equal(kit.parseCode(old).expired, true);
  assert.equal(kit.parseCode('ASC-3F2A9C1E-2001-AAAAAAAA').valid, false);
  assert.equal(kit.parseCode('qualquer coisa'), null);
  assert.equal(kit.yymmOf('2027-13'), null);
});

test('nome mascarado para terceiros', () => {
  assert.equal(kit.maskName('maria da silva souza'), 'maria S. S.');
});

test('SVG dos cartões escapa texto e traz o QR', () => {
  const qr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" width="100" height="100"><path d="M0 0h1v1H0z"/></svg>';
  const s = kit.networkCardSVG({ kind: 'ASP', name: 'Ana <script>', lines: ['Invisalign · Maringá'], code: 'ASP-001042-9912-ABCDEFGH', validUntil: '12/2099', qrSvg: qr });
  assert.ok(s.startsWith('<svg') && s.includes('&lt;script&gt;') && !s.includes('<script>'));
  assert.ok(s.includes('x="738" y="326" width="200" height="200"'));
  const v = kit.businessCardSVG({ orient: 'v', eyebrow: 'Rede', name: 'Dr. Teste', role: 'Dentista', badge: 'CRO-PR 1', lines: [['TEL', '(44) 99999-0000']], qrSvg: qr });
  assert.ok(v.includes('width="810" height="1440"'));
  const r = kit.reminderSVG({ tipo: 'lembrete24', patient: 'João Silva', startsAt: '2026-11-03T13:30:00Z', apptKind: 'consulta', dentist: 'Dra. X', place: 'Rua A', contact: 'WhatsApp' });
  assert.ok(r.includes('10:30') && r.includes('terça-feira') && r.includes('NOVEMBRO'));
});
