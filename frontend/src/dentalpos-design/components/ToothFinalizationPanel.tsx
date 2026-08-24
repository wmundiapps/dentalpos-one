interface ToothFinalizationPanelProps {
  totalTeeth?: number;

  approvedTeeth?: number;

  rejectedTeeth?: number;

  averageScore?: number;

  readyForManufacturing?: boolean;

  disabled?: boolean;

  onValidate?: () => void;

  onFinalize?: () => void;

  onExportSTL?: () => void;
}

export default function ToothFinalizationPanel({
  totalTeeth = 0,

  approvedTeeth = 0,

  rejectedTeeth = 0,

  averageScore = 0,

  readyForManufacturing = false,

  disabled = false,

  onValidate,

  onFinalize,

  onExportSTL,
}: ToothFinalizationPanelProps) {
  const buttonStyle:
    React.CSSProperties = {
    width: "100%",

    height: 36,

    borderRadius: 7,

    border:
      "1px solid #334155",

    background:
      "#17202b",

    color:
      "#ffffff",

    cursor:
      disabled
        ? "not-allowed"
        : "pointer",

    opacity:
      disabled
        ? 0.4
        : 1,

    fontSize: 12,

    fontWeight: 700,
  };

  return (
    <div
      style={{
        background:
          "#101820",

        border:
          "1px solid #243447",

        borderRadius: 12,

        padding: 14,

        color:
          "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: 13,

          fontWeight: 700,

          color:
            "#38bdf8",

          marginBottom: 12,
        }}
      >
        FINALIZAÇÃO
      </div>

      <InfoRow
        label="Dentes"
        value={String(
          totalTeeth
        )}
      />

      <InfoRow
        label="Aprovados"
        value={String(
          approvedTeeth
        )}
      />

      <InfoRow
        label="Revisar"
        value={String(
          rejectedTeeth
        )}
      />

      <InfoRow
        label="Score médio"
        value={`${averageScore}/100`}
      />

      <div
        style={{
          marginTop: 12,

          marginBottom: 12,

          padding: 10,

          borderRadius: 8,

          textAlign:
            "center",

          fontSize: 11,

          fontWeight: 800,

          border:
            readyForManufacturing
              ? "1px solid #22c55e"
              : "1px solid #475569",

          background:
            readyForManufacturing
              ? "#052e16"
              : "#17202b",

          color:
            readyForManufacturing
              ? "#86efac"
              : "#94a3b8",
        }}
      >
        {readyForManufacturing
          ? "APROVADO PARA FABRICAÇÃO"
          : "VALIDAÇÃO NECESSÁRIA"}
      </div>

      <div
        style={{
          display:
            "grid",

          gap: 7,
        }}
      >
        <button
          type="button"
          disabled={
            disabled
          }
          onClick={
            onValidate
          }
          style={
            buttonStyle
          }
        >
          Validar projeto
        </button>

        <button
          type="button"
          disabled={
            disabled
          }
          onClick={
            onFinalize
          }
          style={{
            ...buttonStyle,

            border:
              "1px solid #38bdf8",

            background:
              "#075985",
          }}
        >
          Finalizar
        </button>

        <button
          type="button"
          disabled={
            disabled ||
            !readyForManufacturing
          }
          onClick={
            onExportSTL
          }
          style={{
            ...buttonStyle,

            border:
              readyForManufacturing
                ? "1px solid #22c55e"
                : "1px solid #334155",

            background:
              readyForManufacturing
                ? "#166534"
                : "#17202b",

            opacity:
              disabled ||
              !readyForManufacturing
                ? 0.4
                : 1,
          }}
        >
          Exportar STL
        </button>
      </div>
    </div>
  );
}

interface InfoRowProps {
  label: string;

  value: string;
}

function InfoRow({
  label,
  value,
}: InfoRowProps) {
  return (
    <div
      style={{
        display:
          "flex",

        justifyContent:
          "space-between",

        alignItems:
          "center",

        gap: 10,

        padding:
          "6px 0",

        borderBottom:
          "1px solid #1e293b",

        fontSize: 12,
      }}
    >
      <span
        style={{
          color:
            "#94a3b8",
        }}
      >
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}