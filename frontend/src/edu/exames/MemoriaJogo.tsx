import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@mui/material";
import "./memoria.css";
import { eduApi } from "../../services/EduApi";
import { ehAluno } from "./comum";
import medicina from "./memoria/memoria-medicina.json";
import direito from "./memoria/memoria-direito.json";
import odontologia from "./memoria/memoria-odontologia.json";
import enfermagem from "./memoria/memoria-enfermagem.json";
import psicologia from "./memoria/memoria-psicologia.json";
import administracao from "./memoria/memoria-administracao.json";

type Pair = { q: string; a: string };
type Theme = { id: string; nome: string; series: Pair[][] };
type Disc = { id: string; nome: string; temas: Theme[] };
type Serie = { id: string; n: number; pairs: Pair[]; themeId: string };
type Best = Record<string, { nota: number; perfect: boolean }>;
type BuiltTheme = Theme & { list: Serie[] };

// Conteúdo por curso. Curso sem conteúdo aparece como "em breve".
const CURSOS: Record<string, { nome: string; disciplinas: Disc[] }> = {
  medicina: medicina as { nome: string; disciplinas: Disc[] },
  direito: direito as { nome: string; disciplinas: Disc[] },
  odontologia: odontologia as { nome: string; disciplinas: Disc[] },
  enfermagem: enfermagem as { nome: string; disciplinas: Disc[] },
  psicologia: psicologia as { nome: string; disciplinas: Disc[] },
  administracao: administracao as { nome: string; disciplinas: Disc[] },
};
// Provas: ENADE deixa escolher o curso; ENAMED é só Medicina; OAB é só Direito.
const PROVAS: { id: string; nome: string; cursos: { id: string; nome: string }[] }[] = [
  { id: "enade", nome: "ENADE", cursos: [
    { id: "medicina", nome: "Medicina" }, { id: "direito", nome: "Direito" },
    { id: "odontologia", nome: "Odontologia" }, { id: "enfermagem", nome: "Enfermagem" },
    { id: "psicologia", nome: "Psicologia" }, { id: "administracao", nome: "Administração" } ] },
  { id: "enamed", nome: "ENAMED", cursos: [{ id: "medicina", nome: "Medicina" }] },
  { id: "oab", nome: "OAB", cursos: [{ id: "direito", nome: "Direito" }] },
];

function build(cursoId: string, disc: Disc): BuiltTheme[] {
  return disc.temas.map(t => ({
    ...t,
    list: t.series.map((pairs, i): Serie => ({ id: `${cursoId}-${disc.id}-${t.id}-${i + 1}`, n: i + 1, pairs, themeId: t.id })),
  }));
}
const PEEK = 30;
const HELP = 10;
const N = 6;
const STORE = "memoria_best_v2";

function loadBest(): Best {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
function saveBest(b: Best) {
  try { localStorage.setItem(STORE, JSON.stringify(b)); } catch { /* sem armazenamento */ }
}
function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const fmt = (n: number) => n.toFixed(1).replace(".", ",");

function prize(nota: number, perfect: boolean) {
  if (perfect) return { k: "taca", nome: "Taça de Ouro", cor: "#f2c14e" };
  if (nota >= 9) return { k: "ouro", nome: "Medalha de Ouro", cor: "#f2c14e" };
  if (nota >= 7) return { k: "prata", nome: "Medalha de Prata", cor: "#b8c4cf" };
  if (nota >= 5) return { k: "bronze", nome: "Medalha de Bronze", cor: "#d08a55" };
  return { k: "nenhum", nome: "Sem prêmio ainda", cor: "#9aa7b4" };
}
function Prize({ nota, perfect, size = 40 }: { nota: number; perfect: boolean; size?: number }) {
  const p = prize(nota, perfect);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-label={p.nome} role="img">
      {p.k === "taca" ? (
        <>
          <path d="M20 8h24v16a12 12 0 0 1-24 0z" fill={p.cor} />
          <path d="M20 12h-8c0 10 4 14 10 15M44 12h8c0 10-4 14-10 15" fill="none" stroke={p.cor} strokeWidth="3" />
          <rect x="29" y="34" width="6" height="12" fill={p.cor} />
          <rect x="20" y="46" width="24" height="8" rx="2" fill={p.cor} />
        </>
      ) : p.k === "nenhum" ? (
        <circle cx="32" cy="38" r="16" fill="none" stroke={p.cor} strokeWidth="3" strokeDasharray="4 4" />
      ) : (
        <>
          <path d="M20 6l10 22h-8L12 6zM44 6L34 28h8l10-22z" fill="#14b8a6" />
          <circle cx="32" cy="40" r="17" fill={p.cor} />
          <circle cx="32" cy="40" r="11" fill="none" stroke="#ffffff" strokeWidth="2" opacity=".7" />
        </>
      )}
    </svg>
  );
}

