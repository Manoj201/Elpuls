import { swedenConfig } from './sweden';
import type { CountryConfig } from './types';

export const countryConfigs: Record<string, CountryConfig> = {
  SE: swedenConfig,
};

export const DEFAULT_COUNTRY_CODE = 'SE';

export type { CountryConfig };
