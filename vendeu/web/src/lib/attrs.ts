// Atributos opcionais por categoria (o servidor guarda como pares chave/valor, até 12).
export interface AttrDef { key: string; label: string; type: 'number' | 'text'; suffix?: string; placeholder?: string }

export const ATTR_DEFS: Record<string, AttrDef[]> = {
  automoveis: [
    { key: 'marca', label: 'Marca', type: 'text', placeholder: 'Ex.: Fiat' },
    { key: 'modelo', label: 'Modelo', type: 'text', placeholder: 'Ex.: Uno' },
    { key: 'ano', label: 'Ano', type: 'number', placeholder: '2012' },
    { key: 'km', label: 'Quilometragem', type: 'number', suffix: 'km' },
    { key: 'combustivel', label: 'Combustível', type: 'text', placeholder: 'Flex, gasolina…' },
    { key: 'cambio', label: 'Câmbio', type: 'text', placeholder: 'Manual ou automático' },
  ],
  imoveis: [
    { key: 'tipo', label: 'Tipo', type: 'text', placeholder: 'Casa, apartamento…' },
    { key: 'quartos', label: 'Quartos', type: 'number' },
    { key: 'banheiros', label: 'Banheiros', type: 'number' },
    { key: 'vagas', label: 'Vagas de garagem', type: 'number' },
    { key: 'area', label: 'Área', type: 'number', suffix: 'm²' },
  ],
  moveis: [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'cor', label: 'Cor', type: 'text' },
    { key: 'dimensoes', label: 'Dimensões', type: 'text', placeholder: 'Ex.: 180 x 80 x 75 cm' },
  ],
  brinquedos: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'idade', label: 'Idade indicada', type: 'text', placeholder: 'Ex.: a partir de 4 anos' },
  ],
  'utilidades-lar': [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'voltagem', label: 'Voltagem', type: 'text', placeholder: '110V, 220V ou bivolt' },
  ],
  outros: [{ key: 'marca', label: 'Marca', type: 'text' }],
};

const SUFFIX: Record<string, string> = { km: ' km', area: ' m²' };
const LABEL: Record<string, string> = Object.fromEntries(Object.values(ATTR_DEFS).flat().map((d) => [d.key, d.label]));

export function attrRows(attrs: Record<string, string | number> | null | undefined): { label: string; value: string }[] {
  return Object.entries(attrs ?? {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => ({ label: LABEL[k] ?? k.charAt(0).toUpperCase() + k.slice(1), value: `${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}${SUFFIX[k] ?? ''}` }));
}
