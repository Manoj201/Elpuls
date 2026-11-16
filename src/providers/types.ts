export interface HourlyPrice {
  /** Start of the hour this price applies to */
  hour: Date;
  /** Price per kWh, including VAT, in the country's currency */
  price: number;
  currency: string;
}

export interface HourlyForecast {
  /** Start of the hour this forecast applies to */
  hour: Date;
  tempC: number;
  windMs: number;
  cloudCoverPct: number;
}

export interface PriceProvider {
  /**
   * Spot prices for a zone and date, from our own backend (never a third-party API directly).
   * Returns an empty array if prices for that date aren't published yet
   * (e.g. tomorrow's prices before ~13:00 CET) rather than throwing.
   */
  getPrices(zone: string, date: Date): Promise<HourlyPrice[]>;
}

export interface WeatherProvider {
  /** Hourly weather forecast for a price zone (at the zone's reference point). */
  getForecast(zone: string): Promise<HourlyForecast[]>;
}
