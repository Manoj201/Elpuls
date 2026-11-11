import { create } from 'zustand';
import { countryConfigs, DEFAULT_COUNTRY_CODE, type CountryConfig } from '../config/countries';

interface CountryState {
  countryCode: string;
  zone: string;
  config: CountryConfig;
  setCountry: (countryCode: string) => void;
  setZone: (zone: string) => void;
}

const defaultConfig = countryConfigs[DEFAULT_COUNTRY_CODE];

export const useCountryStore = create<CountryState>((set) => ({
  countryCode: DEFAULT_COUNTRY_CODE,
  zone: defaultConfig.zones[0],
  config: defaultConfig,
  setCountry: (countryCode) => {
    const config = countryConfigs[countryCode];
    if (!config) {
      throw new Error(`Unknown country code: ${countryCode}`);
    }
    set({ countryCode, config, zone: config.zones[0] });
  },
  setZone: (zone) => set({ zone }),
}));
