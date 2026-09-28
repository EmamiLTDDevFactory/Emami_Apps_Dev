'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { departmentMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={departmentMaster} />;
}
