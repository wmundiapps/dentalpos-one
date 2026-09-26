# SpaceHour: publicar o aplicativo no Google Play e na App Store

O aplicativo (`espacos/mobile`, Capacitor) abre o site space-hour.com e acrescenta recursos nativos: **notificações push**, ícone, tela de abertura, botão Voltar do Android, câmera e fotos para os anúncios, e uma tela própria para quando não há internet. Cada atualização do site aparece no app na hora, sem mandar versão nova para as lojas. Só alterações nativas (ícone, plugins, permissões) precisam de versão nova.

Identificador do app nas duas lojas: **`com.spacehour.app`**

> Nas variáveis da Vercel, **não marque "Sensitive"**. Nunca cole chaves, senhas ou arquivos .p8/.json no chat.

---

## 1. Contas (comece por aqui, porque demora)

As contas são da **pessoa jurídica: Instituto Ravel de Ensino Superior Ltda (CNPJ 03.162.275/0001-10)**. DentalPOS e WMundi são nomes fantasia e não podem ser o titular.
- **Google Play:** o nome de desenvolvedor que aparece na loja é livre. Pode ser "SpaceHour" ou "WMundi".
- **Apple:** a App Store mostra como vendedor o **nome jurídico** que consta no D-U-N-S (Instituto Ravel...).
- A mesma conta serve para publicar outros apps no futuro, como o DentalPOS.

1. **D-U-N-S (grátis):** https://developer.apple.com/enroll/duns-lookup/. Informe exatamente a razão social e o endereço do CNPJ. Leva de alguns dias a cerca de 2 semanas.
2. **Apple Developer Program**, como organização (US$ 99 por ano): https://developer.apple.com/programs/enroll/. Precisa do D-U-N-S e de um site com o nome da empresa. O rodapé do space-hour.com já mostra a razão social e o CNPJ.
3. **Google Play Console**, como organização (US$ 25 uma vez): https://play.google.com/console/signup. Também pede D-U-N-S e verificação da empresa. Conta de organização não precisa dos 12 testadores por 14 dias que a conta pessoal exige.

## 2. Notificações push

### Android (Firebase)
1. Em https://console.firebase.google.com, clique em **Adicionar projeto** e dê o nome **SpaceHour**. Pode desativar o Google Analytics.
2. Clique em **Adicionar app → Android** e informe o pacote `com.spacehour.app`. Baixe o **google-services.json**.
3. No GitHub, abra o repositório e vá em **Settings → Secrets and variables → Actions → New repository secret**:
   - Nome: `SPACEHOUR_GOOGLE_SERVICES_JSON`
   - Valor: todo o conteúdo do google-services.json.
4. No Firebase, vá em ⚙️ **Configurações do projeto → Contas de serviço → Gerar nova chave privada**. Baixa um .json.
5. Na Vercel, crie a variável `FIREBASE_SERVICE_ACCOUNT` com todo o conteúdo desse .json e faça o Redeploy.

### iPhone (APNs)
1. No portal da Apple, vá em https://developer.apple.com/account/resources/authkeys/list e clique em **+**. Dê o nome "SpaceHour Push" e marque **Apple Push Notifications service (APNs)**. Baixe o arquivo **AuthKey_XXXXXXXXXX.p8**, que só pode ser baixado uma vez; guarde uma cópia.
2. Na Vercel, crie estas variáveis e faça o Redeploy:

| Variável | Valor |
|---|---|
| `APNS_KEY` | conteúdo do .p8 (inclui as linhas BEGIN/END) |
| `APNS_KEY_ID` | os 10 caracteres do nome do arquivo (XXXXXXXXXX) |
| `APNS_TEAM_ID` | Team ID (canto superior direito do portal da Apple) |

## 3. Android: gerar e publicar

