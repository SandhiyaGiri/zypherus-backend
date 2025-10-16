import type { EventListener } from './types.js';

export class TypedEventEmitter<Events extends { [K in keyof Events]: unknown }> {
  private readonly listeners = new Map<keyof Events, Set<EventListener<Events[keyof Events]>>>();

  on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener as EventListener<Events[keyof Events]>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    const wrapper: EventListener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    bucket.delete(listener as EventListener<Events[keyof Events]>);
    if (bucket.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const listener of Array.from(bucket)) {
      (listener as EventListener<Events[K]>)(payload);
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
