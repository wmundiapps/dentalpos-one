interface ToothProjectToolbarProps {
  projectName?: string;

  hasRecovery?: boolean;

  onNewProject?: () => void;

  onOpenProject?: (
    file: File
  ) => void;

  onSaveProject?: () => void;

  onRecoverProject?: () => void;

  onGenerateReport?: () => void;
}

export default function ToothProjectToolbar({
  projectName = "Novo Projeto",

  hasRecovery = false,

  onNewProject,

  onOpenProject,

  onSaveProject,

  onRecoverProject,

  onGenerateReport,
}: ToothProjectToolbarProps) {
  function handleOpenFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    onOpenProject?.(
      file
    );

    event.target.value =
      "";
  }

  const buttonStyle:
    React.CSSProperties = {
    height: 32,

    padding:
      "0 10px",

    borderRadius: 6,

    border:
      "1px solid #334155",

    background:
      "#17202b",

    color:
      "#ffffff",

    cursor:
      "pointer",

    fontSize: 11,

    fontWeight: 700,
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
      <div
        style={{
          minWidth: 130,

          maxWidth: 220,

          marginRight: 4,

          overflow:
            "hidden",

          textOverflow:
            "ellipsis",

          whiteSpace:
            "nowrap",

          color:
            "#cbd5e1",

          fontSize: 12,

          fontWeight: 700,
        }}
        title={
          projectName
        }
      >
        {projectName}
      </div>

      <button
        type="button"
        onClick={
          onNewProject
        }
        style={
          buttonStyle
        }
      >
        Novo
      </button>

      <label
        style={{
          ...buttonStyle,

          display:
            "inline-flex",

          alignItems:
            "center",

          justifyContent:
            "center",
        }}
      >
        Abrir

        <input
          type="file"
          accept=".json,.dentalpos"
          onChange={
            handleOpenFile
          }
          style={{
            display:
              "none",
          }}
        />
      </label>

      <button
        type="button"
        onClick={
          onSaveProject
        }
        style={
          buttonStyle
        }
      >
        Salvar
      </button>

      {hasRecovery && (
        <button
          type="button"
          onClick={
            onRecoverProject
          }
          style={{
            ...buttonStyle,

            border:
              "1px solid #f59e0b",

            color:
              "#fbbf24",
          }}
        >
          Recuperar
        </button>
      )}

      <button
        type="button"
        onClick={
          onGenerateReport
        }
        style={
          buttonStyle
        }
      >
        Relatório
      </button>
    </div>
  );
}