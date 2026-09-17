'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudSnow, CloudFog, CloudLightning, MapPin } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';
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
 * wherever the signed-in user's device currently is (see weatherApi.ts: browser geolocation +
 * Open-Meteo). Silently renders nothing if location permission is denied or the lookup fails —
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        borderRadius: radii.pill,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.white,
      }}
    >
      <Icon size={13} color={colors.rust} />
      <span style={{ fontSize: 11.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>
        {Math.round(weather.temperature)}°C
      </span>
      <span style={{ width: 1, height: 10, backgroundColor: colors.border, margin: '0 1px' }} />
      <MapPin size={9} color={colors.inkSoft} />
      <span
        style={{
          fontSize: 10.5,
          fontFamily: fonts.sansMedium,
          fontWeight: fontWeights.sansMedium,
          color: colors.inkSoft,
          maxWidth: 110,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {weather.place}
      </span>
    </div>
  );
}