type Sel = { t: "q" | "a"; pos: number } | null;

function Game({ serie, onFinish, onNext, hasNext }: {
  serie: Serie; onFinish: (nota: number, perfect: boolean, erros: number, ajudas: number) => void; onNext: () => void; hasNext: boolean;
}) {
  const [qOrder] = useState(() => shuffle([...Array(N).keys()]));
  const [aOrder] = useState(() => shuffle([...Array(N).keys()]));
  const [phase, setPhase] = useState<"idle" | "ask" | "done">("idle");
  const [closed, setClosed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<number[]>([]);
  const [err, setErr] = useState<number[]>(() => Array(N).fill(0));
  const [helps, setHelps] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"" | "ok" | "bad">("");
  const [peekBtn, setPeekBtn] = useState<string | null>(null);
  const [result, setResult] = useState<{ nota: number; perfect: boolean } | null>(null);
  const skip = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const peek = useCallback(async (sec: number, label: string, text: string) => {
    setSel(null); setClosed(false); setBusy(true); skip.current = false; setPeekBtn(label); setMsgKind("");
    for (let t = sec; t > 0 && !skip.current && alive.current; t--) {
      setMsg(`${text} ${t}s`);
      await sleep(1000);
    }
    setClosed(true); setMsg(""); setPeekBtn(null);
    await sleep(650);
  }, []);

  async function begin() {
    setPhase("ask");
    await peek(PEEK, "Já memorizei", "Leia e memorize onde cada cartão está:");
    setBusy(false);
    setMsg("Toque numa pergunta e depois na resposta que forma o par.");
  }
  async function help() {
    if (phase !== "ask") return;
    if (busy) { skip.current = true; return; }
    setHelps(h => h + 1);
    await peek(HELP, "Fechar ajuda", "Ajuda ativa (desconta da nota). Fecha em");
    setBusy(false);
    setMsg("Toque numa pergunta e depois na resposta que forma o par.");
  }
  async function pick(t: "q" | "a", pos: number) {
    if (phase !== "ask" || busy) return;
    if (!sel || sel.t === t) {
      setSel({ t, pos });
      setMsgKind("");
      setMsg(`Agora escolha ${t === "q" ? "a resposta" : "a pergunta"} que forma o par.`);
      return;
    }
    setBusy(true);
    const qpos = t === "q" ? pos : sel.pos;
    const apos = t === "a" ? pos : sel.pos;
    const qi = qOrder[qpos], ai = aOrder[apos];
    setSel({ t, pos });
    if (qi === ai) {
      const nm = [...matched, qi];
      setMatched(nm); setSel(null); setMsgKind("ok"); setMsg("Par certo.");
      await sleep(1100);
      if (!alive.current) return;
      setBusy(false); setMsg(""); setMsgKind("");
      if (nm.length === N) finish(err, helps);
    } else {
      const ne = err.slice(); ne[qi]++;
      setErr(ne); setWrong([`q${qpos}`, `a${apos}`]); setSel(null);
      setMsgKind("bad"); setMsg("Não é par. Guarde onde estavam essas duas cartas.");
      await sleep(1700);
      if (!alive.current) return;
      setWrong([]); setBusy(false); setMsg(""); setMsgKind("");
    }
  }
  function finish(e: number[], h: number) {
    const pts = e.map(x => Math.max(0, 1 - 0.25 * x)).reduce((a, b) => a + b, 0);
    const nota = Math.max(0, Math.round(((pts - 0.25 * h) / N) * 100) / 10);
    const perfect = e.every(x => x === 0) && h === 0;
    setResult({ nota, perfect }); setPhase("done");
    onFinish(nota, perfect, e.reduce((a, b) => a + b, 0), h);
  }

  const total = err.reduce((a, b) => a + b, 0);
  const grid = (t: "q" | "a", order: number[]) => (
    <div className="mem-grid">
      {order.map((idx, pos) => {
        const m = matched.includes(idx);
        const isSel = !!sel && sel.t === t && sel.pos === pos;
        const bad = wrong.includes(`${t}${pos}`);
        const isClosed = closed && !m && !isSel && !bad;
        const txt = t === "q" ? serie.pairs[idx].q : serie.pairs[idx].a;
        const cls = ["mem-card", t, isClosed ? "closed" : "", m ? "matched" : "", bad ? "wrong" : "", isSel ? "sel" : ""].filter(Boolean).join(" ");
        return (
          <button key={`${t}${idx}`} className={cls} disabled={m || phase !== "ask" || busy}
            aria-label={isClosed ? (t === "q" ? "Pergunta fechada" : "Resposta fechada") : txt} onClick={() => pick(t, pos)}>
            <span className="mem-in">
              <span className="mem-face">{txt}</span>
              <span className="mem-back">{t === "q" ? "?" : "A"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mem-game">
      <div className="mem-bar">
        <span>Pares <b>{matched.length}</b>/{N}</span>
        <span className="mem-track"><i style={{ width: `${(matched.length / N) * 100}%` }} /></span>
        <span>Erros <b>{total}</b></span>
        <span>Ajudas <b>{helps}</b></span>
      </div>
      <div className={`mem-msg ${msgKind}`} aria-live="polite">
        {phase === "idle" && !msg ? `Ao tocar em Começar, os ${N * 2} cartões abrem por ${PEEK} segundos e depois fecham. Depois, ache os pares.` : msg}
      </div>
      {grid("q", qOrder)}
      {grid("a", aOrder)}
      <div className="mem-actions">
        {phase === "idle" && <button className="mem-btn" onClick={begin}>Começar</button>}
        {peekBtn && <button className="mem-btn" onClick={() => { skip.current = true; }}>{peekBtn}</button>}
        {phase === "ask" && !busy && <button className="mem-btn ghost" onClick={help}>Ajuda: ver cartões</button>}
      </div>
      {result && (
        <div className="mem-result">
          <Prize nota={result.nota} perfect={result.perfect} size={96} />
          <div>
            <div className="mem-eyebrow">Sua nota</div>
            <div className="mem-nota">{fmt(result.nota)}</div>
          </div>
          <div className="mem-result-text">
            <h3>{prize(result.nota, result.perfect).nome}</h3>
            <p className="mem-muted">{total === 0 && helps === 0 ? "Nenhum erro e nenhuma ajuda. Memória perfeita." : `${total} erro${total === 1 ? "" : "s"} e ${helps} ajuda${helps === 1 ? "" : "s"} nesta série.`}</p>
            <div className="mem-actions">
              {hasNext && <button className="mem-btn" onClick={onNext}>Próxima série</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemoriaJogo() {
  const muiTheme = useTheme();
  const vars = {
    "--mem-surface": muiTheme.palette.background.paper, "--mem-bg": muiTheme.palette.background.default,
    "--mem-fg": muiTheme.palette.text.primary, "--mem-muted": muiTheme.palette.text.secondary,
    "--mem-line": muiTheme.palette.divider, "--mem-accent": muiTheme.palette.primary.main,
    "--mem-dark": muiTheme.palette.mode === "dark" ? "1" : "0",
  } as CSSProperties;
  const [best, setBest] = useState<Best>(loadBest);
  const aluno = ehAluno();
  const [salvo, setSalvo] = useState<"" | "ok" | "erro">("");
  // Aluno logado: o progresso vem do servidor (portal do aluno) e se junta ao que já estava neste aparelho.
  useEffect(() => {
    if (!aluno) return;
    eduApi.get<{ items: Array<{ serieId: string; melhorNota: number; perfeita: boolean }> }>("/exames/memoria/meu").then(r => {
      setBest(old => {
        const b: Best = { ...old };
        for (const i of r.items) {
          const o = b[i.serieId];
          if (!o || i.melhorNota > o.nota || (i.perfeita && !o.perfect)) b[i.serieId] = { nota: i.melhorNota, perfect: i.perfeita };
        }
        saveBest(b);
        return b;
      });
    }).catch(() => undefined);
  }, [aluno]);
  const [provaId, setProvaId] = useState("enade");
  const prova = PROVAS.find(p => p.id === provaId)!;
  const [cursoId, setCursoId] = useState("medicina");
  const curso = CURSOS[cursoId];
  const [discId, setDiscId] = useState("anatomia");
  const disc = curso?.disciplinas.find(d => d.id === discId) || curso?.disciplinas[0];
  const themes = useMemo(() => (disc ? build(cursoId, disc) : []), [cursoId, disc]);
  const [themeId, setThemeId] = useState(themes[0]?.id ?? "");
  const theme = themes.find(t => t.id === themeId) || themes[0];
  const [serieId, setSerieId] = useState(theme?.list[0].id ?? "");
  const [run, setRun] = useState(0);
  const serie = theme?.list.find(s => s.id === serieId) || theme?.list[0];
  const unlocked = (s: Serie) => s.n === 1 || !!best[theme.list[s.n - 2].id];

  function select(c: string, d?: string) {
    const cur = CURSOS[c];
    setCursoId(c);
    if (!cur) return;
    const dd = cur.disciplinas.find(x => x.id === d) || cur.disciplinas[0];
    const ts = build(c, dd);
    setDiscId(dd.id); setThemeId(ts[0].id); setSerieId(ts[0].list[0].id); setRun(r => r + 1);
  }
  function chooseProva(id: string) {
    const p = PROVAS.find(x => x.id === id)!;
    setProvaId(id);
    const first = p.cursos.find(c => c.id === cursoId) || p.cursos[0];
    select(first.id);
  }
  function chooseTheme(id: string) {
    const t = themes.find(x => x.id === id)!;
    setThemeId(id);
    setSerieId((t.list.find(s => !best[s.id] && (s.n === 1 || best[t.list[s.n - 2].id])) || t.list[0]).id);
    setRun(r => r + 1);
  }
  function chooseSerie(id: string) { setSerieId(id); setRun(r => r + 1); }
  function onFinish(nota: number, perfect: boolean, erros: number, ajudas: number) {
    setSalvo("");
    if (aluno && disc && theme && serie) {
      eduApi.post("/exames/memoria/resultado", {
        serieId: serie.id, prova: prova.nome, curso: curso.nome, disciplina: disc.nome, tema: theme.nome, numero: serie.n,
        nota, erros, ajudas, perfeita: perfect,
      }).then(() => setSalvo("ok")).catch(() => setSalvo("erro"));
    }
    const old = best[serie.id];
    if (!old || nota > old.nota || (perfect && !old.perfect)) {
      const b = { ...best, [serie.id]: { nota, perfect } };
      setBest(b); saveBest(b);
    }
  }
  const next = theme && serie ? (theme.list[serie.n] ?? themes[themes.indexOf(theme) + 1]?.list[0]) : undefined;
  function goNext() {
    if (!next) return;
    setThemeId(next.themeId); setSerieId(next.id); setRun(r => r + 1);
  }

  const mySeries = themes.flatMap(t => t.list);
  const doneAll = mySeries.filter(s => best[s.id]);
  const avg = doneAll.length ? doneAll.reduce((a, s) => a + best[s.id].nota, 0) / doneAll.length : 0;
  const summary = useMemo(() => themes.map(t => {
    const ds = t.list.filter(s => best[s.id]);
    const av = ds.length ? ds.reduce((a, s) => a + best[s.id].nota, 0) / ds.length : null;
    return { t, ds: ds.length, av, master: ds.length === t.list.length && av !== null && av >= 9 };
  }), [best, themes]);

  return (
    <section className={`mem ${muiTheme.palette.mode === "dark" ? "mem-dark" : ""}`} style={vars}>
      <h3 className="mem-title">{disc ? `Jogo da memória · ${curso.nome} · ${disc.nome}` : "Jogo da memória"}</h3>
      <p className="mem-muted mem-intro">Memorize os cartões abertos. Depois que fecham, ache cada pergunta com a sua resposta. Cada série tem 6 pares; cada erro e cada Ajuda descontam da nota.</p>
      <div className="mem-series" role="tablist" aria-label="Prova">
        {PROVAS.map(p => (
          <button key={p.id} className={`mem-chip ${p.id === provaId ? "on" : ""}`} onClick={() => chooseProva(p.id)}>{p.nome}</button>
        ))}
      </div>
      <div className="mem-pick">
        {prova.cursos.length > 1 ? (
          <label>Curso
            <select value={cursoId} onChange={e => select(e.target.value)}>
              {prova.cursos.map(c => <option key={c.id} value={c.id}>{c.nome}{CURSOS[c.id] ? "" : " (em breve)"}</option>)}
            </select>
          </label>
        ) : (
          <label>Curso<select value={cursoId} disabled><option>{prova.cursos[0].nome}</option></select></label>
        )}
        {curso && (
          <label>Disciplina
            <select value={disc.id} onChange={e => select(cursoId, e.target.value)}>
              {curso.disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </label>
        )}
        {theme && (
          <label>Tema
            <select value={theme.id} onChange={e => chooseTheme(e.target.value)}>
              {themes.map(t => <option key={t.id} value={t.id}>{t.nome} ({t.list.filter(s => best[s.id]).length}/{t.list.length})</option>)}
            </select>
          </label>
        )}
      </div>
      {!curso || !theme || !serie ? (
        <div className="mem-alert">As perguntas de {prova.cursos.find(c => c.id === cursoId)?.nome} para o {prova.nome} ainda estão sendo preparadas. Escolha outro curso por enquanto.</div>
      ) : (
        <>
          <div className="mem-series">
            {theme.list.map(s => {
              const b = best[s.id], ok = unlocked(s);
              return (
                <button key={s.id} className={`mem-chip ${s.id === serie.id ? "on" : ""}`} disabled={!ok} onClick={() => chooseSerie(s.id)}>
                  {b && <Prize nota={b.nota} perfect={b.perfect} size={18} />}Série {s.n}{!ok && <small> bloqueada</small>}
                </button>
              );
            })}
          </div>
          {salvo === "ok" && <p className="mem-muted">Resultado salvo no seu portal do aluno.</p>}
          {salvo === "erro" && <p className="mem-muted">Não foi possível salvar no portal agora. O resultado ficou neste aparelho.</p>}
          <Game key={`${serie.id}-${run}`} serie={serie} onFinish={onFinish} onNext={goNext} hasNext={!!next} />
          <h4 className="mem-h">Prêmios</h4>
          <p className="mem-muted">{doneAll.length} de {mySeries.length} séries concluídas{doneAll.length ? ` · média ${fmt(avg)}` : ""}. Fica salvo o melhor resultado de cada série neste aparelho.</p>
          <div className="mem-themes">
            {summary.map(({ t, ds, av, master }) => (
              <div className="mem-theme" key={t.id}>
                <b>{t.nome}</b>
                <div className="mem-meds">
                  {t.list.map(s => { const b = best[s.id]; return <span key={s.id} style={{ opacity: b ? 1 : 0.35 }}><Prize nota={b?.nota ?? 0} perfect={!!b?.perfect} size={30} /></span>; })}
                </div>
                <small className="mem-muted">{ds}/{t.list.length} séries{av !== null ? ` · média ${fmt(av)}` : ""}</small>
                {master && <span className="mem-master">Mestre do tema</span>}
              </div>
            ))}
          </div>
          <p className="mem-muted mem-legend">Taça de Ouro: série sem erros e sem Ajuda. Ouro: 9 a 9,9. Prata: 7 a 8,9. Bronze: 5 a 6,9. A série seguinte abre ao terminar a anterior.</p>
        </>
      )}
    </section>
  );
}
