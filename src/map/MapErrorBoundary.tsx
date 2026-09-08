// Wraps the map only. A Google Maps script failure or a deck.gl error stays
// contained here: the panel and inspector keep working, and the map area shows a
// specific, friendly message rather than blanking the whole app.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface State {
  error: Error | null;
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("Map error boundary caught:", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="map-error">
          <div className="card map-error-card">
            <h2>The map could not render</h2>
            <p>{this.state.error.message}</p>
            <button className="btn btn-primary" onClick={this.reset}>
              Try the map again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