### 3.1 Chave de upload (uma vez, no seu computador Windows)
1. Instale o Java: https://adoptium.net (Temurin 21, instalador .msi).
2. No PowerShell:
```
keytool -genkeypair -v -keystore spacehour-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
   Crie uma senha forte e responda as perguntas (nome: Instituto Ravel; cidade: Maringá; estado: PR; país: BR). **Guarde o arquivo .jks e a senha num lugar seguro**, com cópia. Sem eles não dá para atualizar o app.
3. Copie o arquivo em base64 para a área de transferência:
```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\spacehour-upload.jks")) | Set-Clipboard
```
4. No GitHub, em Settings → Secrets and variables → Actions, crie os secrets:

| Secret | Valor |
|---|---|
| `SPACEHOUR_ANDROID_KEYSTORE_B64` | colar da área de transferência |
| `SPACEHOUR_ANDROID_KEYSTORE_PASSWORD` | a senha |
| `SPACEHOUR_ANDROID_KEY_ALIAS` | `upload` |
| `SPACEHOUR_ANDROID_KEY_PASSWORD` | a senha (a mesma, se você não criou outra) |

### 3.2 Gerar o app
1. No GitHub, vá em **Actions → SpaceHour app Android → Run workflow**, informe a versão `1.0.0` e clique em Run.
2. Quando terminar (cerca de 10 minutos), baixe em **Artifacts**:
   - o **.apk**: instale no seu Android para testar;
   - o **.aab**: é o que vai para o Google Play.

### 3.3 Google Play Console
1. Clique em **Criar app**: nome "SpaceHour", idioma português (Brasil), tipo App, gratuito.
2. Aceite a **Assinatura de apps do Google Play** (o Google guarda a chave final; a sua é só de upload).
3. Vá em **Testes → Teste interno**, envie o .aab e adicione o seu e-mail como testador.
4. Preencha a **Presença na loja** com os textos da seção 5 e os prints (seção 6).
5. Em **Conteúdo do app**:
   - **Política de privacidade:** `https://space-hour.com/regras/privacy`
   - **Exclusão de conta:** `https://space-hour.com/excluir-conta`
   - **Acesso ao app:** informe um login de teste (seção 7).
   - **Anúncios:** o app não contém anúncios.
   - **Público-alvo:** 18 anos ou mais.
   - **Classificação de conteúdo:** preencha o questionário (sem violência, sem conteúdo gerado por usuários além de avaliações e mensagens).
   - **Segurança dos dados**, marque:
     - coletados: nome, e-mail, telefone, fotos, documento de registro profissional, mensagens e histórico de compras;
     - pagamento processado pelo Mercado Pago;
     - dados criptografados em trânsito;
     - o usuário pode pedir exclusão.
6. Quando o teste interno estiver ok, vá em **Produção → Criar versão** e envie para análise (de 1 a 7 dias na primeira vez).

## 4. iPhone: gerar e publicar

1. Em https://appstoreconnect.apple.com, vá em **Meus apps → + → Novo app**: plataforma iOS, nome "SpaceHour – Salas por hora", idioma português (Brasil), bundle ID `com.spacehour.app` e SKU `spacehour-ios`.
   - Se o bundle ID não aparecer, crie antes em https://developer.apple.com/account/resources/identifiers/add/bundleId com a capacidade **Push Notifications** marcada.
2. Crie a chave da API: **Usuários e acesso → Integrações → App Store Connect API → +**. Papel **App Manager**. Baixe o .p8 e anote o Key ID e o Issuer ID.
3. No GitHub, crie os secrets:

| Secret | Valor |
|---|---|
| `SPACEHOUR_ASC_KEY_ID` | Key ID |
| `SPACEHOUR_ASC_ISSUER_ID` | Issuer ID |
| `SPACEHOUR_ASC_KEY_P8` | conteúdo do .p8 |
| `SPACEHOUR_APPLE_TEAM_ID` | Team ID |

4. Vá em **Actions → SpaceHour app iOS → Run workflow**, versão `1.0.0`. O build vai direto para o **TestFlight**.
5. No TestFlight, instale no seu iPhone pelo app TestFlight e teste.
6. Em **App Store → versão 1.0.0**, preencha:
   - textos (seção 5) e prints (seção 6);
   - privacidade: URL `https://space-hour.com/regras/privacy`;
   - "Privacidade do app": os mesmos dados da seção de segurança do Google Play (nenhum usado para rastreamento).
