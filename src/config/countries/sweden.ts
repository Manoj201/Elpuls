import { elprisetjustnuProvider } from '../../providers/price/elprisetjustnu';
import { smhiProvider } from '../../providers/weather/smhi';
import type { CountryConfig } from './types';

export const swedenConfig: CountryConfig = {
  code: 'SE',
  name: 'Sweden',
  currency: 'SEK',
  zones: ['SE1', 'SE2', 'SE3', 'SE4'],
  language: 'sv',
  vatRate: 0.25,
  priceProvider: elprisetjustnuProvider,
  weatherProvider: smhiProvider,
};
