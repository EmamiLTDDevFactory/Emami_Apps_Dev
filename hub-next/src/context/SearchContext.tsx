'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

interface SearchContextValue {
  searchValue: string;
  setSearchValue: (v: string) => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

/**
 * The search box lives in the shell layout's Header (shared chrome above every page), but what it
 * filters — the app grid — is owned by whichever page is currently rendered (Home, My
 * Applications, Favorites). This context is what lets Header write into the query and a page's
 * useFilteredApps read it back, without Next.js's layout/page split requiring prop-drilling
 * through `children`.
 */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchValue, setSearchValue] = useState('');
  const value = useMemo(() => ({ searchValue, setSearchValue }), [searchValue]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within a SearchProvider');
  return ctx;
}
