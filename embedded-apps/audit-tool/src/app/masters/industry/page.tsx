'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { industryMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={industryMaster} />;
}
