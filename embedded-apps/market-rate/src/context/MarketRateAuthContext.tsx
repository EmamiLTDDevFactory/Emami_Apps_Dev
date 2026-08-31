import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchUserRole } from '../lib/marketRateApi';

export type MarketRateRole = 'Admin' | 'User';

interface MarketRateAuthValue {
  email: string | null;
  role: MarketRateRole;
  /** True until the ZMarketRoleSet lookup resolves. The nav bar/route guards wait on this instead
   * of momentarily rendering the 'User' default as if it were a confirmed role. */
  roleLoading: boolean;
}

const MarketRateAuthContext = createContext<MarketRateAuthValue>({
  email: null,
  role: 'User',
  roleLoading: true,
});

export function MarketRateAuthProvider({ children }: { children: React.ReactNode }) {
  const [email] = useState<string | null>(() => getHubEmail());
  const [role, setRole] = useState<MarketRateRole>('User');
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setRoleLoading(false);
      return;
    }
    fetchUserRole(email).then((r) => {
      setRole(r);
      setRoleLoading(false);
    });
  }, [email]);

  return (
    <MarketRateAuthContext.Provider value={{ email, role, roleLoading }}>
      {children}
    </MarketRateAuthContext.Provider>
  );
}

export function useMarketRateAuth(): MarketRateAuthValue {
  return useContext(MarketRateAuthContext);
}
