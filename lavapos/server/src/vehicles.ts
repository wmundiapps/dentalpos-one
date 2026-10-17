// Marcas e modelos mais comuns no Brasil, já na categoria do lava-rápido. Serve para o cadastro por barra de rolagem.
export type CategoryKey = 'carro' | 'suv' | 'utilitario' | 'van' | 'caminhao';

export const CATEGORIES: { key: CategoryKey; name: string; order: number }[] = [
  { key: 'carro', name: 'Carro', order: 1 },
  { key: 'suv', name: 'SUV', order: 2 },
  { key: 'utilitario', name: 'Utilitários', order: 3 },
  { key: 'van', name: 'Vans', order: 4 },
  { key: 'caminhao', name: 'Caminhões', order: 5 },
];

type M = [string, CategoryKey];
export const VEHICLE_CATALOG: Record<string, M[]> = {
  Chevrolet: [['Onix', 'carro'], ['Onix Plus', 'carro'], ['Prisma', 'carro'], ['Cruze', 'carro'], ['Tracker', 'suv'], ['Equinox', 'suv'], ['Trailblazer', 'suv'], ['Spin', 'utilitario'], ['Montana', 'utilitario'], ['S10', 'utilitario'], ['Silverado', 'utilitario'], ['Express', 'van']],
  Fiat: [['Mobi', 'carro'], ['Argo', 'carro'], ['Cronos', 'carro'], ['Uno', 'carro'], ['Pulse', 'suv'], ['Fastback', 'suv'], ['Strada', 'utilitario'], ['Toro', 'utilitario'], ['Fiorino', 'utilitario'], ['Ducato', 'van'], ['Scudo', 'van']],
  Volkswagen: [['Gol', 'carro'], ['Polo', 'carro'], ['Virtus', 'carro'], ['Voyage', 'carro'], ['Fox', 'carro'], ['Jetta', 'carro'], ['T-Cross', 'suv'], ['Nivus', 'suv'], ['Taos', 'suv'], ['Tiguan', 'suv'], ['Saveiro', 'utilitario'], ['Amarok', 'utilitario'], ['Delivery', 'caminhao'], ['Constellation', 'caminhao'], ['Transporter', 'van']],
  Ford: [['Ka', 'carro'], ['Fiesta', 'carro'], ['Focus', 'carro'], ['EcoSport', 'suv'], ['Territory', 'suv'], ['Bronco Sport', 'suv'], ['Ranger', 'utilitario'], ['Maverick', 'utilitario'], ['Transit', 'van'], ['Cargo', 'caminhao']],
  Toyota: [['Etios', 'carro'], ['Yaris', 'carro'], ['Corolla', 'carro'], ['Corolla Cross', 'suv'], ['RAV4', 'suv'], ['SW4', 'suv'], ['Hilux', 'utilitario'], ['Hiace', 'van']],
  Honda: [['Fit', 'carro'], ['City', 'carro'], ['Civic', 'carro'], ['HR-V', 'suv'], ['WR-V', 'suv'], ['CR-V', 'suv']],
  Hyundai: [['HB20', 'carro'], ['HB20S', 'carro'], ['Creta', 'suv'], ['Tucson', 'suv'], ['Santa Fe', 'suv'], ['HR', 'utilitario'], ['HD80', 'caminhao']],
  Renault: [['Kwid', 'carro'], ['Sandero', 'carro'], ['Logan', 'carro'], ['Duster', 'suv'], ['Captur', 'suv'], ['Oroch', 'utilitario'], ['Kangoo', 'utilitario'], ['Master', 'van']],
  Jeep: [['Renegade', 'suv'], ['Compass', 'suv'], ['Commander', 'suv'], ['Wrangler', 'suv']],
  Nissan: [['March', 'carro'], ['Versa', 'carro'], ['Kicks', 'suv'], ['Frontier', 'utilitario']],
  Peugeot: [['208', 'carro'], ['2008', 'suv'], ['3008', 'suv'], ['Partner', 'utilitario'], ['Expert', 'van'], ['Boxer', 'van']],
  Citroën: [['C3', 'carro'], ['C4 Cactus', 'suv'], ['Jumpy', 'van'], ['Jumper', 'van'], ['Berlingo', 'utilitario']],
  Mitsubishi: [['L200 Triton', 'utilitario'], ['Pajero Sport', 'suv'], ['Eclipse Cross', 'suv'], ['ASX', 'suv']],
  BMW: [['Série 3', 'carro'], ['Série 1', 'carro'], ['X1', 'suv'], ['X3', 'suv'], ['X5', 'suv']],
  'Mercedes-Benz': [['Classe C', 'carro'], ['Classe A', 'carro'], ['GLA', 'suv'], ['GLC', 'suv'], ['Sprinter', 'van'], ['Accelo', 'caminhao'], ['Actros', 'caminhao'], ['Atego', 'caminhao'], ['Axor', 'caminhao']],
  Audi: [['A3', 'carro'], ['A4', 'carro'], ['Q3', 'suv'], ['Q5', 'suv']],
  Kia: [['Cerato', 'carro'], ['Sportage', 'suv'], ['Sorento', 'suv'], ['Bongo', 'utilitario']],
  BYD: [['Dolphin', 'carro'], ['Seal', 'carro'], ['Song Plus', 'suv'], ['Yuan Plus', 'suv']],
  GWM: [['Haval H6', 'suv'], ['Ora 03', 'carro']],
  Volvo: [['XC40', 'suv'], ['XC60', 'suv'], ['XC90', 'suv'], ['FH', 'caminhao'], ['VM', 'caminhao']],
  Scania: [['R 450', 'caminhao'], ['G 410', 'caminhao'], ['P 320', 'caminhao']],
  Iveco: [['Daily', 'van'], ['Tector', 'caminhao'], ['Hi-Way', 'caminhao'], ['Stralis', 'caminhao']],
  DAF: [['XF', 'caminhao'], ['CF', 'caminhao']],
  Outra: [['Outro modelo', 'carro']],
};

export const BRAND_LIST = Object.keys(VEHICLE_CATALOG);
