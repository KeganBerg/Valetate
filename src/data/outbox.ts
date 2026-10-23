import type { ParkedCar } from '../types';
import type { CarDetails, DataSource } from './source';

/**
 * Car changes a valet makes are saved on the phone first and sent in order,
 * so parking in a garage with no signal still works. Each change is retried
 * until the server takes it or rejects it (a rejected change is dropped and
 * reported, since retrying would fail the same way).
 */
export type CarOp =
  | { kind: 'parkCar'; car: ParkedCar }
  | { kind: 'moveCar'; id: string; spotKey: string; spotLabel: string }
  | { kind: 'updateCar'; id: string; patch: CarDetails }
  | { kind: 'retrieveCar'; id: string }
  | { kind: 'unretrieveCar'; car: ParkedCar };

interface Queued {
  seq: number;
  op: CarOp;
}

export interface Outbox {
  /** changes not yet on the server */
  count(): number;
  /** try sending now (on reconnect, on wake) */
  flush(): Promise<void>;
  /** `dropped` is set when the server refused a queued change */
  subscribe(on: (count: number, dropped?: unknown) => void): () => void;
}

/** No signal, a dropped connection or a timeout: worth trying again later. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|timed? ?out|fetch failed/i.test(msg);
}

/** The server already has it (an earlier try got through but its reply was lost). */
const alreadyThere = (op: CarOp, e: unknown) =>
  op.kind === 'parkCar' && /parked_cars_pkey/.test(e instanceof Error ? e.message : String(e));

/** What the lot looks like once the queued changes land. */
export function applyPending(cars: ParkedCar[], ops: CarOp[]): ParkedCar[] {
  let out = cars;
  for (const op of ops) {
    switch (op.kind) {
      case 'parkCar':
      case 'unretrieveCar':
        out = [...out.filter((c) => c.id !== op.car.id), op.car];
        break;
      case 'moveCar':
        out = out.map((c) => (c.id === op.id ? { ...c, spotKey: op.spotKey, spotLabel: op.spotLabel } : c));
        break;
      case 'updateCar':
        out = out.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c));
        break;
      case 'retrieveCar':
        out = out.filter((c) => c.id !== op.id);
        break;
    }
  }
  return out;
}

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function withOutbox(
  inner: DataSource,
  storageKey: string,
  store: Store | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
  retryMs = 10000,
): DataSource & { outbox: Outbox } {
  const load = (): Queued[] => {
    try {
      const q = JSON.parse(store?.getItem(storageKey) ?? '[]');
      return Array.isArray(q) ? q : [];
    } catch {
      return [];
    }
  };
  let queue = load();
  let nextSeq = queue.reduce((m, q) => Math.max(m, q.seq + 1), 1);
  const save = () => {
    try {
      store?.setItem(storageKey, JSON.stringify(queue));
    } catch {
      // storage full or blocked: the queue still lives until the page closes
    }
  };

  const listeners = new Set<(count: number, dropped?: unknown) => void>();
  const notify = (dropped?: unknown) => listeners.forEach((l) => l(queue.length, dropped));

  // the caller of each change hears back once: sent, queued for later, or refused
  const waiters = new Map<number, { resolve: () => void; reject: (e: unknown) => void }>();
  const settle = (seq: number, err?: unknown) => {
    const w = waiters.get(seq);
    waiters.delete(seq);
    if (!w) {
      if (err !== undefined) notify(err);
    } else if (err !== undefined) w.reject(err);
    else w.resolve();
  };

  const send = (op: CarOp): Promise<void> => {
    switch (op.kind) {
      case 'parkCar':
        return inner.parkCar(op.car);
      case 'moveCar':
        return inner.moveCar(op.id, op.spotKey, op.spotLabel);
      case 'updateCar':
        return inner.updateCar(op.id, op.patch);
      case 'retrieveCar':
        return inner.retrieveCar(op.id);
      case 'unretrieveCar':
        return inner.unretrieveCar(op.car);
    }
  };

  let retry: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<void> | null = null;
  // set when a change (or a retry) arrives while a run is finishing, so it gets its own try
  let again = false;
  const flush = (): Promise<void> => {
    again = true;
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        while (again) {
          again = false;
          await drain();
        }
      } finally {
        flushing = null;
      }
      notify();
    })();
    return flushing;
  };

  const drain = async () => {
    while (queue.length) {
      const q = queue[0];
      try {
        await send(q.op);
      } catch (e) {
        if (isNetworkError(e)) {
          // keep everything queued; whoever is waiting hears "saved on this phone"
          for (const w of queue) settle(w.seq);
          clearTimeout(retry);
          retry = setTimeout(() => void flush(), retryMs);
          return;
        }
        if (!alreadyThere(q.op, e)) {
          queue = queue.slice(1);
          save();
          settle(q.seq, e);
          continue;
        }
      }
      queue = queue.slice(1);
      save();
      settle(q.seq);
    }
  };

  const enqueue = (op: CarOp) => {
    const q = { seq: nextSeq++, op };
    queue = [...queue, q];
    save();
    notify();
    const done = new Promise<void>((resolve, reject) => waiters.set(q.seq, { resolve, reject }));
    void flush();
    return done;
  };

  // changes left from before the app was closed
  if (queue.length) void flush();

  return {
    ...inner,
    listCars: async () => applyPending(await inner.listCars(), queue.map((q) => q.op)),
    parkCar: (car) => enqueue({ kind: 'parkCar', car }),
    moveCar: (id, spotKey, spotLabel) => enqueue({ kind: 'moveCar', id, spotKey, spotLabel }),
    updateCar: (id, patch) => enqueue({ kind: 'updateCar', id, patch }),
    retrieveCar: (id) => enqueue({ kind: 'retrieveCar', id }),
    unretrieveCar: (car) => enqueue({ kind: 'unretrieveCar', car }),
    outbox: {
      count: () => queue.length,
      flush,
      subscribe(on) {
        listeners.add(on);
        return () => listeners.delete(on);
      },
    },
  };
}
