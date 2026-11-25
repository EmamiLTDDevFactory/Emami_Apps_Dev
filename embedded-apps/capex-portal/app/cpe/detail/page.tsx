'use client';
import { Suspense } from 'react';
import CpeDetail from '@/components/cpe/CpeDetail';
export default function Page() { return <Suspense fallback={null}><CpeDetail /></Suspense>; }
