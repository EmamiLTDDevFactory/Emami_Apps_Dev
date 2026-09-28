'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { cityMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={cityMaster} />;
}
