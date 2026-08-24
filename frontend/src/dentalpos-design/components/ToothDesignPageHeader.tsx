interface ToothDesignPageHeaderProps {
  projectName?: string;

  selectedTooth?: number | null;

  status?: string;
}

export default function ToothDesignPageHeader({
  projectName = "Novo Projeto",

  selectedTooth = null,

  status = "DentalPos Design Alpha",
}: ToothDesignPageHeaderProps) {
  return (
    <header
      style={{
        minHeight: 54,

        display: "flex",

        alignItems: "center",

        justifyContent:
          "space-between",

        gap: 16,

        padding: "8px 14px",

        background: "#101820",

        border:
          "1px solid #243447",

        borderRadius: 12,

        color: "#ffffff",
      }}
    >
      <div
        style={{
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",

            alignItems:
              "center",

            gap: 8,
          }}
        >
          <strong
            style={{
              fontSize: 16,

              color: "#38bdf8",
            }}
          >
            DentalPos Design
          </strong>

          <span
            style={{
              padding:
                "2px 6px",

              borderRadius: 5,

              background:
                "#17202b",

              border:
                "1px solid #334155",

              fontSize: 9,

              fontWeight: 800,

              color: "#94a3b8",
            }}
          >
            ALPHA
          </span>
        </div>

        <div
          style={{
            marginTop: 3,

            fontSize: 11,

            color: "#64748b",

            overflow:
              "hidden",

            textOverflow:
              "ellipsis",

            whiteSpace:
              "nowrap",
          }}
        >
          {projectName}
        </div>
      </div>

      <div
        style={{
          display: "flex",

          alignItems:
            "center",

          gap: 14,

          flexShrink: 0,
        }}
      >
        <div
          style={{
            textAlign:
              "right",
          }}
        >
          <div
            style={{
              fontSize: 9,

              color: "#64748b",

              textTransform:
                "uppercase",

              letterSpacing:
                0.6,
            }}
          >
            Dente selecionado
          </div>

          <div
            style={{
              marginTop: 2,

              fontSize: 13,

              fontWeight: 700,
            }}
          >
            {selectedTooth ??
              "Nenhum"}
          </div>
        </div>

        <div
          style={{
            width: 1,

            height: 30,

            background:
              "#243447",
          }}
        />

        <div
          style={{
            fontSize: 10,

            color: "#94a3b8",
          }}
        >
          {status}
        </div>
      </div>
    </header>
  );
}