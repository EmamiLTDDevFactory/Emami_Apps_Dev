'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { observationCategory } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={observationCategory} />;
}
