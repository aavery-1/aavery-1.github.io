// Catches any uncaught render error in the whole app and shows a recovery UI
// with a reload button. Never a white screen (00_BUILD_PROMPT.md hard
// requirement). Fail soft on runtime problems.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("Root error boundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="recovery">
          <div className="card recovery-card">
            <h1>The tool hit an unexpected error</h1>
            <p>The map and data were not affected on disk. Reloading usually clears a transient render error.</p>
            <pre className="recovery-detail">{this.state.error.message}</pre>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload the tool
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
