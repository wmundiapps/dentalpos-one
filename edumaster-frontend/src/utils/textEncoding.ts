type Replacement = [RegExp, string | ((substring: string, ...args: unknown[]) => string)];

const replacements: Replacement[] = [
  [/AutÃ´nomo/g, "Autônomo"],
  [/EstÃ¡gio/g, "Estágio"],
  [/DiÃ¡ria/g, "Diária"],
  [/GestÃ£o/g, "Gestão"],
  [/ClÃ­nico/g, "Clínico"],
  [/ClÃ­nica/g, "Clínica"],
  [/DescriÃ§Ã£o/g, "Descrição"],
  [/lanÃ§amento/gi, (match) => match.startsWith("L") ? "Lançamento" : "lançamento"],
  [/ManutenÃ§Ã£o/g, "Manutenção"],
  [/CirurgiÃ£o/g, "Cirurgião"],
  [/PrÃ³tese/g, "Prótese"],
  [/OdontolÃ³gico/g, "Odontológico"],
  [/avaliaÃ§Ã£o/gi, "avaliação"],
  [/confirmaÃ§Ã£o/gi, "confirmação"],
  [/â€¢/g, "•"],
  [/â€”/g, "—"],
  [/â€“/g, "–"],
  [/â€‹/g, ""],
];

export function repairMojibake(value: string): string {
  return replacements.reduce((text, [pattern, replacement]) => {
    return typeof replacement === "string"
      ? text.replace(pattern, replacement)
      : text.replace(pattern, replacement as (...args: string[]) => string);
  }, value);
}

export function repairObjectText<T>(value: T): T {
  if (typeof value === "string") return repairMojibake(value) as T;
  if (Array.isArray(value)) return value.map((item) => repairObjectText(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, repairObjectText(item)]),
    ) as T;
  }
  return value;
}

export function repairLocalStorageText(): void {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const repaired = repairMojibake(raw);
      if (repaired !== raw) localStorage.setItem(key, repaired);
    }
  } catch {
    // Falha de storage não deve impedir a inicialização do DentalPos One.
  }
}
