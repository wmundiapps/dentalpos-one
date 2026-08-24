import { useState } from "react";

interface ToothTransformPanelProps {
  disabled?: boolean;

  onMove?: (
    x: number,
    y: number,
    z: number
  ) => void;

  onRotate?: (
    x: number,
    y: number,
    z: number
  ) => void;

  onScale?: (
    x: number,
    y: number,
    z: number
  ) => void;

  onReset?: () => void;
}

export default function ToothTransformPanel({
  disabled = false,
  onMove,
  onRotate,
  onScale,
  onReset,
}: ToothTransformPanelProps) {
  const [moveStep, setMoveStep] =
    useState(0.25);

  const [rotationStep, setRotationStep] =
    useState(2);

  const [scaleStep, setScaleStep] =
    useState(0.02);

  const buttonStyle = {
    height: 32,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#17202b",
    color: "#ffffff",
    cursor: disabled
      ? "not-allowed"
      : "pointer",
    opacity: disabled
      ? 0.4
      : 1,
    fontSize: 12,
    fontWeight: 700,
  };

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
        TRANSFORMAÇÃO
      </div>

      <Section
        title="Mover"
        step={moveStep}
        onStepChange={setMoveStep}
      >
        <AxisButtons
          disabled={disabled}
          step={moveStep}
          onAction={onMove}
          mode="move"
        />
      </Section>

      <Section
        title="Rotacionar"
        step={rotationStep}
        onStepChange={setRotationStep}
      >
        <AxisButtons
          disabled={disabled}
          step={rotationStep}
          onAction={onRotate}
          mode="rotate"
        />
      </Section>

      <Section
        title="Escala"
        step={scaleStep}
        onStepChange={setScaleStep}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 6,
          }}
        >
          <button
            type="button"
            disabled={disabled}
            style={buttonStyle}
            onClick={() =>
              onScale?.(
                1 + scaleStep,
                1 + scaleStep,
                1 + scaleStep
              )
            }
          >
            Aumentar
          </button>

          <button
            type="button"
            disabled={disabled}
            style={buttonStyle}
            onClick={() =>
              onScale?.(
                1 - scaleStep,
                1 - scaleStep,
                1 - scaleStep
              )
            }
          >
            Diminuir
          </button>
        </div>
      </Section>

      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 8,
        }}
      >
        Resetar transformação
      </button>
    </div>
  );
}

interface SectionProps {
  title: string;
  step: number;
  onStepChange: (
    value: number
  ) => void;
  children: React.ReactNode;
}

function Section({
  title,
  step,
  onStepChange,
  children,
}: SectionProps) {
  return (
    <div
      style={{
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          marginBottom: 7,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {title}
        </span>

        <input
          type="number"
          value={step}
          step="0.01"
          onChange={(event) =>
            onStepChange(
              Number(
                event.target.value
              )
            )
          }
          style={{
            width: 65,
            height: 26,
            borderRadius: 5,
            border:
              "1px solid #334155",
            background: "#17202b",
            color: "#ffffff",
            padding: "0 6px",
            fontSize: 11,
          }}
        />
      </div>

      {children}
    </div>
  );
}

interface AxisButtonsProps {
  disabled: boolean;
  step: number;

  mode:
    | "move"
    | "rotate";

  onAction?: (
    x: number,
    y: number,
    z: number
  ) => void;
}

function AxisButtons({
  disabled,
  step,
  onAction,
}: AxisButtonsProps) {
  const axes = [
    {
      label: "X−",
      value: [-step, 0, 0],
    },
    {
      label: "X+",
      value: [step, 0, 0],
    },
    {
      label: "Y−",
      value: [0, -step, 0],
    },
    {
      label: "Y+",
      value: [0, step, 0],
    },
    {
      label: "Z−",
      value: [0, 0, -step],
    },
    {
      label: "Z+",
      value: [0, 0, step],
    },
  ] as const;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(3, 1fr)",
        gap: 5,
      }}
    >
      {axes.map(
        ({
          label,
          value,
        }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() =>
              onAction?.(
                value[0],
                value[1],
                value[2]
              )
            }
            style={{
              height: 31,
              borderRadius: 6,
              border:
                "1px solid #334155",
              background:
                "#17202b",
              color: "#ffffff",
              cursor: disabled
                ? "not-allowed"
                : "pointer",
              opacity: disabled
                ? 0.4
                : 1,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {label}
          </button>
        )
      )}
    </div>
  );
}