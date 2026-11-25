'use client';
import { Suspense } from 'react';
import PODetail from '@/components/procure/PODetail';
export default function Page() { return <Suspense fallback={null}><PODetail /></Suspense>; }
