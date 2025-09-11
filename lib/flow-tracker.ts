/**
 * Central Flow Tracker
 * -------------------------------------------------------------
 * Lightweight runtime flow instrumentation across the app.
 * Each event belongs to a scope and optional numeric step.
 */
export interface FlowEvent {
  id: string;
  scope: string;
  step?: number;
  label: string;
  detail?: Record<string, unknown> | string | number | boolean | null;
  ts: string;
}

class FlowTracker {
  private events: FlowEvent[] = [];
  private listeners: Array<(e: FlowEvent) => void> = [];
  private enabled: boolean;

  constructor() {
    const clientFlag = (typeof window !== 'undefined') ? (process.env.NEXT_PUBLIC_ENABLE_FLOW ?? '1') : '1';
    const serverFlag = (typeof window === 'undefined') ? (process.env.ENABLE_FLOW ?? '1') : '1';
    this.enabled = clientFlag !== '0' && serverFlag !== '0';
  }

  private push(ev: FlowEvent) {
    if (!this.enabled) return;
    this.events.push(ev);
    if (this.events.length > 2000) this.events = this.events.slice(-2000);
    this.listeners.forEach(l => l(ev));
    if (process.env.NODE_ENV !== 'production') {
      const prefix = `[FLOW][${ev.scope}]` + (ev.step !== undefined ? `[${ev.step}]` : '');
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(prefix, ev.label, ev.detail ? ev.detail : '');
      }
    }
  }

  step(scope: string, step: number, label: string, detail?: FlowEvent['detail']) {
    this.push({ id: crypto.randomUUID(), scope, step, label, detail, ts: new Date().toISOString() });
  }
  event(scope: string, label: string, detail?: FlowEvent['detail']) {
    this.push({ id: crypto.randomUUID(), scope, label, detail, ts: new Date().toISOString() });
  }
  getAll(): FlowEvent[] { return [...this.events]; }
  getScope(scope: string): FlowEvent[] { return this.events.filter(e => e.scope === scope); }
  subscribe(listener: (e: FlowEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }
  clear(scope?: string) { this.events = scope ? this.events.filter(e => e.scope !== scope) : []; }
  isEnabled() { return this.enabled; }
}

export const flow = new FlowTracker();
