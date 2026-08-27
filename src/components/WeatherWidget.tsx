import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudSnow, CloudFog, CloudLightning, MapPin, CloudOff } from 'lucide-react-native';
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

/** A card section sitting right below CompanyPulseCard's stock ticker on Home — local weather for
 * wherever the signed-in user's device currently is (see weatherApi.ts: device GPS + Open-Meteo,
 * no account-level "home location" involved). Shows a quiet fallback instead of disappearing
 * outright when location permission is denied or the lookup fails, since this now sits in the
 * page flow as its own section rather than a decorative corner badge. */
export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const w = await getCurrentLocationWeather();
      if (!cancelled) {
        setWeather(w);
        setLoaded(true);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!loaded) return null; // avoid flashing the "unavailable" state during the first lookup

  if (!weather) {
    return (
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <View style={styles.iconBox}>
            <CloudOff size={13} color={colors.rust} />
          </View>
          <Text style={styles.label}>Weather</Text>
        </View>
        <Text style={styles.unavailableText}>
          Local weather isn't available — allow location access for this site to see conditions here.
        </Text>
      </View>
    );
  }

  const Icon = iconFor(weather.weatherCode, weather.isDay);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.iconBox}>
          <MapPin size={13} color={colors.rust} />
        </View>
        <Text style={styles.label}>Weather · {weather.place}</Text>
      </View>
      <View style={styles.contentRow}>
        <Icon size={30} color={colors.rust} />
        <View style={styles.flex1}>
          <Text style={styles.temp}>
            {Math.round(weather.temperature)}°C <Text style={styles.condition}>{weather.condition}</Text>
          </Text>
          <Text style={styles.subText}>
            Feels like {Math.round(weather.feelsLike)}°C
            {weather.dayHigh != null && weather.dayLow != null
              ? `  ·  H ${Math.round(weather.dayHigh)}° L ${Math.round(weather.dayLow)}°`
              : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 16,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flex1: {
    flex: 1,
  },
  temp: {
    fontSize: 18,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  condition: {
    fontSize: 13,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
  },
  subText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
    marginTop: 3,
  },
  unavailableText: {
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    lineHeight: 18,
  },
});
