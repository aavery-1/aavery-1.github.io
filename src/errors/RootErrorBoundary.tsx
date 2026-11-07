// Catches any uncaught render error in the whole app and shows a recovery UI
// with a reload button. Never a white screen (00_BUILD_PROMPT.md hard
// requirement). Fail soft on runtime problems.

import { Component, type ReactNode } from "react";
import { isStaleBuildError, reloadForNewVersion } from "./staleBuild";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  updating: boolean; // a new version was deployed under this tab; reloading into it
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, updating: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    // A stale chunk after a deploy is not a real error: load the new version.
    if (isStaleBuildError(error) && reloadForNewVersion()) {
      this.setState({ updating: true });
      return;
    }
    console.error("Root error boundary caught:", error);
  }

  render() {
    if (this.state.updating) {
      return (
        <div className="recovery">
          <div className="card recovery-card">
            <h1>Loading the latest version</h1>
            <p>The tool was updated while this tab was open.</p>
          </div>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div className="recovery">
          <div className="card recovery-card">
            <h1>The tool hit an unexpected error</h1>
            <p>Your data on disk is unchanged. Reloading usually clears a transient render error.</p>
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
