import { useCallback, useEffect, useRef, useState } from 'react';
import { createSessionStorage, sessionStorageError, type SessionSnapshot } from './sessionStorage';

export type SavePhase =
  'restoring' | 'idle' | 'saving' | 'saved' | 'unsaved' | 'clearing' | 'error';

export function useSessionPersistence(onRestore: (snapshot: SessionSnapshot) => void) {
  const storage = useRef<ReturnType<typeof createSessionStorage> | null>(null);
  if (!storage.current) storage.current = createSessionStorage();
  const latest = useRef<SessionSnapshot | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const enabled = useRef(true);
  const writing = useRef(false);
  const revision = useRef(0);
  const generation = useRef(0);
  const [view, setView] = useState<{ phase: SavePhase; error: string | null; hasSaved: boolean }>({
    phase: 'restoring',
    error: null,
    hasSaved: false,
  });

  const enqueue = useCallback(<T>(operation: () => Promise<T>): Promise<T> => {
    const task = queue.current.then(operation);
    queue.current = task.catch(() => {});
    return task;
  }, []);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(
    function saveLatest() {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (!enabled.current || !latest.current || writing.current) return;
      const snapshot = latest.current;
      const version = revision.current;
      const session = generation.current;
      writing.current = true;
      void enqueue(() => storage.current!.write(snapshot))
        .then(() => {
          writing.current = false;
          if (!mounted.current || !enabled.current) return;
          if (version !== revision.current) {
            saveLatest();
            return;
          }
          setView((previous) =>
            previous.phase === 'saved' && previous.hasSaved
              ? previous
              : { phase: 'saved', error: null, hasSaved: true },
          );
        })
        .catch((reason: unknown) => {
          writing.current = false;
          if (!mounted.current || !enabled.current) return;
          if (session !== generation.current) {
            saveLatest();
            return;
          }
          // Keep the latest work in memory; retry explicitly rather than on every frame.
          enabled.current = false;
          setView((previous) => ({
            ...previous,
            phase: 'error',
            error: sessionStorageError(reason),
          }));
        });
    },
    [enqueue],
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const session = generation.current;
    void enqueue(() => storage.current!.read())
      .then((snapshot) => {
        if (!active || session !== generation.current) return;
        if (snapshot) {
          latest.current = snapshot;
          onRestore(snapshot);
        }
        setView({ phase: snapshot ? 'saved' : 'idle', error: null, hasSaved: !!snapshot });
      })
      .catch((reason: unknown) => {
        if (!active || session !== generation.current) return;
        enabled.current = false;
        setView({ phase: 'error', error: sessionStorageError(reason), hasSaved: true });
      });
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      active = false;
      mounted.current = false;
      cancelTimer();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [onRestore, enqueue, flush, cancelTimer]);

  const beginSession = useCallback(() => {
    generation.current++;
    revision.current++;
    enabled.current = true;
    latest.current = null;
    cancelTimer();
    setView((previous) => ({ ...previous, phase: 'saving', error: null }));
  }, [cancelTimer]);

  const updateSnapshot = useCallback(
    (snapshot: Omit<SessionSnapshot, 'currentTime'>) => {
      const previous = latest.current;
      if (
        previous?.file === snapshot.file &&
        previous.edit === snapshot.edit &&
        previous.library === snapshot.library
      )
        return;
      latest.current = {
        ...snapshot,
        currentTime: previous?.file === snapshot.file ? previous.currentTime : 0,
      };
      revision.current++;
      if (!enabled.current) return;
      setView((current) =>
        current.phase === 'saving' ? current : { ...current, phase: 'saving', error: null },
      );
      cancelTimer();
      timer.current = setTimeout(flush, 0);
    },
    [cancelTimer, flush],
  );

  const updatePosition = useCallback(
    (time: number, immediately = false) => {
      if (!latest.current || !Number.isFinite(time) || time < 0) return;
      if (latest.current.currentTime !== time) {
        latest.current = { ...latest.current, currentTime: time };
        revision.current++;
      } else if (!immediately) return;
      if (!enabled.current) return;
      if (immediately) flush();
      else if (timer.current === null) timer.current = setTimeout(flush, 1000);
    },
    [flush],
  );

  const clearSaved = useCallback(() => {
    const session = ++generation.current;
    revision.current++;
    enabled.current = false;
    cancelTimer();
    setView((previous) => ({ ...previous, phase: 'clearing', error: null }));
    void enqueue(() => storage.current!.clear())
      .then(() => {
        if (!mounted.current || session !== generation.current) return;
        setView({ phase: latest.current ? 'unsaved' : 'idle', error: null, hasSaved: false });
      })
      .catch((reason: unknown) => {
        if (!mounted.current || session !== generation.current) return;
        setView((previous) => ({
          ...previous,
          phase: 'error',
          error: sessionStorageError(reason),
        }));
      });
  }, [cancelTimer, enqueue]);

  const saveNow = useCallback(() => {
    if (!latest.current) return;
    generation.current++;
    revision.current++;
    enabled.current = true;
    setView((previous) => ({ ...previous, phase: 'saving', error: null }));
    flush();
  }, [flush]);

  return { ...view, beginSession, updateSnapshot, updatePosition, clearSaved, saveNow };
}
