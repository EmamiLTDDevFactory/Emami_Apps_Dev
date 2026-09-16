'use client';

import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface BannerState {
  type: 'success' | 'error';
  message: string;
}

export default function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold ${
        banner.type === 'error' ? 'border-red/30 bg-redBg text-red' : 'border-green/30 bg-greenBg text-green'
      }`}
    >
      {banner.type === 'error' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
      <span className="flex-1">{banner.message}</span>
      <button onClick={onClose} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
