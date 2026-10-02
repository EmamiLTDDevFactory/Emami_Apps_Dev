'use client';

import { WifiOff } from 'lucide-react';
import { useSession } from '../components/Shell';
import { AdminView, VendorView } from '../components/AuctionViews';
import { apiGet, apiPost, useLive } from '../lib/api';

/** One screen, two very different views: the role comes from Manage Access via the server (see
 * server/src/auth.js), and the server builds a different payload per role, so a vendor's browser
 * never receives other vendors' names or rates. */
export default function HomePage() {
  const { token, role } = useSession();
  const { view, connected } = useLive(token);

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      {!connected && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber/30 bg-amberBg px-3.5 py-2.5 text-sm font-semibold text-amber" role="status">
          <WifiOff size={15} />
          Reconnecting to the live auction…
        </div>
      )}
      {role === 'admin' ? (
        <AdminView
          view={view}
          act={(action, extra) => apiPost(token, '/control', { action, ...extra })}
          loadMaterials={(type) => apiGet(token, `/materials?type=${encodeURIComponent(type)}`)}
          loadRate={(code) => apiGet(token, `/materials?code=${encodeURIComponent(code)}`)}
          loadVendors={(term) => apiGet(token, `/vendors?term=${encodeURIComponent(term)}`)}
        />
      ) : (
        <VendorView view={view} bid={(amount) => apiPost(token, '/bid', { amount })} />
      )}
    </div>
  );
}
