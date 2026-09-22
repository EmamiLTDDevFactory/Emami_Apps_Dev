'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';

const STORAGE_KEY = '@emami_hub/favorites';
const DEFAULT_FAVORITES = ['expense', 'hr'];

interface FavoritesContextValue {
  favorites: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  loaded: boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set(DEFAULT_FAVORITES));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setFavorites(new Set(JSON.parse(raw)));
      } catch {
        // Corrupt/legacy value — keep the defaults.
      }
    }
    setLoaded(true);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite, loaded }),
    [favorites, isFavorite, toggleFavorite, loaded]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}
