import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudSnow, CloudFog, CloudLightning, MapPin } from 'lucide-react-native';
import { colors, fonts, radii } from '../theme/tokens';
import { getCurrentLocationWeather, type WeatherSnapshot } from '../lib/weatherApi';

const REFRESH_MS = 15 * 60 * 1000; // weather doesn't need the stock ticker's 60s cadence

function iconFor(code: number, isDay: boolean) {
  if (code === 0 || code === 1) return isDay ? Sun : Moon;
  if (code === 2) return isDay ? CloudSun : CloudMoon;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 95) return CloudLightning;
  if (code >= 71 && code <= 86) return CloudSnow;
  if (code >= 51 && code <= 82) return CloudRain;
  return Cloud;
}

/** A compact pill sitting under "Last login" in DashboardHero's right column — local weather for
 * wherever the signed-in user's device currently is (see weatherApi.ts: device GPS + Open-Meteo).
 * Silently renders nothing if location permission is denied or the lookup fails, same as before —
 * this is a decorative complement tucked in a corner, not a section of its own. */
export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const w = await getCurrentLocationWeather();
      if (!cancelled) setWeather(w);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!weather) return null;

  const Icon = iconFor(weather.weatherCode, weather.isDay);

  return (
    <View style={styles.wrap}>
      <Icon size={13} color={colors.rust} />
      <Text style={styles.temp}>{Math.round(weather.temperature)}°C</Text>
      <View style={styles.divider} />
      <MapPin size={9} color={colors.inkSoft} />
      <Text style={styles.place} numberOfLines={1}>{weather.place}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  temp: {
    fontSize: 11.5,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  divider: {
    width: 1,
    height: 10,
    backgroundColor: colors.border,
    marginHorizontal: 1,
  },
  place: {
    fontSize: 10.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
    maxWidth: 110,
  },
});
