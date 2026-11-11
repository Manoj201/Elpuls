import type { PriceProvider } from '../../providers/types';
import type { WeatherProvider } from '../../providers/types';

export interface CountryConfig {
  /** ISO 3166-1 alpha-2 code, e.g. "SE", "NO" */
  code: string;
  name: string;
  currency: string;
  /** e.g. ["SE1", "SE2", "SE3", "SE4"] */
  zones: string[];
  language: string;
  vatRate: number;
  priceProvider: PriceProvider;
  weatherProvider: WeatherProvider;
}
