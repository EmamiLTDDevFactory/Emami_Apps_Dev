import { DOMAINS } from '@/lib/tcodes';
import DomainPage from './DomainPage';

// Static export: one page per master data object known at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return DOMAINS.filter((d) => d.id !== 'material').map((d) => ({ domain: d.id }));
}

export default function Page() {
  return <DomainPage />;
}
