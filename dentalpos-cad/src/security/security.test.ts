import { describe, it, expect, beforeEach } from "vitest";
import { base32Decode, base32Encode, decryptText, deriveAesKey, encryptText, hotp, randomBytes, verifyTotp } from "./crypto";
import { dangerousSignature, safeParseJson, validateUpload } from "./upload";
import { hostAllowed, frameAllowed } from "./guard";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage;

describe("TOTP / criptografia", () => {
  const secret = new TextEncoder().encode("12345678901234567890");
  it("segue os vetores de teste do RFC 6238 (SHA-1)", async () => {
    expect(await hotp(secret, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(await hotp(secret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(await hotp(secret, Math.floor(20000000000 / 30), 8)).toBe("65353130");
  });
  it("aceita ±1 janela e rejeita reutilização e códigos errados", async () => {
    const now = 1_700_000_000_000, step = Math.floor(now / 30000);
    const code = await hotp(secret, step);
    expect((await verifyTotp(secret, code, now)).ok).toBe(true);
    expect((await verifyTotp(secret, code, now + 30000)).ok).toBe(true);
    expect((await verifyTotp(secret, code, now + 90000)).ok).toBe(false);
    expect((await verifyTotp(secret, code, now, step)).ok).toBe(false); // mesmo passo já usado
    expect((await verifyTotp(secret, "000000", now)).ok).toBe(false);
    expect((await verifyTotp(secret, "abc", now)).ok).toBe(false);
  });
  it("base32 e AES-GCM funcionam e detectam adulteração", async () => {
    const b = randomBytes(20); expect(Array.from(base32Decode(base32Encode(b)))).toEqual(Array.from(b));
    const key = await deriveAesKey("Senha-Forte-123", randomBytes(16), 1000);
    const c = await encryptText(key, "paciente: José");
    expect(await decryptText(key, c)).toBe("paciente: José");
    const [iv, ct] = c.split("."); const bad = iv + "." + (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    await expect(decryptText(key, bad)).rejects.toThrow();
  });
});

describe("fluxo de autenticação em 2 etapas", () => {
  beforeEach(() => mem.clear());
  it("configura, exige senha+código, bloqueia tentativas e aceita código de recuperação uma vez", async () => {
    const A = await import("./auth");
    const pending = await A.beginSetup("Zebra-Quente-Azul42", "dr@x.com");
    const secret = base32Decode(pending.secretB32);
    expect(await A.confirmSetup("000000")).toBe(false);
    const step = Math.floor(Date.now() / 30000);
    expect(await A.confirmSetup(await hotp(secret, step))).toBe(true);
    A.lock();
    expect((await A.login("errada-ABC12345", await hotp(secret, step + 1))).ok).toBe(false);
    expect((await A.login("Zebra-Quente-Azul42", "123456")).ok).toBe(false);
    const wrong2 = await A.login("Zebra-Quente-Azul42", "123456");
    expect(wrong2.ok).toBe(false);
    // 3+ falhas → bloqueio temporário, mesmo com credenciais certas
    const locked = await A.login("Zebra-Quente-Azul42", await hotp(secret, step + 1));
    expect(locked.ok).toBe(false); expect(A.lockedOutSeconds()).toBeGreaterThan(0);
    // limpa o bloqueio (simula passagem do tempo) e usa um código de recuperação
    const st = JSON.parse(mem.get("dpcad:auth:v1")!); st.lockUntil = 0; mem.set("dpcad:auth:v1", JSON.stringify(st));
    const r1 = await A.login("Zebra-Quente-Azul42", pending.recovery[0]);
    expect(r1.ok).toBe(true); A.lock();
    expect((await A.login("Zebra-Quente-Azul42", pending.recovery[0])).ok).toBe(false); // uso único
  }, 60000);
  it("rejeita senhas fracas", async () => {
    const A = await import("./auth");
    await expect(A.beginSetup("curta1A", "x")).rejects.toThrow();
    await expect(A.beginSetup("senhasenhasenha1A", "x")).rejects.toThrow();
  });
});

describe("validação de uploads", () => {
  const mk = (name: string, bytes: Uint8Array | string) => new File([typeof bytes === "string" ? bytes : (bytes.buffer as ArrayBuffer)], name);
  it("bloqueia executáveis, scripts e HTML/SVG disfarçados", async () => {
    expect(dangerousSignature(new TextEncoder().encode("MZ\x90\x00"))).toMatch(/Windows/);
    expect(dangerousSignature(new TextEncoder().encode("#!/bin/sh\nrm -rf /"))).toBe("script");
    expect(dangerousSignature(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatch(/ativo/);
    expect((await validateUpload(mk("modelo.stl", "MZ\x90\x00\x03"), "mesh")).ok).toBe(false);
    expect((await validateUpload(mk("foto.png", "<html><script>alert(1)</script>"), "image")).ok).toBe(false);
    expect((await validateUpload(mk("virus.exe", "x"), "mesh")).ok).toBe(false);
    expect((await validateUpload(mk("foto.jpg", "texto qualquer"), "image")).ok).toBe(false);
  });
  it("aceita STL ASCII/binário válidos e rejeita estrutura inválida", async () => {
    expect((await validateUpload(mk("a.stl", "solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid"), "mesh")).ok).toBe(true);
    const bin = new Uint8Array(84 + 50); new DataView(bin.buffer).setUint32(80, 1, true);
    expect((await validateUpload(mk("b.stl", bin), "mesh")).ok).toBe(true);
    const bad = new Uint8Array(84 + 51); new DataView(bad.buffer).setUint32(80, 7, true);
    expect((await validateUpload(mk("c.stl", bad), "mesh")).ok).toBe(false);
  });
  it("aceita imagem JPEG/PNG por assinatura", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect((await validateUpload(mk("f.png", png), "image")).ok).toBe(true);
  });
  it("JSON de projeto: bloqueia poluição de protótipo", () => {
    expect(() => safeParseJson('{"version":1,"__proto__":{"admin":true}}')).toThrow();
    expect(() => safeParseJson('{"a":{"constructor":1}}')).toThrow();
    expect((safeParseJson('{"version":1}') as { version: number }).version).toBe(1);
  });
});

describe("bloqueio de domínio e iframe", () => {
  it("permite só os domínios (e subdomínios) autorizados", () => {
    const h = ["dentalpos.com.br"];
    expect(hostAllowed({ protocol: "https:", hostname: "dentalpos.com.br" }, h, false)).toBe(true);
    expect(hostAllowed({ protocol: "https:", hostname: "app.dentalpos.com.br" }, h, false)).toBe(true);
    expect(hostAllowed({ protocol: "https:", hostname: "evil-dentalpos.com.br" }, h, false)).toBe(false);
    expect(hostAllowed({ protocol: "https:", hostname: "dentalpos.com.br.evil.com" }, h, false)).toBe(false);
    expect(hostAllowed({ protocol: "file:", hostname: "" }, h, false)).toBe(false);
    expect(hostAllowed({ protocol: "file:", hostname: "" }, h, true)).toBe(true);
  });
  it("bloqueia incorporação (iframe) fora das origens autorizadas", () => {
    expect(frameAllowed(true, null, [])).toBe(true);
    expect(frameAllowed(false, "https://outro.com", ["https://app.exemplo.com"])).toBe(false);
    expect(frameAllowed(false, "https://app.exemplo.com", ["https://app.exemplo.com"])).toBe(true);
    expect(frameAllowed(false, null, ["https://app.exemplo.com"])).toBe(false);
  });
});
