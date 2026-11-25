'use client';
import { Suspense } from 'react';
import QuotaItemDetail from '@/components/quota/QuotaItemDetail';
export default function Page() { return <Suspense fallback={null}><QuotaItemDetail /></Suspense>; }
