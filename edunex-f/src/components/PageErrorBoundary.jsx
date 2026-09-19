import { Component } from "react";
import "./page-recovery.css";

export class PageErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("Skillomate page failed", error, info); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="skillomate-recovery" role="alert">
        <section className="skillomate-recovery-card">
          <h1>We couldn't open this page</h1>
          <p>Please reload and try again. You can also return to the course library.</p>
          <div className="skillomate-recovery-actions">
            <button className="skillomate-recovery-primary" onClick={() => window.location.reload()}>Reload page</button>
            <a href="/courses">Back to courses</a>
          </div>
        </section>
      </main>
    );
  }
}
