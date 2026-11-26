import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * True when this app build contains the calendar module (added in 1.0.8).
 * expo-calendar is loaded only when used, so an older build (or a Simulator
 * build made before it was added) simply hides the button instead of crashing.
 */
export const calendarAvailable = requireOptionalNativeModule('ExpoCalendar') !== null;

/** Minutes before the start for an ordinary reminder. */
const ALERT_MINUTES = 10;
/** Night rows remind in the evening, so there's time to set a delayed start. */
const NIGHT_ALERT_HOUR = 21;
const NIGHT_ALERT_MINUTE = 30;

export interface PlanCalendarEvent {
  title: string;
  notes: string;
  start: Date;
  end: Date;
  /** Night row (21:00 → 06:00): the alert is at 21:30 instead of 10 min before. */
  night: boolean;
}

/** Minutes between 21:30 the evening before (or of the same evening) and the start. */
function nightAlertOffset(start: Date): number {
  const evening = new Date(start);
  evening.setHours(NIGHT_ALERT_HOUR, NIGHT_ALERT_MINUTE, 0, 0);
  // Small hours belong to the evening before.
  if (start.getHours() < 12) evening.setDate(evening.getDate() - 1);
  const minutes = Math.round((start.getTime() - evening.getTime()) / 60000);
  return Math.max(ALERT_MINUTES, minutes);
}

export type CalendarResult = 'saved' | 'canceled' | 'noPermission';

/**
 * Opens the phone's own "New event" sheet, filled in (Din plan → calendar).
 * The user confirms with "Add"; nothing is written without that, and Elpuls
 * never reads the calendar. On iOS 17+ the sheet needs no permission (it
 * saves out of process); older iOS asks once.
 */
export async function addPlanEventToCalendar(event: PlanCalendarEvent): Promise<CalendarResult> {
  const Calendar = await import('expo-calendar');
  const iosMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 99;
  if (Platform.OS === 'ios' && iosMajor < 17) {
    const { granted } = await Calendar.requestCalendarPermissionsAsync();
    if (!granted) return 'noPermission';
  }
  const result = await Calendar.createEventInCalendarAsync({
    title: event.title,
    notes: event.notes,
    startDate: event.start,
    endDate: event.end,
    alarms: [{ relativeOffset: -(event.night ? nightAlertOffset(event.start) : ALERT_MINUTES) }],
  });
  // Android can't tell whether the user saved, so treat "done" as saved there.
  return result.action === 'saved' || result.action === 'done' ? 'saved' : 'canceled';
}
