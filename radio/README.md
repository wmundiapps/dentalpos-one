# Rádio WMundi

Rádio estilo Spotify: playlists ilimitadas, upload de músicas, display de LED, banners de publicidade.
Página única, sem build: `radio/index.html`. Publicar na Vercel com a pasta `radio/` como raiz.

- **Anúncios:** edite `ads.json` (posições `topo`, `lateral`, `rodape`; cada item tem `imagem`, `link`, `patrocinador`). Sem item, aparece "Anuncie aqui".
- **Músicas:** nesta versão ficam no aparelho de quem sobe (IndexedDB). A aba "Descobrir" busca no Internet Archive.
- **Próxima etapa (banco/acesso → PR para o Robson):** contas, upload para todos (Supabase Storage + tabelas com RLS), moderação e direitos autorais.
