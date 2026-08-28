// Current-location weather for the form header. Open-Meteo needs no API key and allows direct
// browser calls, and expo-location's getCurrentPositionAsync works fine on web (it's a thin
// wrapper over the browser's own Geolocation API). Its reverseGeocodeAsync does NOT work on web,
// though — expo-location's web platform shim (ExpoLocation.web.ts) throws unconditionally there,
// native-only — so place name comes from BigDataCloud's free client-side reverse-geocode API
// instead (no key, CORS-enabled, built specifically for this exact browser use case).
import * as Location from 'expo-location';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

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

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const res = await fetch(`${REVERSE_GEOCODE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
    const data = await res.json().catch(() => null);
    return data?.city || data?.locality || data?.principalSubdivision || data?.countryName || 'Your location';
  } catch {
    return 'Your location';
  }
}

export async function getCurrentLocationWeather(): Promise<WeatherSnapshot | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = position.coords;

    const [forecastRes, placeName] = await Promise.all([
      fetch(`${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`),
      reverseGeocode(latitude, longitude),
    ]);

    const forecast = await forecastRes.json().catch(() => null);
    const current = forecast?.current;
    if (!current || typeof current.temperature_2m !== 'number') return null;

    return {
      place: placeName,
      temperature: current.temperature_2m,
      condition: describeWeatherCode(current.weather_code),
    };
  } catch {
    return null;
  }
}
