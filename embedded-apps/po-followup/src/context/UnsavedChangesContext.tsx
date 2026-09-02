import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface UnsavedChangesValue {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  /** Shows a confirm dialog if there are unsaved changes; returns true if it's safe to navigate
   * away (either there was nothing unsaved, or the user confirmed leaving anyway). Used by the
   * layout's "Back to Emami Apps" button and side-pane navigation, since those are in-app route
   * changes that a browser's native beforeunload prompt (registered separately, web-only, for
   * tab-close/refresh/typed-URL navigation) never sees. */
  confirmLeave: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesValue>({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  confirmLeave: () => true,
});

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const confirmLeave = () => {
    if (!hasUnsavedChanges) return true;
    if (typeof window === 'undefined' || !window.confirm) return true;
    return window.confirm('You have unconfirmed delivery updates that have not been submitted. Leave this page and lose them?');
  };

  return (
    <UnsavedChangesContext.Provider value={{ hasUnsavedChanges, setHasUnsavedChanges, confirmLeave }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesValue {
  return useContext(UnsavedChangesContext);
}
