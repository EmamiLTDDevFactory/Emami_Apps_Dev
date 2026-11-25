'use client';
import { Suspense } from 'react';
import Evaluation from '@/components/cpe/Evaluation';
export default function Page() { return <Suspense fallback={null}><Evaluation /></Suspense>; }
