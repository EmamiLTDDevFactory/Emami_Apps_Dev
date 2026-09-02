import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchIsPoFollowupAdmin } from '../lib/hubAccessApi';

interface PoFollowupAuthValue {
  email: string | null;
  isAdmin: boolean;
  /** True until the hub Manage Access lookup resolves — the Pending PO nav item/route guard wait
   * on this instead of momentarily treating a not-yet-loaded isAdmin=false as a confirmed answer. */
  roleLoading: boolean;
}

const PoFollowupAuthContext = createContext<PoFollowupAuthValue>({
  email: null,
  isAdmin: false,
  roleLoading: true,
});

export function PoFollowupAuthProvider({ children }: { children: React.ReactNode }) {
  const [email] = useState<string | null>(() => getHubEmail());
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setRoleLoading(false);
      return;
    }
    fetchIsPoFollowupAdmin(email).then((admin) => {
      setIsAdmin(admin);
      setRoleLoading(false);
    });
  }, [email]);

  return (
    <PoFollowupAuthContext.Provider value={{ email, isAdmin, roleLoading }}>
      {children}
    </PoFollowupAuthContext.Provider>
  );
}

export function usePoFollowupAuth(): PoFollowupAuthValue {
  return useContext(PoFollowupAuthContext);
}
