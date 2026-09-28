'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { riskCategory } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={riskCategory} />;
}
