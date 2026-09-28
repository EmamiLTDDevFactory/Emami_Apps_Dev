'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { subEntityTypeMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={subEntityTypeMaster} />;
}
