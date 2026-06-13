export type BridgeEvent =
  | { type: 'status'; message: string }
  | { type: 'permission_requested'; requestId: string }
  | { type: 'permission_decided'; requestId: string; decision: string };

export class BridgeEventHub {
  private readonly listeners = new Set<(event: BridgeEvent) => void>();

  emit(event: BridgeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
