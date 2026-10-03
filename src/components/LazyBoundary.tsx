"use client";

import { Component, type ReactNode } from "react";

/**
 * Contains a failed lazy chunk (typically offline, before that chunk was ever
 * cached) so one optional section cannot take the whole page down with it.
 */
export class LazyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
