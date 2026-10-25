import test from 'node:test';
import assert from 'node:assert/strict';
import { calcFeeCents, feeTable } from '../../shared/fees.js';
import { isValidCnpj, isValidCpf, normalizePhoneBR } from '../../shared/documents.js';
import { evaluateListing, scanMessage } from '../src/risk.js';
import { tokensOf } from '../src/outros.js';
import { sniffImage, pdfIsSafe } from '../src/images.js';
import { decryptBuffer, encryptBuffer } from '../src/secure.js';

const R = (v: number) => Math.round(v * 100);

test('taxa: faixas e limites exatos pedidos pelo dono do produto', () => {
  const cases: [number, number][] = [
    [1, 15], [150, 15], [150.01, 20], [500, 20], [501, 30], [500.01, 30], [1000, 30], [1000.01, 50], [1001, 50], [1500, 50],
    [1501, 80], [1500.01, 80], [2000, 80], [2000.01, 100], [2001, 100], [3000, 100],
    [3000.01, 150], [3001, 150], [4000, 150], [4000.01, 200], [5000, 200], [10000, 100 + 50 * 7],
  ];
  for (const [price, fee] of cases) assert.equal(calcFeeCents(R(price)), R(fee), `preço ${price}`);
});

test('taxa: teto opcional e valores inválidos', () => {
  assert.equal(calcFeeCents(R(300_000), R(500)), R(500));
  assert.equal(calcFeeCents(R(100), R(500)), R(15));
  assert.throws(() => calcFeeCents(0));
  assert.throws(() => calcFeeCents(10.5));
  assert.equal(feeTable().length, 7);
});

test('CPF, CNPJ e telefone', () => {
  assert.ok(isValidCpf('529.982.247-25'));
  assert.ok(!isValidCpf('111.111.111-11'));
  assert.ok(!isValidCpf('529.982.247-24'));
  assert.ok(isValidCnpj('11.222.333/0001-81'));
  assert.ok(!isValidCnpj('11.222.333/0001-80'));
  assert.equal(normalizePhoneBR('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizePhoneBR('+55 11 3456-7890'), '551134567890');
  assert.equal(normalizePhoneBR('12345'), null);
});

test('triagem: bloqueia ilícito, marca golpe, deixa anúncio normal passar', () => {
  const base = { priceCents: R(800), category: 'moveis', operation: 'venda', condition: 'usado' };
  assert.ok(evaluateListing({ ...base, title: 'Sofá retrátil 3 lugares', description: 'Sofá em ótimo estado, retirar no local, aceito visita.' }).score < 40);
  assert.ok(evaluateListing({ ...base, title: 'Pistola 9mm com munição', description: 'Arma de fogo sem registro' }).blocked);
  assert.ok(evaluateListing({ ...base, title: 'Celular barato', description: 'Produto roubado mas funcionando perfeito' }).blocked);
  const scam = evaluateListing({ ...base, title: 'Geladeira nova promoção', description: 'Pix antecipado, me chama no whatsapp 11 98765-4321 ou www.golpe.com' });
  assert.ok(scam.score >= 40 && scam.flags.includes('pagamento_antecipado') && scam.flags.includes('contato_fora_da_plataforma'));
  const car = evaluateListing({ ...base, category: 'automoveis', priceCents: R(2500), title: 'Honda Civic 2018 completo', description: 'Estou no exterior, vendo barato o carro do meu pai, entrego após o pagamento' });
  assert.ok(car.flags.includes('preco_muito_baixo') && car.flags.includes('vendedor_no_exterior'));
});

test('mensagens: alerta de golpe', () => {
  assert.ok(scanMessage('Posso fazer um pix antecipado para reservar?').flagged);
  assert.ok(scanMessage('me manda o código que chegou no seu celular').flagged);
  assert.ok(!scanMessage('Oi, ainda está disponível? Posso ver amanhã às 10h?').flagged);
});

test('Outros: termos significativos do título', () => {
  assert.deepEqual(tokensOf('Bicicleta aro 29 usada ótimo estado').sort(), ['bicicleta']);
  assert.ok(tokensOf('Bicicletas Caloi 21 marchas').includes('bicicleta'));
});

test('arquivos: assinatura de imagem e PDF ativo', () => {
  assert.equal(sniffImage(Buffer.from('<?php system($_GET[1]);')), undefined);
  assert.ok(!pdfIsSafe(Buffer.from('%PDF-1.4 /OpenAction << /JS (app.alert(1)) >>')));
  assert.ok(!pdfIsSafe(Buffer.from('%PDF-1.4 /J#61vaScript')));
  assert.ok(pdfIsSafe(Buffer.from('%PDF-1.4 1 0 obj << /Type /Catalog >> endobj')));
});

test('criptografia: ida e volta e adulteração detectada', () => {
  const enc = encryptBuffer(Buffer.from('segredo'));
  assert.equal(decryptBuffer(enc).toString(), 'segredo');
  enc[enc.length - 1] ^= 1;
  assert.throws(() => decryptBuffer(enc));
});
