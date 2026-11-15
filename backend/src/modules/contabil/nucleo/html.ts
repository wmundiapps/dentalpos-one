import { AVISO_LEGAL, esc } from './util'

/** Moldura HTML imprimível (espelhos, recibos, guias, relatórios). Sempre leva o aviso legal e, quando `simulacao`, a marca d'água. */
export function paginaHtml(titulo: string, corpo: string, o: { instituicao?: string; simulacao?: boolean; subtitulo?: string } = {}) {
  const marca = o.simulacao ? '<div class="marca">SIMULAÇÃO — SEM VALOR FISCAL</div>' : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<style>
*{box-sizing:border-box} body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:24px;max-width:900px;margin-inline:auto;position:relative}
h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px} .sub{color:#555;margin-bottom:14px}
table{border-collapse:collapse;width:100%;margin:6px 0} th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top} th{background:#f2f4f7}
td.n,th.n{text-align:right;white-space:nowrap} .kv{display:grid;grid-template-columns:180px 1fr;gap:3px 12px} .kv b{color:#444}
.marca{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:44px;font-weight:800;color:rgba(200,30,30,.13);transform:rotate(-18deg);pointer-events:none;z-index:0}
.aviso{margin-top:22px;padding:8px 10px;border:1px solid #d9a400;background:#fff8e1;font-size:12px}
.mono{font-family:ui-monospace,Menlo,monospace;word-break:break-all} .barras{height:46px;background:repeating-linear-gradient(90deg,#222 0 2px,#fff 2px 4px,#222 4px 5px,#fff 5px 8px);opacity:.55;margin:8px 0}
@media print{body{padding:0} .noprint{display:none}}
</style></head><body>${marca}
<div class="noprint" style="text-align:right"><button onclick="window.print()">Imprimir</button></div>
<h1>${esc(titulo)}</h1><div class="sub">${esc(o.instituicao ?? 'SUA INSTITUIÇÃO')} · EduMaster Pro${o.subtitulo ? ' · ' + esc(o.subtitulo) : ''}</div>
${corpo}
<div class="aviso"><b>Aviso:</b> ${esc(AVISO_LEGAL)}</div>
</body></html>`
}

export const kv = (pares: Array<[string, unknown]>) => `<div class="kv">${pares.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v ?? '—')}</span>`).join('')}</div>`
