import { DEFAULT_ADJUSTMENTS } from '../editing/presets';
import { normalizeAdjustments } from '../editing/filters';
import { COLOR_BANDS, normalizeColorBand, type ColorMixerState } from '../editing/colorMixer';
import type { Adjustments, EditState } from '../editing/types';
import type { CubeLut } from '../luts/types';
import { LUT_LIBRARY_LIMIT } from '../luts/lutLibrary';
import { MAX_LUT_OUTPUT, MAX_LUT_SIZE } from '../luts/parseCube';

export interface SessionSnapshot {
  file: File;
  edit: EditState;
  library: CubeLut[];
  currentTime: number;
}

interface StoredSnapshot {
  version: 1;
  videoId: string;
  adjustments: Adjustments;
  colorMixer: ColorMixerState;
  lut: { sourceId: string | null; intensity: number; enabled: boolean };
  libraryIds: string[];
  currentTime: number;
  updatedAt: number;
}
interface StoredVideo {
  id: string;
  file: Blob;
  name: string;
  lastModified: number;
}
interface StoredLut {
  id: string;
  source: CubeLut;
}

const DATABASE = 'cliplab-session';
const CURRENT = 'current';
const STORES = ['video', 'snapshot', 'luts'];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local storage was interrupted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function validLut(value: unknown): value is CubeLut {
  if (
    !record(value) ||
    typeof value.name !== 'string' ||
    (value.fileName !== undefined && typeof value.fileName !== 'string') ||
    !finite(value.size) ||
    !Number.isInteger(value.size) ||
    value.size < 2 ||
    value.size > MAX_LUT_SIZE ||
    !(value.data instanceof Float32Array) ||
    value.data.length !== value.size ** 3 * 3
  )
    return false;
  const lower = value.domainMin;
  const upper = value.domainMax;
  return (
    Array.isArray(lower) &&
    Array.isArray(upper) &&
    lower.length === 3 &&
    upper.length === 3 &&
    lower.every(
      (entry, index) =>
        finite(entry) &&
        finite(upper[index]) &&
        Math.abs(entry) <= 1e37 &&
        Math.abs(upper[index]) <= 1e37 &&
        Math.fround(upper[index]) > Math.fround(entry),
    ) &&
    value.data.every((entry) => Number.isFinite(entry) && Math.abs(entry) <= MAX_LUT_OUTPUT)
  );
}

function restoreSnapshot(
  raw: unknown,
  video: unknown,
  assets: unknown[],
): {
  snapshot: SessionSnapshot;
  stored: StoredSnapshot;
  luts: StoredLut[];
} {
  const invalid = () =>
    new Error(
      'The saved session is damaged or incompatible. Open a video to start a new session, or clear the saved session.',
    );
  if (
    !record(raw) ||
    raw.version !== 1 ||
    typeof raw.videoId !== 'string' ||
    !record(video) ||
    video.id !== raw.videoId ||
    !(video.file instanceof Blob) ||
    typeof video.name !== 'string' ||
    !finite(video.lastModified) ||
    !record(raw.adjustments) ||
    !record(raw.colorMixer) ||
    !record(raw.lut) ||
    !Array.isArray(raw.libraryIds) ||
    raw.libraryIds.length > LUT_LIBRARY_LIMIT ||
    raw.libraryIds.some((id) => typeof id !== 'string') ||
    new Set(raw.libraryIds).size !== raw.libraryIds.length ||
    !(raw.lut.sourceId === null || typeof raw.lut.sourceId === 'string') ||
    !finite(raw.lut.intensity) ||
    typeof raw.lut.enabled !== 'boolean' ||
    !finite(raw.currentTime) ||
    raw.currentTime < 0
  )
    throw invalid();
  const adjustments = raw.adjustments;
  if (Object.keys(DEFAULT_ADJUSTMENTS).some((key) => !finite(adjustments[key]))) throw invalid();
  const mixer = raw.colorMixer;
  for (const { id } of COLOR_BANDS) {
    const band = mixer[id];
    if (!record(band) || !finite(band.hue) || !finite(band.saturation) || !finite(band.luminance))
      throw invalid();
  }
  const ids = new Set([...raw.libraryIds, ...(raw.lut.sourceId ? [raw.lut.sourceId] : [])]);
  const luts: StoredLut[] = [];
  for (const id of ids) {
    const asset = assets.find((item) => record(item) && item.id === id);
    if (!record(asset) || !validLut(asset.source)) throw invalid();
    luts.push({ id, source: asset.source });
  }
  const lookup = new Map(luts.map(({ id, source }) => [id, source]));
  const stored = raw as unknown as StoredSnapshot;
  const file =
    video.file instanceof File
      ? video.file
      : new File([video.file], video.name, {
          type: video.file.type,
          lastModified: video.lastModified,
        });
  return {
    stored,
    luts,
    snapshot: {
      file,
      library: stored.libraryIds.map((id) => lookup.get(id)!),
      currentTime: stored.currentTime,
      edit: {
        adjustments: normalizeAdjustments(stored.adjustments),
        colorMixer: Object.fromEntries(
          COLOR_BANDS.map(({ id }) => [id, normalizeColorBand(stored.colorMixer[id])]),
        ) as ColorMixerState,
        lut: {
          source: stored.lut.sourceId ? lookup.get(stored.lut.sourceId)! : null,
          intensity: Math.max(0, Math.min(100, Math.round(stored.lut.intensity))),
          enabled: stored.lut.enabled,
        },
      },
    },
  };
}

