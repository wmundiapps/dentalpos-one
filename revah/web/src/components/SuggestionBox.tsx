import { useState } from 'react'

// Caixa de sugestões e relato de erros, visível no fim de cada página. Envia pelo WhatsApp da WMundi.
export default function SuggestionBox() {
  const [texto, setTexto] = useState('')
  const enviar = () => {
    const msg = `Sugestão/erro (REVAH) — página ${window.location.pathname}:\n${texto.trim()}`
    window.open(`https://wa.me/5544999466451?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
    setTexto('')
  }
  return (
    <section className="no-print" style={{ margin: '32px 0 16px', padding: 16, border: '2px solid #f59e0b', borderRadius: 14, background: 'rgba(245,158,11,.10)' }}>
      <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.25 }}>QUAL MELHORIA VOCÊ GOSTARIA DE IMPLEMENTAR, NOS CONTE AQUI NA CAIXINHA DE SUGESTÕES</div>
      <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>CASO QUEIRA RELATAR ALGUM ERRO, PODE USAR ESTA MESMA CAIXA</div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} placeholder="Escreva aqui sua sugestão de melhoria ou o erro que encontrou…" style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', font: 'inherit', boxSizing: 'border-box' }} />
      <button type="button" className="btn" disabled={texto.trim().length < 3} onClick={enviar} style={{ marginTop: 8, fontWeight: 800 }}>Enviar</button>
    </section>
  )
}
