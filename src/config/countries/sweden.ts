import { firestorePriceProvider } from '../../providers/firestore/prices';
import { firestoreWeatherProvider } from '../../providers/firestore/weather';
import type { CountryConfig } from './types';

export const swedenConfig: CountryConfig = {
  code: 'SE',
  name: 'Sweden',
  currency: 'SEK',
  zones: ['SE1', 'SE2', 'SE3', 'SE4'],
  language: 'sv',
  vatRate: 0.25,
  // Both read our own Firestore data, written by Cloud Functions. The app
  // never depends on a third-party API directly.
  priceProvider: firestorePriceProvider,
  weatherProvider: firestoreWeatherProvider,
};
