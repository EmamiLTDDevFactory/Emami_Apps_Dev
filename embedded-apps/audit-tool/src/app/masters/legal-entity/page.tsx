'use client';

// Port of the source Fiori app's legalEntity screen — see components/legal-entity/LegalEntityLevel.tsx.
import LegalEntityLevel, { LEGAL_ENTITY } from '../../../components/legal-entity/LegalEntityLevel';

export default function Page() {
  return <LegalEntityLevel config={LEGAL_ENTITY} />;
}
