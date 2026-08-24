interface ToothDesignToolbarProps {
  canUndo?: boolean;
  canRedo?: boolean;

  onUndo?: () => void;
  onRedo?: () => void;

  onAutoPlace?: () => void;
  onGoldenProportion?: () => void;
  onAnalyze?: () => void;

  onSave?: () => void;
  onExport?: () => void;
}

export default function ToothDesignToolbar({
  canUndo = false,
  canRedo = false,

  onUndo,
  onRedo,

  onAutoPlace,
  onGoldenProportion,
  onAnalyze,

  onSave,
  onExport,
}: ToothDesignToolbarProps) {
  const buttonStyle = {
    height: 34,

    padding:
      "0 12px",

    borderRadius: 7,

    border:
      "1px solid #334155",

    background:
      "#17202b",

    color:
      "#ffffff",

    cursor:
      "pointer",

    fontSize: 12,

    fontWeight: 600,
  };

  return (
    <div
      style={{
        display: "flex",

        alignItems:
          "center",

        gap: 6,

        flexWrap:
          "wrap",

        padding: 8,

        background:
          "#101820",

        border:
          "1px solid #243447",

        borderRadius: 10,
      }}
    >
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        style={{
          ...buttonStyle,

          opacity:
            canUndo
              ? 1
              : 0.4,
        }}
      >
        Desfazer
      </button>

      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        style={{
          ...buttonStyle,

          opacity:
            canRedo
              ? 1
              : 0.4,
        }}
      >
        Refazer
      </button>

      <button
        type="button"
        onClick={onAutoPlace}
        style={
          buttonStyle
        }
      >
        Auto posição
      </button>

      <button
        type="button"
        onClick={
          onGoldenProportion
        }
        style={
          buttonStyle
        }
      >
        Proporção áurea
      </button>

      <button
        type="button"
        onClick={onAnalyze}
        style={
          buttonStyle
        }
      >
        Analisar
      </button>

      <button
        type="button"
        onClick={onSave}
        style={
          buttonStyle
        }
      >
        Salvar
      </button>

      <button
        type="button"
        onClick={onExport}
        style={{
          ...buttonStyle,

          border:
            "1px solid #38bdf8",

          background:
            "#0369a1",
        }}
      >
        Exportar STL
      </button>
    </div>
  );
}