import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchIsPaymentTrackingAdmin } from '../lib/hubAccessApi';

interface PaymentTrackingAuthValue {
  email: string | null;
  isAdmin: boolean;
  /** True until the hub Manage Access lookup resolves — the Pending PO nav item/route guard wait
   * on this instead of momentarily treating a not-yet-loaded isAdmin=false as a confirmed answer. */
  roleLoading: boolean;
}

const PaymentTrackingAuthContext = createContext<PaymentTrackingAuthValue>({
  email: null,
  isAdmin: false,
  roleLoading: true,
});

export function PaymentTrackingAuthProvider({ children }: { children: React.ReactNode }) {
  const [email] = useState<string | null>(() => getHubEmail());
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setRoleLoading(false);
      return;
    }
    fetchIsPaymentTrackingAdmin(email).then((admin) => {
      setIsAdmin(admin);
      setRoleLoading(false);
    });
  }, [email]);

  return (
    <PaymentTrackingAuthContext.Provider value={{ email, isAdmin, roleLoading }}>
      {children}
    </PaymentTrackingAuthContext.Provider>
  );
}

export function usePaymentTrackingAuth(): PaymentTrackingAuthValue {
  return useContext(PaymentTrackingAuthContext);
}