// One adapter per editor. The hook serializes reads, writes and clearing.
export function createSessionStorage() {
  let database: Promise<IDBDatabase> | null = null;
  let savedFile: File | null = null;
  let videoId = '';
  const sourceIds = new WeakMap<CubeLut, string>();

  function open(): Promise<IDBDatabase> {
    if (database) return database;
    if (typeof indexedDB === 'undefined')
      return Promise.reject(
        new Error('This browser cannot save sessions locally. Your current work is still open.'),
      );
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      let blocked = false;
      request.onupgradeneeded = () =>
        STORES.forEach((name) => request.result.createObjectStore(name));
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other ClipLab tabs to enable local saving.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          database = null;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
    return database;
  }

  return {
    async read(): Promise<SessionSnapshot | null> {
      const db = await open();
      const transaction = db.transaction(STORES, 'readonly');
      const done = transactionDone(transaction);
      const [snapshot, videos, luts] = await Promise.all([
        requestResult<unknown>(transaction.objectStore('snapshot').get(CURRENT)),
        requestResult<unknown[]>(transaction.objectStore('video').getAll()),
        requestResult<unknown[]>(transaction.objectStore('luts').getAll()),
        done,
      ]);
      if (snapshot === undefined) return null;
      const video = videos.find(
        (item) => record(item) && record(snapshot) && item.id === snapshot.videoId,
      );
      const restored = restoreSnapshot(snapshot, video, luts);
      savedFile = restored.snapshot.file;
      videoId = restored.stored.videoId;
      restored.luts.forEach(({ id, source }) => sourceIds.set(source, id));
      return restored.snapshot;
    },

    async write(snapshot: SessionSnapshot): Promise<void> {
      const db = await open();
      const replacingVideo = savedFile !== snapshot.file;
      const nextVideoId = replacingVideo ? crypto.randomUUID() : videoId;
      const assets = [
        ...new Set([
          ...snapshot.library,
          ...(snapshot.edit.lut.source ? [snapshot.edit.lut.source] : []),
        ]),
      ];
      const identified = assets.map((source) => {
        let id = sourceIds.get(source);
        if (!id) {
          id = crypto.randomUUID();
          sourceIds.set(source, id);
        }
        return { id, source };
      });
      const keep = new Set(identified.map(({ id }) => id));
      const transaction = db.transaction(STORES, 'readwrite');
      const done = transactionDone(transaction);
      let writeFailure: unknown;
      const safely = (operation: () => void) => {
        try {
          operation();
        } catch (reason) {
          writeFailure = reason;
          transaction.abort();
        }
      };
      const videoStore = transaction.objectStore('video');
      const videoKey = videoStore.getKey(nextVideoId);
      videoKey.onsuccess = () => {
        if (videoKey.result !== undefined) return;
        const video: StoredVideo = {
          id: nextVideoId,
          file: snapshot.file,
          name: snapshot.file.name,
          lastModified: snapshot.file.lastModified,
        };
        safely(() => {
          videoStore.put(video, nextVideoId);
        });
      };
      const videoCursor = videoStore.openKeyCursor();
      videoCursor.onsuccess = () => {
        const entry = videoCursor.result;
        if (!entry) return;
        if (entry.key !== nextVideoId) videoStore.delete(entry.key);
        entry.continue();
      };
      const lutStore = transaction.objectStore('luts');
      for (const { id, source } of identified) {
        const key = lutStore.getKey(id);
        key.onsuccess = () => {
          if (key.result === undefined)
            safely(() => {
              lutStore.put({ id, source }, id);
            });
        };
      }
      const cursor = lutStore.openKeyCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (!keep.has(String(entry.key))) lutStore.delete(entry.key);
        entry.continue();
      };
      const stored: StoredSnapshot = {
        version: 1,
        videoId: nextVideoId,
        adjustments: snapshot.edit.adjustments,
        colorMixer: snapshot.edit.colorMixer,
        lut: {
          sourceId: snapshot.edit.lut.source ? sourceIds.get(snapshot.edit.lut.source)! : null,
          intensity: snapshot.edit.lut.intensity,
          enabled: snapshot.edit.lut.enabled,
        },
        libraryIds: snapshot.library.map((source) => sourceIds.get(source)!),
        currentTime: snapshot.currentTime,
        updatedAt: Date.now(),
      };
      transaction.objectStore('snapshot').put(stored, CURRENT);
      await done.catch((reason: unknown) => {
        throw writeFailure ?? reason;
      });
      savedFile = snapshot.file;
      videoId = nextVideoId;
    },

    async clear(): Promise<void> {
      const db = await open();
      const transaction = db.transaction(STORES, 'readwrite');
      const done = transactionDone(transaction);
      STORES.forEach((name) => transaction.objectStore(name).clear());
      await done;
      savedFile = null;
      videoId = '';
    },
  };
}

export function sessionStorageError(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'QuotaExceededError')
    return 'There is not enough browser storage to save this session. Your current work is still open.';
  if (reason instanceof Error && !(reason instanceof DOMException)) return reason.message;
  return 'Local saving is unavailable. Your current work is still open, but it will not survive a refresh.';
}
