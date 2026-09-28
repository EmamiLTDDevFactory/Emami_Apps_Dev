'use client';

// Port of the source Fiori app's legalSubEntity3 screen — see components/legal-entity/LegalEntityLevel.tsx.
import LegalEntityLevel, { LEGAL_SUB_ENTITY_3 } from '../../../../components/legal-entity/LegalEntityLevel';

export default function Page() {
  return <LegalEntityLevel config={LEGAL_SUB_ENTITY_3} />;
}
