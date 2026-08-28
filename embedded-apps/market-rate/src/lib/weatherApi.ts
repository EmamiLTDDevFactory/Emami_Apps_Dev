// Current-location weather for the form header — same approach as the hub's own
// src/components/WeatherWidget.tsx: Open-Meteo needs no API key and allows direct browser calls,
// and the device's own GPS + on-device reverse geocoder (expo-location) supply place name too.
import * as Location from 'expo-location';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherSnapshot {
  place: string;
  temperature: number;
  condition: string;
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
      fetch(`${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`),
      Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []),
    ]);

    const forecast = await forecastRes.json().catch(() => null);
    const current = forecast?.current;
    if (!current || typeof current.temperature_2m !== 'number') return null;

    const place = places?.[0];
    const placeName = place?.city || place?.subregion || place?.region || place?.country || 'Your location';

    return {
      place: placeName,
      temperature: current.temperature_2m,
      condition: describeWeatherCode(current.weather_code),
    };
  } catch {
    return null;
  }
}
