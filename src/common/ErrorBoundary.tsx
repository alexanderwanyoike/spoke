import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// A single thrown error during render used to unmount the whole app to a blank
// screen (a self-referential contact crashed the message-thread projection).
// This boundary keeps the failure visible and recoverable instead of silent.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Spoke render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif"
          }}
        >
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Spoke hit a snag</h1>
            <p style={{ opacity: 0.7, marginBottom: 16 }}>
              Something in your data could not be displayed. The app stayed up so
              you can retry.
            </p>
            <pre
              style={{
                textAlign: "left",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 16
              }}
            >
              {this.state.error.message}
            </pre>
            <button type="button" onClick={this.handleReload}>
              Reload Spoke
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
