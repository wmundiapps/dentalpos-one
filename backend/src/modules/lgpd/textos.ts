// Finalidades de consentimento e textos-modelo (versão 1.0-modelo). MODELOS a serem validados por advogado:
// cada instituição pode publicar a sua própria versão (LgpTextoConsentimento) sem alterar código.
import { sha256 } from './mascara'

export interface FinalidadeDef {
  codigo: string
  titulo: string
  baseLegal: string
  sensivel: boolean
  exigeResponsavelMenor: boolean
  cookie?: boolean
  texto: string
}

export const VERSAO_MODELO = '1.0-modelo'

export const FINALIDADES: FinalidadeDef[] = [
  {
    codigo: 'COMUNICACAO_MARKETING', titulo: 'Receber divulgação e ofertas', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: true,
    texto: 'Autorizo a instituição a usar meu nome e meus dados de contato (e-mail, telefone e WhatsApp) para me enviar divulgação de cursos, eventos, bolsas e promoções. Esta autorização é opcional, separada das demais, e posso revogá-la a qualquer momento, de forma gratuita, pelo Portal do Titular ou respondendo SAIR a qualquer mensagem. Recusar não afeta minha matrícula nem o recebimento de avisos acadêmicos e financeiros.',
  },
  {
    codigo: 'USO_IMAGEM', titulo: 'Uso de imagem e voz', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: true,
    texto: 'Autorizo o uso da minha imagem e voz (fotos e vídeos de aulas, eventos e formaturas) em materiais institucionais e redes sociais da instituição, sem remuneração. A autorização pode ser revogada a qualquer momento; materiais já publicados serão retirados em prazo razoável, sem efeito retroativo sobre cópias já distribuídas.',
  },
  {
    codigo: 'PESQUISA_EGRESSOS', titulo: 'Contato de egressos e pesquisas', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: false,
    texto: 'Autorizo a instituição a manter meu contato e informações de trajetória profissional para acompanhamento de egressos, pesquisas de satisfação e convites a eventos. Participar é opcional e posso revogar quando quiser.',
  },
  {
    codigo: 'COMPARTILHAMENTO_PARCEIROS', titulo: 'Compartilhamento com empresas parceiras (estágio e vagas)', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: true,
    texto: 'Autorizo o compartilhamento do meu currículo e dados de contato com empresas parceiras para oportunidades de estágio e emprego. A instituição informará as empresas destinatárias e eu poderei revogar a autorização a qualquer momento.',
  },
  {
    codigo: 'DADOS_SAUDE', titulo: 'Dados de saúde e acessibilidade (dado sensível)', baseLegal: 'CONSENTIMENTO_DESTACADO', sensivel: true, exigeResponsavelMenor: true,
    texto: 'Consinto, de forma específica e destacada, com o tratamento de dados sobre minha saúde ou deficiência (laudos, necessidades de acessibilidade e atendimento psicopedagógico) exclusivamente para planejar apoios e adaptações pedagógicas. Esses dados têm acesso restrito e registrado e não serão usados para marketing. Posso revogar o consentimento; o atendimento já realizado e registros que a lei obriga a manter não serão apagados.',
  },
  {
    codigo: 'BIOMETRIA_FACIAL', titulo: 'Reconhecimento facial para presença e controle de acesso (dado biométrico sensível)', baseLegal: 'CONSENTIMENTO_DESTACADO', sensivel: true, exigeResponsavelMenor: true,
    texto: 'Consinto, de forma específica e destacada, com o tratamento do meu dado biométrico facial (um vetor numérico calculado no meu próprio aparelho a partir do meu rosto; a instituição NÃO guarda fotos nem vídeos do meu rosto) exclusivamente para registrar minha presença em aulas e meu acesso e retirada de materiais em espaços da instituição. O vetor é guardado criptografado, só é comparado para essas finalidades e nunca é usado para vigilância, marketing, avaliação de desempenho ou compartilhado com terceiros. Posso recusar sem qualquer prejuízo: terei sempre uma alternativa sem biometria (QR da carteirinha, código ou chamada manual). Posso revogar a qualquer momento, de forma gratuita, e o vetor será excluído imediatamente; os registros de presença já consolidados (obrigação acadêmica) são mantidos sem o dado biométrico.',
  },
  {
    codigo: 'COOKIES_PREFERENCIAS', titulo: 'Cookies de preferências', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: false, cookie: true,
    texto: 'Permitir cookies que lembram suas escolhas (idioma, tema e filtros) para personalizar a experiência. Não são necessários ao funcionamento básico.',
  },
  {
    codigo: 'COOKIES_ANALITICOS', titulo: 'Cookies de análise de uso', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: false, cookie: true,
    texto: 'Permitir cookies de estatística que ajudam a entender como as páginas públicas são usadas, de forma agregada, para melhorar o site.',
  },
  {
    codigo: 'COOKIES_MARKETING', titulo: 'Cookies de publicidade e campanhas', baseLegal: 'CONSENTIMENTO', sensivel: false, exigeResponsavelMenor: false, cookie: true,
    texto: 'Permitir cookies de campanhas para medir a origem de inscrições (UTM) e exibir divulgação mais relevante.',
  },
]

export const finalidadePorCodigo = (c: string) => FINALIDADES.find((f) => f.codigo === c)

export function textoModelo(f: FinalidadeDef) {
  return { finalidade: f.codigo, versao: VERSAO_MODELO, titulo: f.titulo, texto: f.texto, baseLegal: f.baseLegal, textoHash: sha256(f.texto), origem: 'MODELO' as const }
}

export const COOKIES_NECESSARIOS = {
  titulo: 'Cookies estritamente necessários',
  texto: 'Mantêm você conectado, protegem contra fraudes e lembram sua escolha neste aviso. Não podem ser desativados porque o site não funciona sem eles e não exigem consentimento.',
}