7. **Notas para o revisor** (copie):
```
O SpaceHour é um marketplace de aluguel de consultórios e salas por hora. O pagamento é de um serviço físico usado fora do app (locação de espaço), processado pelo Mercado Pago, conforme a diretriz 3.1.5(a). O app envia notificações push de reservas, mensagens e pagamentos. A exclusão de conta está em Perfil > Excluir conta. Login de teste: [e-mail] / [senha].
```
8. Clique em **Enviar para revisão** (costuma levar de 1 a 3 dias).

## 5. Textos das lojas

- **Nome (até 30):** `SpaceHour – Salas por hora`
- **Subtítulo Apple (até 30):** `Consultórios e salas por hora`
- **Descrição curta Google (até 80):** `Consultório e sala por hora, sem contrato. Anuncie grátis o seu espaço ocioso.`
- **Palavras-chave Apple (até 100):** `consultório,sala,aluguel,hora,coworking,dentista,psicólogo,fisioterapia,clínica,sublocação`
- **Categoria:** Negócios (Business)

**Descrição completa:**
```
O SpaceHour conecta quem tem consultório, clínica ou sala com horários vagos a profissionais que precisam de um espaço pronto por algumas horas.

PARA PROFISSIONAIS
• Consultórios odontológicos, salas de atendimento, psicologia, fisioterapia, clínicas, salas de aula e auditórios
• Pague só pelas horas que usar: sem contrato de aluguel, sem condomínio e sem fiador
• Reserve avulso ou toda semana no mesmo horário
• Pagamento online com Pix ou cartão pelo Mercado Pago
• Fotos, equipamentos, regras e avaliações de cada espaço
• Endereço liberado após a confirmação da reserva

PARA DONOS DE ESPAÇOS
• Anuncie grátis os horários ociosos do seu consultório ou sala
• Você define preço, dias, horários e regras, e aprova cada pedido ou aceita reservas na hora
• O pagamento cai direto na sua conta Mercado Pago
• Profissionais com registro no conselho verificado
• Caução, avalista e mediação de incidentes

NOTIFICAÇÕES
Receba no celular os avisos de novas reservas, mensagens e pagamentos.

Dúvidas: support@space-hour.com
```

## 6. Prints (screenshots)

- **Google Play:** de 2 a 8 prints de celular (1080×1920 ou maiores) e a imagem de destaque de 1024×500.
- **Apple:** prints de iPhone 6,9" (1320×2868) ou 6,7" (1290×2796). iPad só se o app for liberado para iPad.

Posso gerar esses prints automaticamente com o site em produção, depois que houver espaços reais anunciados.

## 7. Login de teste para os revisores

1. Crie uma conta de verdade no site, por exemplo `revisao@space-hour.com` (um alias do e-mail noreply na GoDaddy), e confirme o e-mail.
2. Informe esse login e a senha nos dois consoles.
3. Os revisores precisam ver pelo menos um espaço anunciado.

## 8. Variáveis e segredos (resumo)

| Onde | Nome | Para quê |
|---|---|---|
| Vercel | `FIREBASE_SERVICE_ACCOUNT` | push Android |
| Vercel | `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` | push iPhone |
| GitHub | `SPACEHOUR_GOOGLE_SERVICES_JSON` | push Android (no app) |
| GitHub | `SPACEHOUR_ANDROID_KEYSTORE_B64`, `..._PASSWORD`, `..._KEY_ALIAS`, `..._KEY_PASSWORD` | assinar o Android |
| GitHub | `SPACEHOUR_ASC_KEY_ID`, `SPACEHOUR_ASC_ISSUER_ID`, `SPACEHOUR_ASC_KEY_P8`, `SPACEHOUR_APPLE_TEAM_ID` | gerar e enviar o iOS |
