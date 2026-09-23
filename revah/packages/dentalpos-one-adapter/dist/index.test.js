"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("./index");
(0, node_test_1.test)('token SSO HS256 com aud/iss e jti', () => {
    const t = (0, index_1.createSsoToken)('s3cr3t', { clinicId: 7, email: 'a@b.com', role: 'ADMIN' });
    const [h, p, s] = t.split('.');
    strict_1.default.equal(crypto_1.default.createHmac('sha256', 's3cr3t').update(`${h}.${p}`).digest('base64url'), s);
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    strict_1.default.equal(claims.aud, 'revah');
    strict_1.default.equal(claims.iss, 'dentalpos-one');
    strict_1.default.equal(claims.clinicId, '7');
    strict_1.default.ok(claims.jti && claims.exp - claims.iat <= 300);
});
(0, node_test_1.test)('valida webhook do REVAH', () => {
    const body = JSON.stringify({ type: 'revah.opt_out' });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = (0, index_1.hmacHex)('k', `${ts}.${body}`);
    strict_1.default.ok((0, index_1.verifyRevahWebhook)(body, ts, sig, 'k'));
    strict_1.default.ok(!(0, index_1.verifyRevahWebhook)(body, ts, sig, 'outro'));
    strict_1.default.ok(!(0, index_1.verifyRevahWebhook)(body, '1000', (0, index_1.hmacHex)('k', `1000.${body}`), 'k'));
});
