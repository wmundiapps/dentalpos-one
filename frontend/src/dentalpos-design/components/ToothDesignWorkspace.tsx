import type {
  ReactNode,
} from "react";

interface ToothDesignWorkspaceProps {
  toolbar?: ReactNode;

  projectToolbar?: ReactNode;

  viewer: ReactNode;

  leftPanel?: ReactNode;

  rightPanel?: ReactNode;

  bottomPanel?: ReactNode;
}

export default function ToothDesignWorkspace({
  toolbar,

  projectToolbar,

  viewer,

  leftPanel,

  rightPanel,

  bottomPanel,
}: ToothDesignWorkspaceProps) {
  return (
    <div
      style={{
        width: "100%",

        height: "100%",

        display: "flex",

        flexDirection:
          "column",

        gap: 8,

        padding: 8,

        boxSizing:
          "border-box",

        background:
          "#080d12",

        overflow:
          "hidden",
      }}
    >
      {projectToolbar}

      {toolbar}

      <div
        style={{
          flex: 1,

          minHeight: 0,

          display: "grid",

          gridTemplateColumns:
            leftPanel && rightPanel
              ? "260px minmax(0, 1fr) 280px"
              : leftPanel
                ? "260px minmax(0, 1fr)"
                : rightPanel
                  ? "minmax(0, 1fr) 280px"
                  : "minmax(0, 1fr)",

          gap: 8,
        }}
      >
        {leftPanel && (
          <aside
            style={{
              minHeight: 0,

              overflowY:
                "auto",

              overflowX:
                "hidden",
            }}
          >
            {leftPanel}
          </aside>
        )}

        <main
          style={{
            minWidth: 0,

            minHeight: 0,

            position:
              "relative",

            overflow:
              "hidden",

            borderRadius:
              12,

            border:
              "1px solid #243447",

            background:
              "#05090d",
          }}
        >
          {viewer}
        </main>

        {rightPanel && (
          <aside
            style={{
              minHeight: 0,

              overflowY:
                "auto",

              overflowX:
                "hidden",

              display:
                "flex",

              flexDirection:
                "column",

              gap: 8,
            }}
          >
            {rightPanel}
          </aside>
        )}
      </div>

      {bottomPanel && (
        <div
          style={{
            flexShrink: 0,
          }}
        >
          {bottomPanel}
        </div>
      )}
    </div>
  );
}