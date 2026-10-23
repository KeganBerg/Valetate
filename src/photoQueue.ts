import type { DataSource } from './data/source';
import type { CarPhoto, ParkedCar, PhotoSide } from './types';

/** a photo still on its way up: shown right away, retried until it lands */
export interface PendingPhoto {
  id: string;
  car: ParkedCar;
  side: PhotoSide;
  url: string;
  blob: Blob;
  takenAt: number;
  failed: boolean;
}

/**
 * Uploads walkaround photos in the background. Closing the photo sheet or
 * losing signal in a garage doesn't lose them: failed uploads retry when the
 * phone comes back online and every 15 seconds.
 */
export function createPhotoQueue(source: DataSource) {
  let items: PendingPhoto[] = [];
  const listeners = new Set<() => void>();
  const savedListeners = new Set<(p: CarPhoto) => void>();
  const emit = () => listeners.forEach((f) => f());

  const send = async (p: PendingPhoto) => {
    items = items.map((x) => (x.id === p.id ? { ...x, failed: false } : x));
    emit();
    try {
      const saved = await source.addPhoto({ id: p.id, car: p.car, side: p.side, blob: p.blob, takenAt: p.takenAt });
      items = items.filter((x) => x.id !== p.id);
      savedListeners.forEach((f) => f(saved));
    } catch {
      items = items.map((x) => (x.id === p.id ? { ...x, failed: true } : x));
    }
    emit();
  };

  const retry = () => items.filter((p) => p.failed).forEach(send);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', retry);
    window.setInterval(retry, 15000);
    // last line of defence: warn before closing the tab with photos still unsent
    window.addEventListener('beforeunload', (e) => {
      if (items.length) e.preventDefault();
    });
  }

  return {
    add(p: Omit<PendingPhoto, 'failed'>) {
      const item = { ...p, failed: false };
      items = [...items, item];
      emit();
      send(item);
    },
    forCar: (carId: string) => items.filter((p) => p.car.id === carId),
    get count() {
      return items.length;
    },
    subscribe(f: () => void) {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    onSaved(f: (p: CarPhoto) => void) {
      savedListeners.add(f);
      return () => void savedListeners.delete(f);
    },
  };
}

export type PhotoQueue = ReturnType<typeof createPhotoQueue>;
