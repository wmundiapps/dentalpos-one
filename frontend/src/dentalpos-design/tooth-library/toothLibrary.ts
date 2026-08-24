export type ToothArch = "upper" | "lower";

export type ToothSide = "right" | "left";

export type ToothCategory =
  | "central-incisor"
  | "lateral-incisor"
  | "canine"
  | "first-premolar"
  | "second-premolar"
  | "first-molar"
  | "second-molar"
  | "third-molar";

export interface ToothDefinition {
  fdi: number;
  name: string;
  arch: ToothArch;
  side: ToothSide;
  category: ToothCategory;

  /**
   * Futuramente receberá o STL/OBJ/PLY
   * correspondente ao dente anatômico.
   */
  modelPath?: string;

  /**
   * Dente contralateral usado para espelhamento.
   */
  mirrorTooth: number;

  /**
   * Dimensões anatômicas iniciais aproximadas.
   * Servirão somente como referência para
   * posicionamento e escala automática.
   */
  defaultSize: {
    mesiodistal: number;
    buccolingual: number;
    height: number;
  };
}

export const toothLibrary: ToothDefinition[] = [
  // ============================================================
  // MAXILA DIREITA
  // ============================================================

  {
    fdi: 11,
    name: "Incisivo Central Superior Direito",
    arch: "upper",
    side: "right",
    category: "central-incisor",
    mirrorTooth: 21,
    defaultSize: {
      mesiodistal: 8.5,
      buccolingual: 7.0,
      height: 10.5,
    },
  },

  {
    fdi: 12,
    name: "Incisivo Lateral Superior Direito",
    arch: "upper",
    side: "right",
    category: "lateral-incisor",
    mirrorTooth: 22,
    defaultSize: {
      mesiodistal: 6.5,
      buccolingual: 6.0,
      height: 9.0,
    },
  },

  {
    fdi: 13,
    name: "Canino Superior Direito",
    arch: "upper",
    side: "right",
    category: "canine",
    mirrorTooth: 23,
    defaultSize: {
      mesiodistal: 7.5,
      buccolingual: 8.0,
      height: 10.0,
    },
  },

  {
    fdi: 14,
    name: "Primeiro Pré-Molar Superior Direito",
    arch: "upper",
    side: "right",
    category: "first-premolar",
    mirrorTooth: 24,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 9.0,
      height: 8.5,
    },
  },

  {
    fdi: 15,
    name: "Segundo Pré-Molar Superior Direito",
    arch: "upper",
    side: "right",
    category: "second-premolar",
    mirrorTooth: 25,
    defaultSize: {
      mesiodistal: 6.8,
      buccolingual: 9.0,
      height: 8.0,
    },
  },

  {
    fdi: 16,
    name: "Primeiro Molar Superior Direito",
    arch: "upper",
    side: "right",
    category: "first-molar",
    mirrorTooth: 26,
    defaultSize: {
      mesiodistal: 10.0,
      buccolingual: 11.0,
      height: 7.5,
    },
  },

  {
    fdi: 17,
    name: "Segundo Molar Superior Direito",
    arch: "upper",
    side: "right",
    category: "second-molar",
    mirrorTooth: 27,
    defaultSize: {
      mesiodistal: 9.5,
      buccolingual: 10.5,
      height: 7.0,
    },
  },

  {
    fdi: 18,
    name: "Terceiro Molar Superior Direito",
    arch: "upper",
    side: "right",
    category: "third-molar",
    mirrorTooth: 28,
    defaultSize: {
      mesiodistal: 9.0,
      buccolingual: 10.0,
      height: 6.5,
    },
  },

  // ============================================================
  // MAXILA ESQUERDA
  // ============================================================

  {
    fdi: 21,
    name: "Incisivo Central Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "central-incisor",
    mirrorTooth: 11,
    defaultSize: {
      mesiodistal: 8.5,
      buccolingual: 7.0,
      height: 10.5,
    },
  },

  {
    fdi: 22,
    name: "Incisivo Lateral Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "lateral-incisor",
    mirrorTooth: 12,
    defaultSize: {
      mesiodistal: 6.5,
      buccolingual: 6.0,
      height: 9.0,
    },
  },

  {
    fdi: 23,
    name: "Canino Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "canine",
    mirrorTooth: 13,
    defaultSize: {
      mesiodistal: 7.5,
      buccolingual: 8.0,
      height: 10.0,
    },
  },

  {
    fdi: 24,
    name: "Primeiro Pré-Molar Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "first-premolar",
    mirrorTooth: 14,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 9.0,
      height: 8.5,
    },
  },

  {
    fdi: 25,
    name: "Segundo Pré-Molar Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "second-premolar",
    mirrorTooth: 15,
    defaultSize: {
      mesiodistal: 6.8,
      buccolingual: 9.0,
      height: 8.0,
    },
  },

  {
    fdi: 26,
    name: "Primeiro Molar Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "first-molar",
    mirrorTooth: 16,
    defaultSize: {
      mesiodistal: 10.0,
      buccolingual: 11.0,
      height: 7.5,
    },
  },

  {
    fdi: 27,
    name: "Segundo Molar Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "second-molar",
    mirrorTooth: 17,
    defaultSize: {
      mesiodistal: 9.5,
      buccolingual: 10.5,
      height: 7.0,
    },
  },

  {
    fdi: 28,
    name: "Terceiro Molar Superior Esquerdo",
    arch: "upper",
    side: "left",
    category: "third-molar",
    mirrorTooth: 18,
    defaultSize: {
      mesiodistal: 9.0,
      buccolingual: 10.0,
      height: 6.5,
    },
  },

  // ============================================================
  // MANDÍBULA ESQUERDA
  // ============================================================

  {
    fdi: 31,
    name: "Incisivo Central Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "central-incisor",
    mirrorTooth: 41,
    defaultSize: {
      mesiodistal: 5.0,
      buccolingual: 5.5,
      height: 9.0,
    },
  },

  {
    fdi: 32,
    name: "Incisivo Lateral Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "lateral-incisor",
    mirrorTooth: 42,
    defaultSize: {
      mesiodistal: 5.5,
      buccolingual: 6.0,
      height: 9.5,
    },
  },

  {
    fdi: 33,
    name: "Canino Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "canine",
    mirrorTooth: 43,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 7.5,
      height: 10.0,
    },
  },

  {
    fdi: 34,
    name: "Primeiro Pré-Molar Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "first-premolar",
    mirrorTooth: 44,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 7.5,
      height: 8.5,
    },
  },

  {
    fdi: 35,
    name: "Segundo Pré-Molar Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "second-premolar",
    mirrorTooth: 45,
    defaultSize: {
      mesiodistal: 7.5,
      buccolingual: 8.0,
      height: 8.0,
    },
  },

  {
    fdi: 36,
    name: "Primeiro Molar Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "first-molar",
    mirrorTooth: 46,
    defaultSize: {
      mesiodistal: 11.0,
      buccolingual: 10.5,
      height: 7.5,
    },
  },

  {
    fdi: 37,
    name: "Segundo Molar Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "second-molar",
    mirrorTooth: 47,
    defaultSize: {
      mesiodistal: 10.5,
      buccolingual: 10.0,
      height: 7.0,
    },
  },

  {
    fdi: 38,
    name: "Terceiro Molar Inferior Esquerdo",
    arch: "lower",
    side: "left",
    category: "third-molar",
    mirrorTooth: 48,
    defaultSize: {
      mesiodistal: 10.0,
      buccolingual: 9.5,
      height: 6.5,
    },
  },

  // ============================================================
  // MANDÍBULA DIREITA
  // ============================================================

  {
    fdi: 41,
    name: "Incisivo Central Inferior Direito",
    arch: "lower",
    side: "right",
    category: "central-incisor",
    mirrorTooth: 31,
    defaultSize: {
      mesiodistal: 5.0,
      buccolingual: 5.5,
      height: 9.0,
    },
  },

  {
    fdi: 42,
    name: "Incisivo Lateral Inferior Direito",
    arch: "lower",
    side: "right",
    category: "lateral-incisor",
    mirrorTooth: 32,
    defaultSize: {
      mesiodistal: 5.5,
      buccolingual: 6.0,
      height: 9.5,
    },
  },

  {
    fdi: 43,
    name: "Canino Inferior Direito",
    arch: "lower",
    side: "right",
    category: "canine",
    mirrorTooth: 33,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 7.5,
      height: 10.0,
    },
  },

  {
    fdi: 44,
    name: "Primeiro Pré-Molar Inferior Direito",
    arch: "lower",
    side: "right",
    category: "first-premolar",
    mirrorTooth: 34,
    defaultSize: {
      mesiodistal: 7.0,
      buccolingual: 7.5,
      height: 8.5,
    },
  },

  {
    fdi: 45,
    name: "Segundo Pré-Molar Inferior Direito",
    arch: "lower",
    side: "right",
    category: "second-premolar",
    mirrorTooth: 35,
    defaultSize: {
      mesiodistal: 7.5,
      buccolingual: 8.0,
      height: 8.0,
    },
  },

  {
    fdi: 46,
    name: "Primeiro Molar Inferior Direito",
    arch: "lower",
    side: "right",
    category: "first-molar",
    mirrorTooth: 36,
    defaultSize: {
      mesiodistal: 11.0,
      buccolingual: 10.5,
      height: 7.5,
    },
  },

  {
    fdi: 47,
    name: "Segundo Molar Inferior Direito",
    arch: "lower",
    side: "right",
    category: "second-molar",
    mirrorTooth: 37,
    defaultSize: {
      mesiodistal: 10.5,
      buccolingual: 10.0,
      height: 7.0,
    },
  },

  {
    fdi: 48,
    name: "Terceiro Molar Inferior Direito",
    arch: "lower",
    side: "right",
    category: "third-molar",
    mirrorTooth: 38,
    defaultSize: {
      mesiodistal: 10.0,
      buccolingual: 9.5,
      height: 6.5,
    },
  },
];

// ============================================================
// CONSULTAS
// ============================================================

export function getToothByFDI(
  fdi: number
): ToothDefinition | undefined {
  return toothLibrary.find(
    (tooth) => tooth.fdi === fdi
  );
}

export function getUpperTeeth(): ToothDefinition[] {
  return toothLibrary.filter(
    (tooth) => tooth.arch === "upper"
  );
}

export function getLowerTeeth(): ToothDefinition[] {
  return toothLibrary.filter(
    (tooth) => tooth.arch === "lower"
  );
}

export function getMirrorTooth(
  fdi: number
): ToothDefinition | undefined {
  const tooth = getToothByFDI(fdi);

  if (!tooth) {
    return undefined;
  }

  return getToothByFDI(
    tooth.mirrorTooth
  );
}