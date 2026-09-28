'use client';

import SimpleMaster from '../../../components/masters/SimpleMaster';
import { stateMaster } from '../../../components/masters/configs';

export default function Page() {
  return <SimpleMaster config={stateMaster} />;
}
