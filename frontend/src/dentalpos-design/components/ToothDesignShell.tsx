import ToothDesignApp from "./ToothDesignApp";

import ToothDesignPageHeader from "./ToothDesignPageHeader";

export default function ToothDesignShell() {
  return (
    <div
      style={{
        width: "100%",

        height: "100vh",

        minHeight: 0,

        display: "flex",

        flexDirection: "column",

        gap: 8,

        padding: 8,

        boxSizing: "border-box",

        overflow: "hidden",

        background: "#080d12",
      }}
    >
      <ToothDesignPageHeader />

      <div
        style={{
          flex: 1,

          minHeight: 0,

          overflow: "hidden",
        }}
      >
        <ToothDesignApp />
      </div>
    </div>
  );
}