'use client';

import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { AppStagesProvider } from '../context/AppStagesContext';
import PwaRuntime from './PwaRuntime';

function Gate({ children }: { children: React.ReactNode }) {
  // Mirrors the pre-conversion App.tsx's `ready` gate (fontsLoaded && authChecked) — holds the
  // very first paint until the persisted-session check has resolved, so the app never flashes the
  // login screen (or Home, for someone not actually logged in) before that's known for sure.
  const { ready } = useAuth();
  if (!ready) return null;
  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <AppStagesProvider>
          <PwaRuntime />
          <Gate>{children}</Gate>
        </AppStagesProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
