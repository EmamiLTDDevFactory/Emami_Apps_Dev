'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { legalEntityTypeMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={legalEntityTypeMaster} />;
}
