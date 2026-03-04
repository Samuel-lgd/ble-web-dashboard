/**
 * @file Weather data fetching from Open-Meteo free API.
 * No API key required. Graceful fallback if offline or API fails.
 *
 * @typedef {import('./trip-types.js').WeatherInfo} WeatherInfo
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * WMO Weather interpretation codes mapped to human-readable conditions.
 * @see https://open-meteo.com/en/docs#weathervariables
 */
const WMO_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export class WeatherManager {
  /**
   * Fetch weather for the given coordinates and time.
   * Uses Open-Meteo current weather endpoint.
   * @param {number} lat
   * @param {number} lng
   * @param {string} _isoTime - ISO 8601 timestamp (reserved for future hourly lookup).
   * @returns {Promise<WeatherInfo|null>}
   */
  async fetchWeather(lat, lng, _isoTime) {
    try {
      const url = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}`
        + `&current_weather=true&windspeed_unit=kmh&timezone=auto`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      const cw = data.current_weather;
      if (!cw) return null;

      return {
        tempC: cw.temperature,
        condition: WMO_CODES[cw.weathercode] || `Code ${cw.weathercode}`,
        windKmh: cw.windspeed,
      };
    } catch (_) {
      // Offline or API failure — return null
      return null;
    }
  }
}
