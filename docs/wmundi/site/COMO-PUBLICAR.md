# Como publicar o novo site da Wmundi (GoDaddy, WordPress ou Wix)

## Passo 1 — descobrir onde o site está
Abra o site wmundi.com em uma janela anônima e anote o que aparece:
1. Clique com o botão direito → **Exibir código-fonte**. Procure (Ctrl+F):
   - `wp-content` → **WordPress**
   - `wixstatic` ou `wix.com` → **Wix**
   - `godaddy` ou `secureserver` → **GoDaddy** (construtor da GoDaddy ou WordPress hospedado nela)
2. Para saber onde o **domínio** está registrado: https://lookup.icann.org → digite `wmundi.com` → veja "Registrar". Domínio e site podem estar em empresas diferentes.

## Passo 2 — colar a página
Arquivo: `docs/wmundi/site/index.html` (HTML único, sem dependências).

| Plataforma | Onde colar |
|---|---|
| WordPress | Páginas → Adicionar nova → bloco **HTML personalizado** → colar só o que está entre `<style>` e `</div>` final (ou usar plugin de página em branco) |
| Wix | Editor → Adicionar → **Incorporar código** → **Código HTML** → colar tudo |
| GoDaddy (construtor) | Seção → Adicionar → **HTML/Código personalizado** → colar tudo |

Dica: faça primeiro em uma página nova **não publicada** e confira no celular.

## Passo 3 — antes de publicar
- Trocar o e-mail de contato se houver um da Wmundi (hoje usa o do DentalPos).
- Conferir que nada de preço ou promessa não aprovada esteja no texto.
- Texto legal (privacidade/termos) só com aprovação do Robson e revisão da Dra. Roberta.

## Atualização (26/10/2026): o site agora tem amostras que rodam com JavaScript
O arquivo `index.html` agora contém um `<script>` com as 3 amostras e o formulário. Cuidados por plataforma:
- **WordPress:** o bloco "HTML personalizado" só mantém scripts para quem tem permissão de administrador (usuários sem essa permissão têm o script removido). Cole como administrador, ou use uma página em branco sem tema. Se o tema aplicar estilos próprios, as cores podem mudar: teste.
- **Wix:** use **Incorporar código > Código HTML** (roda dentro de um quadro isolado). Defina a altura do quadro grande o bastante para a página, ou publique só as seções (hero e amostras) e mantenha o resto no editor do Wix.
- **GoDaddy (construtor):** use a seção **HTML/Código personalizado**; alguns planos limitam scripts. Se bloquear, hospede o arquivo e coloque um link.
- Em qualquer plataforma: troque `CONFIG.email` no fim do arquivo e conecte o formulário a um formulário real da plataforma antes de anunciar.
- Decisões e plano de lançamento: `../SITE-DECISOES-E-LANCAMENTO.md`.
