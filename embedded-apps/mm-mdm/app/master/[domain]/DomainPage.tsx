'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DOMAINS } from '@/lib/tcodes';

export default function DomainPage() {
  const params = useParams<{ domain: string }>();
  const domain = DOMAINS.find((d) => d.id === params?.domain);

  if (!domain) {
    return (
      <div className="page">
        <div className="card placeholder">
          <h1>Unknown master data object</h1>
          <p className="muted">Check the address or choose an object from the menu.</p>
          <Link href="/" className="btn">Go to overview</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="tcode-chip">{domain.tcode}</span>
          <h1>{domain.label}</h1>
          <p className="muted">{domain.description}</p>
        </div>
      </header>
      <div className="card placeholder">
        <h2>This workflow isn’t built yet</h2>
        <p className="muted">
          {domain.label} will follow the same create, change and deletion flow as Material Master. Use ZMDM_M in the meantime.
        </p>
        <Link href="/master/material" className="btn btn-primary">Open Material Master</Link>
      </div>
    </div>
  );
}
