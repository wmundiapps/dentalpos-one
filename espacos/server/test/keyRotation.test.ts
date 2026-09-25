import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { decryptDocument, encryptDocument, keyRotationActive, reencryptIfPrevious } from '../src/secure.js';

const k = () => crypto.randomBytes(32).toString('base64');

test('rotação de chave: lê o antigo, recifra com a nova e depois dispensa a antiga', () => {
  const saved = { v1: process.env.DOCUMENT_ENCRYPTION_KEY, v2: process.env.DOCUMENT_ENCRYPTION_KEY_V2 };
  try {
    const oldKey = k();
    const newKey = k();
    process.env.DOCUMENT_ENCRYPTION_KEY = oldKey;
    delete process.env.DOCUMENT_ENCRYPTION_KEY_V2;
    const oldCipher = encryptDocument(Buffer.from('documento de registro'));
    assert.equal(keyRotationActive(), false);
    assert.equal(reencryptIfPrevious(oldCipher), null);

    // Durante a rotação: as duas chaves definidas
    process.env.DOCUMENT_ENCRYPTION_KEY_V2 = newKey;
    assert.equal(keyRotationActive(), true);
    assert.equal(decryptDocument(oldCipher).toString(), 'documento de registro');
    const rotated = reencryptIfPrevious(oldCipher);
    assert.ok(rotated);
    assert.equal(reencryptIfPrevious(rotated!), null, 'já na chave nova não recifra de novo');
    const fresh = encryptDocument(Buffer.from('novo'));

    // Depois de remover a chave antiga: tudo que foi recifrado continua legível
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    assert.equal(keyRotationActive(), false);
    assert.equal(decryptDocument(rotated!).toString(), 'documento de registro');
    assert.equal(decryptDocument(fresh).toString(), 'novo');
    assert.throws(() => decryptDocument(oldCipher), 'o que não foi recifrado fica ilegível sem a chave antiga');

    // Dado sem criptografia (legado) continua passando direto
    assert.equal(decryptDocument(Buffer.from('texto puro')).toString(), 'texto puro');
  } finally {
    if (saved.v1 === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY; else process.env.DOCUMENT_ENCRYPTION_KEY = saved.v1;
    if (saved.v2 === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY_V2; else process.env.DOCUMENT_ENCRYPTION_KEY_V2 = saved.v2;
  }
});
