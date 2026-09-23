import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchPaymentTrackingRole, type PaymentTrackingRole } from '../lib/hubAccessApi';

interface PaymentTrackingAuthValue {
  email: string | null;
  role: PaymentTrackingRole;
  /** True until the hub Manage Access lookup resolves — nav/route guards wait on this instead of
   * momentarily treating a not-yet-loaded role='User' default as a confirmed answer. */
  roleLoading: boolean;
}

const PaymentTrackingAuthContext = createContext<PaymentTrackingAuthValue>({
  email: null,
  role: 'User',
  roleLoading: true,
});

export function PaymentTrackingAuthProvider({ children }: { children: React.ReactNode }) {
  const [email] = useState<string | null>(() => getHubEmail());
  const [role, setRole] = useState<PaymentTrackingRole>('User');
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setRoleLoading(false);
      return;
    }
    fetchPaymentTrackingRole(email).then((r) => {
      setRole(r);
      setRoleLoading(false);
    });
  }, [email]);

  return (
    <PaymentTrackingAuthContext.Provider value={{ email, role, roleLoading }}>
      {children}
    </PaymentTrackingAuthContext.Provider>
  );
}

export function usePaymentTrackingAuth(): PaymentTrackingAuthValue {
  return useContext(PaymentTrackingAuthContext);
}
