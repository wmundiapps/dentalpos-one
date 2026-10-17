# Modelos de e-mail do LavaPos

| Arquivo | Quando usar | Assunto |
|---|---|---|
| 01-apresentacao | Apresentação a lava-rápidos (contato comercial B2B) | Seu lava-rápido com check-in com fotos, agenda e clube (30 dias grátis) |
| 02-boas-vindas | Logo após o cadastro (o sistema já envia uma versão em texto) | Bem-vindo ao LavaPos — seus 30 dias grátis começaram |
| 03-dia-20-teste | Dia 20 do teste | Faltam 10 dias do seu teste grátis do LavaPos |
| 04-fim-do-teste | Dia 31 (fim do teste) | Seu teste do LavaPos terminou — como continuar |

**Antes de enviar (👤):**
- Troque `{{nome}}`, `{{lavacar}}`, `{{link_cadastro}}` (`https://app.lavapos.com.br/?cadastro=1`) e `{{link_descadastro}}` na sua ferramenta de e-mail (RD Station, Mailchimp, Brevo…).
- Preencha razão social e CNPJ no rodapé.
- **Prospecção (e-mail 01):** só para e-mails de contato comercial de empresas, identificando quem envia e com opção de sair. **Não** copiar listas de contatos de outros sistemas (regra WMundi) e **não** usar o e-mail 01 para pessoas físicas. Envie pelo domínio com SPF, DKIM e DMARC configurados (veja docs/SEGURANCA.md).
- Os e-mails 02–04 vão apenas para quem criou conta.
