import type { ConvoCertoEvent } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (event: any) => void;

type EventHandler<T extends ConvoCertoEvent["type"]> = (
  event: Extract<ConvoCertoEvent, { type: T }>
) => void;

class EventBus {
  private handlers = new Map<string, Set<AnyHandler>>();

  on<T extends ConvoCertoEvent["type"]>(
    type: T,
    handler: EventHandler<T>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const set = this.handlers.get(type)!;
    const h = handler as AnyHandler;
    set.add(h);
    return () => set.delete(h);
  }

  emit(event: ConvoCertoEvent): void {
    const set = this.handlers.get(event.type);
    if (set) {
      for (const handler of set) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${event.type}:`, err);
        }
      }
    }
  }

  off(type: ConvoCertoEvent["type"]): void {
    this.handlers.delete(type);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();
