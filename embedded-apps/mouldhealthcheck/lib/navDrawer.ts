import { useSyncExternalStore } from "react";

/**
 * Open/closed state of the phone-width navigation drawer. Shared through a tiny module store
 * because the menu button lives in the root layout's title bar (HubActionBar) while the drawer
 * itself is rendered by the (tabs) navigator's CustomTabs — two different subtrees.
 */
let open = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  open = next;
  listeners.forEach((l) => l());
}

export const openNavDrawer = () => setOpen(true);
export const closeNavDrawer = () => setOpen(false);

export function useNavDrawerOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false
  );
}
