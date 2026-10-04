import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { beginSetup, confirmSetup, isConfigured, isUnlocked, lock, login, lockedOutSeconds, wipeAll, type PendingSetup } from "./auth";
import { checkEnvironment, installDevtoolsDeterrent } from "./guard";
import { SECURITY } from "./config";

const IDLE_MS = 30 * 60_000;
const box: React.CSSProperties = { maxWidth: 440, margin: "8vh auto", padding: 28, background: "#0f1b2b", border: "1px solid #25405f", borderRadius: 12, color: "#e6eefb", font: "14px system-ui, sans-serif" };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", margin: "6px 0 14px", borderRadius: 8, border: "1px solid #2c4a70", background: "#0a1422", color: "#fff", boxSizing: "border-box", font: "inherit" };
const btn: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: 0, background: "#3b8cff", color: "#fff", font: "inherit", cursor: "pointer", fontWeight: 600 };

export function AuthGate({ children }: { children: ReactNode }) {
  const env = checkEnvironment();
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [devtools, setDevtools] = useState(false);
  const doLock = useCallback(() => { lock(); setUnlocked(false); }, []);
  const idle = useRef(0);
  useEffect(() => installDevtoolsDeterrent(() => { setDevtools(true); doLock(); }), [doLock]);
  useEffect(() => {
    if (!unlocked) return;
    const reset = () => { clearTimeout(idle.current); idle.current = window.setTimeout(doLock, IDLE_MS); };
    const ev = ["pointerdown", "keydown", "wheel"] as const; ev.forEach((e) => window.addEventListener(e, reset)); reset();
    const vis = () => { if (document.hidden) idle.current = window.setTimeout(doLock, 10 * 60_000); else reset(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(idle.current); ev.forEach((e) => window.removeEventListener(e, reset)); document.removeEventListener("visibilitychange", vis); };
  }, [unlocked, doLock]);

  if (!env.ok) return <div style={box}><h2>Acesso bloqueado</h2><p>{env.reason}</p></div>;
  if (!SECURITY.requireAuth) return <>{children}</>;
  if (unlocked) return <>{children}</>;
  return isConfigured() ? <Login onDone={() => { setDevtools(false); setUnlocked(true); }} devtools={devtools} /> : <Setup onDone={() => setUnlocked(true)} />;
}

function Login({ onDone, devtools }: { onDone: () => void; devtools: boolean }) {
  const [pw, setPw] = useState(""), [code, setCode] = useState(""), [err, setErr] = useState(devtools ? "Sessão bloqueada: ferramentas de desenvolvedor detectadas." : ""), [wait, setWait] = useState(lockedOutSeconds()), [busy, setBusy] = useState(false);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(lockedOutSeconds()), 1000); return () => clearTimeout(t); }, [wait]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const r = await login(pw, code); setBusy(false);
    if (r.ok) { onDone(); return; }
    setErr(r.error); setWait(r.wait ?? 0); setCode("");
  };
  return (
    <form style={box} onSubmit={go} data-testid="login">
      <h2 style={{ marginTop: 0 }}>DentalPos CAD</h2>
      <label>Senha<input style={inp} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="login-pw" /></label>
      <label>Código do autenticador (6 dígitos) ou código de recuperação<input style={inp} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="login-code" /></label>
      {err && <p style={{ color: "#ff8a8a" }} role="alert">{err}</p>}
      <button style={btn} disabled={busy || wait > 0 || !pw || !code} data-testid="login-go">{wait > 0 ? `Aguarde ${wait} s` : busy ? "Verificando…" : "Entrar"}</button>
      <p style={{ marginTop: 22, fontSize: 12, opacity: 0.7 }}>Esqueceu a senha ou perdeu o autenticador sem códigos de recuperação? <a href="#" style={{ color: "#ff9a9a" }} onClick={(e) => { e.preventDefault(); if (confirm("Isto APAGA o acesso e os dados locais deste navegador (irreversível). Continuar?")) { wipeAll(); location.reload(); } }}>Apagar tudo e recomeçar</a></p>
    </form>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [name, setName] = useState(""), [err, setErr] = useState(""), [p, setP] = useState<PendingSetup | null>(null), [qr, setQr] = useState(""), [code, setCode] = useState(""), [saved, setSaved] = useState(false);
  const start = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (pw !== pw2) return setErr("As senhas não coincidem.");
    try { const s = await beginSetup(pw, name || "usuario"); setP(s); setQr(await QRCode.toDataURL(s.uri, { margin: 1, width: 220 })); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  };
  const confirm = async (e: React.FormEvent) => { e.preventDefault(); if (await confirmSetup(code)) onDone(); else setErr("Código incorreto. Confira a hora do celular e tente de novo."); };
  if (!p) return (
    <form style={box} onSubmit={start} data-testid="setup">
      <h2 style={{ marginTop: 0 }}>Proteger o acesso</h2>
      <p>Crie uma senha forte. Em seguida você vinculará um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…). Os dados do caso salvos neste navegador passam a ser <b>cifrados</b> com essa senha.</p>
      <label>Seu nome / e-mail<input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Senha (mín. 10, com maiúscula, minúscula e número)<input style={inp} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="setup-pw" /></label>
      <label>Repita a senha<input style={inp} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="setup-pw2" /></label>
      {err && <p style={{ color: "#ff8a8a" }} role="alert">{err}</p>}
      <button style={btn} data-testid="setup-go">Continuar</button>
    </form>
  );
  return (
    <form style={box} onSubmit={confirm} data-testid="setup2">
      <h2 style={{ marginTop: 0 }}>Vincule o autenticador</h2>
      <p>1) Leia o QR code no aplicativo (ou digite a chave): <code data-testid="totp-secret" style={{ wordBreak: "break-all" }}>{p.secretB32}</code></p>
      <img src={qr} alt="QR code do autenticador" width={220} height={220} style={{ background: "#fff", borderRadius: 8 }} />
      <p>2) <b>Guarde os códigos de recuperação</b> (uso único) em local seguro — são a única saída se você perder o celular:</p>
      <pre data-testid="recovery" style={{ background: "#0a1422", padding: 10, borderRadius: 8, columns: 2 }}>{p.recovery.join("\n")}</pre>
      <label><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="saved" /> Guardei os códigos de recuperação</label>
      <label style={{ display: "block", marginTop: 12 }}>3) Digite o código de 6 dígitos mostrado no aplicativo<input style={inp} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="setup-code" /></label>
      {err && <p style={{ color: "#ff8a8a" }} role="alert">{err}</p>}
      <button style={btn} disabled={!saved || code.length < 6} data-testid="setup-confirm">Ativar</button>
    </form>
  );
}
