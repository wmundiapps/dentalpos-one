import { sha256 } from '../../lib/crypto'
import { config } from '../../config'

export const LEADS_TERMS_TEXT = `TERMO DE RESPONSABILIDADE — REVAH LEADS

1. A CONTRATANTE declara que utilizará os contatos obtidos pelo REVAH Leads exclusivamente para finalidades legítimas, compatíveis com a Lei nº 13.709/2018 (LGPD), o Código de Defesa do Consumidor e as regras de autorregulação de telemarketing aplicáveis.
2. A CONTRATANTE é a controladora dos dados pessoais que decidir importar, armazenar ou utilizar, e assume responsabilidade exclusiva pela base legal adotada (por exemplo, legítimo interesse devidamente avaliado ou consentimento), pela transparência com os titulares e pelo atendimento aos seus direitos.
3. É proibido utilizar os contatos para spam, envio em massa sem base legal, práticas enganosas, discriminatórias ou ilícitas, ou revendê-los a terceiros.
4. Todo pedido de descadastro recebido deverá ser respeitado imediatamente; o REVAH registra esses pedidos na lista de bloqueio do canal e impede novos envios automáticos.
5. A WMundi Technology & Co fornece a ferramenta de busca e não garante a exatidão, atualidade ou disponibilidade dos dados, nem resultados comerciais.
6. A WMundi poderá suspender o add-on em caso de indício de uso irregular, denúncias de titulares ou determinação de autoridade.
7. A CONTRATANTE isenta a WMundi de qualquer responsabilidade decorrente do uso que fizer dos contatos, obrigando-se a ressarci-la por prejuízos, multas ou condenações que venha a sofrer por esse uso.
8. Fica eleito o foro da Comarca de Maringá/PR para dirimir questões oriundas deste termo.`

export function currentTerms() {
  return { version: config.leads.termsVersion, text: LEADS_TERMS_TEXT, hash: sha256(`${config.leads.termsVersion}\n${LEADS_TERMS_TEXT}`) }
}
