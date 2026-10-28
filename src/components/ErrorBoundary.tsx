import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** What broke, for the heading: "The library", "Epizen". */
  label: string;
  /** Where the message sits: a dialog's backdrop, for one drawn over the app. */
  frame?: (message: ReactNode) => ReactNode;
  children: ReactNode;
}

interface State {
  error?: Error;
  where?: string;
}

/**
 * Catches an error while drawing its part of the app, so one broken screen says what went wrong
 * instead of taking the whole window dark. "Try again" draws it once more; nothing is lost, since
 * nothing here holds the vault.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ where: info.componentStack?.trim().split('\n').slice(0, 6).join('\n') });
  }

  render() {
    const { error, where } = this.state;
    if (!error) return this.props.children;
    const message = (
      <section className="screen crashed" role="alert" data-testid="crashed">
        <p className="eyebrow">Something broke</p>
        <h1>{this.props.label} couldn’t be shown</h1>
        <p className="muted">{error.message}</p>
        {where && <pre className="crashed-where">{where}</pre>}
        <button type="button" className="crashed-retry" onClick={() => this.setState({ error: undefined, where: undefined })} data-testid="crashed-retry">
          Try again
        </button>
      </section>
    );
    return this.props.frame ? this.props.frame(message) : message;
  }
}
