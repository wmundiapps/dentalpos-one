interface ToothAnalysisPanelProps {
  minimumThickness?: number | null;

  averageThickness?: number | null;

  criticalPoints?: number;

  warningPoints?: number;

  mesialContact?: string | null;

  distalContact?: string | null;

  occlusalContact?: string | null;

  onAnalyze?: () => void;

  disabled?: boolean;
}

export default function ToothAnalysisPanel({
  minimumThickness = null,
  averageThickness = null,

  criticalPoints = 0,
  warningPoints = 0,

  mesialContact = null,
  distalContact = null,
  occlusalContact = null,

  onAnalyze,

  disabled = false,
}: ToothAnalysisPanelProps) {
  return (
    <div
      style={{
        background: "#101820",
        border: "1px solid #243447",
        borderRadius: 12,
        padding: 14,
        color: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#38bdf8",
          marginBottom: 12,
        }}
      >
        ANÁLISE
      </div>

      <SectionTitle>
        Espessura
      </SectionTitle>

      <AnalysisRow
        label="Mínima"
        value={
          minimumThickness !== null
            ? `${minimumThickness.toFixed(
                2
              )} mm`
            : "--"
        }
      />

      <AnalysisRow
        label="Média"
        value={
          averageThickness !== null
            ? `${averageThickness.toFixed(
                2
              )} mm`
            : "--"
        }
      />

      <AnalysisRow
        label="Pontos críticos"
        value={String(
          criticalPoints
        )}
      />

      <AnalysisRow
        label="Alertas"
        value={String(
          warningPoints
        )}
      />

      <SectionTitle>
        Contatos
      </SectionTitle>

      <AnalysisRow
        label="Mesial"
        value={
          mesialContact ??
          "--"
        }
      />

      <AnalysisRow
        label="Distal"
        value={
          distalContact ??
          "--"
        }
      />

      <AnalysisRow
        label="Oclusal"
        value={
          occlusalContact ??
          "--"
        }
      />

      <button
        type="button"
        disabled={disabled}
        onClick={onAnalyze}
        style={{
          width: "100%",
          height: 36,
          marginTop: 12,
          borderRadius: 7,
          border:
            "1px solid #38bdf8",
          background: "#0369a1",
          color: "#ffffff",
          cursor: disabled
            ? "not-allowed"
            : "pointer",
          opacity: disabled
            ? 0.4
            : 1,
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        Executar análise
      </button>
    </div>
  );
}

interface AnalysisRowProps {
  label: string;
  value: string;
}

function AnalysisRow({
  label,
  value,
}: AnalysisRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
        borderBottom:
          "1px solid #1e293b",
        fontSize: 12,
      }}
    >
      <span
        style={{
          color: "#94a3b8",
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

function SectionTitle({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 4,
        fontSize: 11,
        fontWeight: 700,
        color: "#64748b",
        textTransform:
          "uppercase",
        letterSpacing: 0.6,
      }}
    >
      {children}
    </div>
  );
}