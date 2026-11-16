import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePriceStore } from '../stores/usePriceStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { useNow } from '../hooks/useNow';

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
const stockholmHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' });

const MIN = 60_000;

/**
 * Prices reload when: the zone changed; the last load failed; the Swedish date
 * changed (tomorrow's prices move to today at once, see rollOverDay); it's
 * after 12:00 and tomorrow is still missing (on return to the app: at once;
 * while open: every 10 min); or the data is older than 15 min on return /
 * 60 min while open. Weather reloads when older than 60 min or the date
 * changed. Refreshes run in the background: screens keep the old data.
 */
function checkData(zone: string, cameToForeground: boolean) {
  const now = Date.now();
  const today = stockholmDate.format(new Date(now));

  const prices = usePriceStore.getState();
  if (prices.dateKey !== null && prices.dateKey !== today) prices.rollOverDay();
  {
    // A load already running is reused by the store, so this never doubles up.
    const p = usePriceStore.getState();
    const age = p.fetchedAt === null ? Infinity : now - p.fetchedAt;
    const waitingForTomorrow = p.tomorrowPrices.length === 0 && Number(stockholmHour.format(new Date(now))) >= 12;
    const stale =
      p.zone !== zone ||
      p.error !== null ||
      p.dateKey !== today ||
      (waitingForTomorrow && age > (cameToForeground ? 0 : 10 * MIN)) ||
      age > (cameToForeground ? 15 : 60) * MIN;
    if (stale) p.fetchPrices(zone, { force: true });
  }

  const weather = useWeatherStore.getState();
  if (!weather.isLoading) {
    const age = weather.fetchedAt === null ? Infinity : now - weather.fetchedAt;
    const dayChanged = weather.fetchedAt !== null && stockholmDate.format(new Date(weather.fetchedAt)) !== today;
    if (weather.zone !== zone || weather.error !== null || dayChanged || age > 60 * MIN) weather.fetchForecast(zone, { force: true });
  }
}

/**
 * Keeps prices and weather current on every screen, while the app is open
 * and when it comes back from the background. Rendered once in App.tsx (only
 * the active tab is mounted, so a screen-level hook would stop when you
 * leave that screen). A component, not a hook in App, so the clock ticks
 * re-render only this, not the whole app.
 */
export function DataAutoRefresh({ zone }: { zone: string }) {
  // Checks on every quarter-hour tick of the shared clock (incl. right at midnight)…
  const now = useNow();
  useEffect(() => {
    checkData(zone, false);
  }, [zone, now]);

  // …and at once when the app comes back, plus once a minute while it's open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkData(zone, true);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') checkData(zone, false);
    }, MIN);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [zone]);

  return null;
}
