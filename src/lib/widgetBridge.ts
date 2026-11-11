import { ExtensionStorage } from '@bacons/apple-targets';

const APP_GROUP = 'group.se.elpuls.app';

export interface WidgetSnapshot {
  priceOre: number;
  trendArrow: 'up' | 'down' | 'flat';
  updatedAt: string;
}

const storage = new ExtensionStorage(APP_GROUP);

/**
 * Writes the current price to the shared App Group container the iOS
 * widget reads from, then asks WidgetKit to refresh. Best-effort — the
 * widget is a nice-to-have, never allowed to break the main app if the
 * native module isn't available (e.g. Expo Go, or before a native rebuild
 * has picked up the new target).
 */
export function writeWidgetSnapshot(snapshot: WidgetSnapshot): void {
  try {
    storage.set('priceOre', snapshot.priceOre);
    storage.set('trendArrow', snapshot.trendArrow);
    storage.set('updatedAt', snapshot.updatedAt);
    ExtensionStorage.reloadWidget();
  } catch (err) {
    console.log('Failed to write widget snapshot:', err);
  }
}
