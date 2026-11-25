'use client';
import { Suspense } from 'react';
import CpeCreate from '@/components/cpe/CpeCreate';
export default function Page() { return <Suspense fallback={null}><CpeCreate /></Suspense>; }
