'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchPaymentTrackingAccess, type PaymentTrackingRole } from '../lib/hubAccessApi';

interface PaymentTrackingAuthValue {
  email: string | null;
  role: PaymentTrackingRole;
  /** Screens Manage Access limits this person to; null = every screen of the role. */
  tiles: string[] | null;
  /** True until the hub Manage Access lookup resolves — nav/route guards wait on this instead of
   * momentarily treating a not-yet-loaded role='User' default as a confirmed answer. */
  roleLoading: boolean;
}

const PaymentTrackingAuthContext = createContext<PaymentTrackingAuthValue>({
  email: null,
  role: 'User',
  tiles: null,
  roleLoading: true,
});

export function PaymentTrackingAuthProvider({ children }: { children: React.ReactNode }) {
  const [email] = useState<string | null>(() => getHubEmail());
  const [role, setRole] = useState<PaymentTrackingRole>('User');
  const [tiles, setTiles] = useState<string[] | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setRoleLoading(false);
      return;
    }
    fetchPaymentTrackingAccess(email).then((r) => {
      setRole(r.role);
      setTiles(r.tiles);
      setRoleLoading(false);
    });
  }, [email]);

  return (
    <PaymentTrackingAuthContext.Provider value={{ email, role, tiles, roleLoading }}>
      {children}
    </PaymentTrackingAuthContext.Provider>
  );
}

export function usePaymentTrackingAuth(): PaymentTrackingAuthValue {
  return useContext(PaymentTrackingAuthContext);
}
