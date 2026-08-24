export type DentalArch =
  | "superior"
  | "inferior";

export type ToothGroup =
  | "incisivo-central"
  | "incisivo-lateral"
  | "canino"
  | "primeiro-premolar"
  | "segundo-premolar"
  | "primeiro-molar"
  | "segundo-molar"
  | "terceiro-molar";

export interface ToothLibraryItem {
  number: number;
  arch: DentalArch;
  group: ToothGroup;
  name: string;
  mirror: number;
  fileName: string;
}

const toothNames: Record<
  number,
  {
    group: ToothGroup;
    name: string;
  }
> = {
  11: {
    group: "incisivo-central",
    name: "Incisivo Central Superior Direito",
  },

  12: {
    group: "incisivo-lateral",
    name: "Incisivo Lateral Superior Direito",
  },

  13: {
    group: "canino",
    name: "Canino Superior Direito",
  },

  14: {
    group: "primeiro-premolar",
    name: "1º Pré-molar Superior Direito",
  },

  15: {
    group: "segundo-premolar",
    name: "2º Pré-molar Superior Direito",
  },

  16: {
    group: "primeiro-molar",
    name: "1º Molar Superior Direito",
  },

  17: {
    group: "segundo-molar",
    name: "2º Molar Superior Direito",
  },

  18: {
    group: "terceiro-molar",
    name: "3º Molar Superior Direito",
  },

  21: {
    group: "incisivo-central",
    name: "Incisivo Central Superior Esquerdo",
  },

  22: {
    group: "incisivo-lateral",
    name: "Incisivo Lateral Superior Esquerdo",
  },

  23: {
    group: "canino",
    name: "Canino Superior Esquerdo",
  },

  24: {
    group: "primeiro-premolar",
    name: "1º Pré-molar Superior Esquerdo",
  },

  25: {
    group: "segundo-premolar",
    name: "2º Pré-molar Superior Esquerdo",
  },

  26: {
    group: "primeiro-molar",
    name: "1º Molar Superior Esquerdo",
  },

  27: {
    group: "segundo-molar",
    name: "2º Molar Superior Esquerdo",
  },

  28: {
    group: "terceiro-molar",
    name: "3º Molar Superior Esquerdo",
  },

  31: {
    group: "incisivo-central",
    name: "Incisivo Central Inferior Esquerdo",
  },

  32: {
    group: "incisivo-lateral",
    name: "Incisivo Lateral Inferior Esquerdo",
  },

  33: {
    group: "canino",
    name: "Canino Inferior Esquerdo",
  },

  34: {
    group: "primeiro-premolar",
    name: "1º Pré-molar Inferior Esquerdo",
  },

  35: {
    group: "segundo-premolar",
    name: "2º Pré-molar Inferior Esquerdo",
  },

  36: {
    group: "primeiro-molar",
    name: "1º Molar Inferior Esquerdo",
  },

  37: {
    group: "segundo-molar",
    name: "2º Molar Inferior Esquerdo",
  },

  38: {
    group: "terceiro-molar",
    name: "3º Molar Inferior Esquerdo",
  },

  41: {
    group: "incisivo-central",
    name: "Incisivo Central Inferior Direito",
  },

  42: {
    group: "incisivo-lateral",
    name: "Incisivo Lateral Inferior Direito",
  },

  43: {
    group: "canino",
    name: "Canino Inferior Direito",
  },

  44: {
    group: "primeiro-premolar",
    name: "1º Pré-molar Inferior Direito",
  },

  45: {
    group: "segundo-premolar",
    name: "2º Pré-molar Inferior Direito",
  },

  46: {
    group: "primeiro-molar",
    name: "1º Molar Inferior Direito",
  },

  47: {
    group: "segundo-molar",
    name: "2º Molar Inferior Direito",
  },

  48: {
    group: "terceiro-molar",
    name: "3º Molar Inferior Direito",
  },
};

const mirrorMap: Record<number, number> = {
  11: 21,
  12: 22,
  13: 23,
  14: 24,
  15: 25,
  16: 26,
  17: 27,
  18: 28,

  21: 11,
  22: 12,
  23: 13,
  24: 14,
  25: 15,
  26: 16,
  27: 17,
  28: 18,

  31: 41,
  32: 42,
  33: 43,
  34: 44,
  35: 45,
  36: 46,
  37: 47,
  38: 48,

  41: 31,
  42: 32,
  43: 33,
  44: 34,
  45: 35,
  46: 36,
  47: 37,
  48: 38,
};

function getArch(
  number: number
): DentalArch {
  return number < 30
    ? "superior"
    : "inferior";
}

export const toothLibrary: ToothLibraryItem[] =
  Object.entries(toothNames).map(
    ([numberString, data]) => {
      const number =
        Number(numberString);

      return {
        number,

        arch:
          getArch(number),

        group:
          data.group,

        name:
          data.name,

        mirror:
          mirrorMap[number],

        fileName:
          `${number}.stl`,
      };
    }
  );

export function getToothFromLibrary(
  toothNumber: number
): ToothLibraryItem | null {
  return (
    toothLibrary.find(
      (tooth) =>
        tooth.number ===
        toothNumber
    ) ?? null
  );
}

export function getTeethByArch(
  arch: DentalArch
) {
  return toothLibrary.filter(
    (tooth) =>
      tooth.arch === arch
  );
}

export function getMirrorFromLibrary(
  toothNumber: number
) {
  const tooth =
    getToothFromLibrary(
      toothNumber
    );

  if (!tooth) {
    return null;
  }

  return getToothFromLibrary(
    tooth.mirror
  );
}