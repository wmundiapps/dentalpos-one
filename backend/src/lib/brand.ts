// Nome da marca nas mensagens enviadas pelo sistema. No ambiente de demonstração do EduMaster fica "SUA INSTITUIÇÃO"
// (variável APP_BRAND_NAME) e, depois da venda, recebe o nome real da instituição.
export const BRAND_NAME = (process.env.APP_BRAND_NAME || '').trim() || 'DentalPos One'
