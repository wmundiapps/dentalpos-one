export const DENTALPOS_DESIGN_CONFIG = {
  productName:
    "DentalPos Design",

  version:
    "ALPHA",

  autosave: {
    enabled: true,

    interval:
      30000,
  },

  history: {
    maxSnapshots:
      40,
  },

  validation: {
    minimumQualityScore:
      70,

    minimumThickness:
      0.5,

    warningThickness:
      0.8,

    allowWarnings:
      true,
  },

  export: {
    binarySTL:
      true,

    applyWorldTransform:
      true,
  },

  viewer: {
    background:
      "#05090d",

    autoRotate:
      false,

    shadows:
      true,
  },
} as const;

export type DentalPosDesignConfig =
  typeof DENTALPOS_DESIGN_CONFIG;