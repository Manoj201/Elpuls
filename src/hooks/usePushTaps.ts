import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useUiStore } from '../stores/useUiStore';

/** Pushes whose tap should open Din plan (sent by functions/src: publishPushes, smartPushes, dailyBriefing). */
const PLAN_KINDS = new Set(['planReady', 'tonight', 'dailyPlan', 'appliance', 'heatAhead']);

// A response is handled once, even if the app asks for the last one again.
let lastHandled: string | null = null;

function handle(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (id === lastHandled) return;
  lastHandled = id;
  const kind = (response.notification.request.content.data as Record<string, unknown> | undefined)?.kind;
  if (typeof kind === 'string' && PLAN_KINDS.has(kind)) useUiStore.getState().requestPlanFocus();
}

/**
 * Opens Din plan when a plan-related push is tapped: while the app runs, and
 * when the tap launched the app from closed (the last response at startup).
 */
export function usePushTaps(): void {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
