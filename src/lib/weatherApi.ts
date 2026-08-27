// Current-location weather for the Home dashboard (src/components/WeatherWidget.tsx). Unlike the
// stock quote, this is called straight from the device: Open-Meteo's forecast API is free, needs
// no API key, and allows browser/CORS calls directly, so there's no secret to hide behind a
// backend proxy. The device's own GPS + on-device reverse geocoder (expo-location) supply the
// coordinates and place name — no third-party geocoding key needed either.
import * as Location from 'expo-location';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherSnapshot {
  place: string;
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  isDay: boolean;
  condition: string;
  dayHigh: number | null;
  dayLow: number | null;
}

// WMO weather codes (https://open-meteo.com/en/docs) collapsed to a short human label.
function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Weather unavailable';
}

export async function getCurrentLocationWeather(): Promise<WeatherSnapshot | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = position.coords;

    const [forecastRes, places] = await Promise.all([
      fetch(
        `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
          '&current=temperature_2m,apparent_temperature,weather_code,is_day' +
          '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1'
      ),
      Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []),
    ]);

    const forecast = await forecastRes.json().catch(() => null);
    const current = forecast?.current;
    if (!current || typeof current.temperature_2m !== 'number') return null;

    const place = places?.[0];
    const placeName = place?.city || place?.subregion || place?.region || place?.country || 'Your location';
    const daily = forecast?.daily;

    return {
      place: placeName,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      weatherCode: current.weather_code,
      isDay: current.is_day === 1,
      condition: describeWeatherCode(current.weather_code),
      dayHigh: typeof daily?.temperature_2m_max?.[0] === 'number' ? daily.temperature_2m_max[0] : null,
      dayLow: typeof daily?.temperature_2m_min?.[0] === 'number' ? daily.temperature_2m_min[0] : null,
    };
  } catch {
    return null;
  }
}
