import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

/**
 * One shared app clock for everything that depends on "now" (gauge, chart
 * now-line, best times, plan statuses, solar card). Prices change every 15
 * minutes, so it ticks on each quarter-hour boundary (:00, :15, :30, :45 by
 * the phone's clock) and whenever the app comes back to the foreground: iOS
 * keeps the app paused for hours, and timers don't run while it's paused.
 *
 * Use the returned Date as a useMemo dependency instead of calling
 * `new Date()` inside memos, which freezes the time at the first render.
 */
const QUARTER_MS = 15 * 60 * 1000;

let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: NativeEventSubscription | null = null;

function emit() {
  now = new Date();
  listeners.forEach((l) => l());
}

function scheduleNextTick() {
  if (timer) clearTimeout(timer);
  const ms = Date.now();
  // +250 ms so the tick lands just after the boundary, inside the new slot.
  const delay = QUARTER_MS - (ms % QUARTER_MS) + 250;
  timer = setTimeout(() => {
    emit();
    scheduleNextTick();
  }, delay);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Catch up in case time moved while nothing was listening.
    now = new Date();
    scheduleNextTick();
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      emit();
      // The timer may have been frozen while paused; re-align it.
      scheduleNextTick();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

const getSnapshot = () => now;

/** The current time, updated on every quarter-hour and when the app returns to the foreground. */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/** Today's date in Sweden as YYYY-MM-DD; changes at midnight. For reloading day-keyed data. */
export function useStockholmDay(): string {
  return stockholmDate.format(useNow());
}

/**
 * For data written by the server at a set time (explainer ~07:00, outlook
 * ~15:00, tomorrow's plan ~13:30): returns a counter that goes up on every
 * clock tick (quarter-hour, or back to the app) while `missing` is true. Put
 * it in the load effect's dependencies so the hook checks again until the
 * data exists, instead of waiting for tomorrow.
 */
export function useRetryWhileMissing(missing: boolean): number {
  const now = useNow();
  const [count, setCount] = useState(0);
  const missingRef = useRef(missing);
  missingRef.current = missing;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (missingRef.current) setCount((c) => c + 1);
  }, [now]);
  return count;
}
