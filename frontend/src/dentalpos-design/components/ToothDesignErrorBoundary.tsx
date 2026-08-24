import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ToothDesignErrorBoundary extends Component<
  Props,
  State
> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(
    error: Error
  ): State {
    return {
      hasError: true,
      message:
        error.message ||
        "Erro inesperado no DentalPos Design.",
    };
  }

  componentDidCatch(
    error: Error,
    info: ErrorInfo
  ) {
    console.error(
      "[DentalPos Design]",
      error,
      info
    );
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#080d12",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            padding: 20,
            borderRadius: 12,
            border: "1px solid #7f1d1d",
            background: "#101820",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            DentalPos Design
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#fca5a5",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {this.state.message}
          </div>

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 7,
              border: "1px solid #38bdf8",
              background: "#075985",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}