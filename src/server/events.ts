export interface StoreUpdatedEvent {
  updatedAt: string;
  sourceClientId?: string;
}

export type StoreEventListener = (event: StoreUpdatedEvent) => void;

export interface StoreEventBus {
  subscribe: (listener: StoreEventListener) => () => void;
  publish: (event: StoreUpdatedEvent) => void;
  subscriberCount: () => number;
}

export function createStoreEventBus(): StoreEventBus {
  const listeners = new Set<StoreEventListener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore individual listener failures so other clients continue receiving updates
        }
      }
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}
