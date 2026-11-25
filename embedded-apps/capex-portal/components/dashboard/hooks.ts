'use client';
import { useList } from '@/lib/useData';
import type { DashCategory, DashTrend } from '@/lib/entities';

/** DashCategorySet: approved/committed/spent per category and fiscal year (the by-category card + Reports table). */
export const useDashCategories = () => useList<DashCategory>('DashCategorySet');
/** DashTrendSet: committed vs spent per month and fiscal year. */
export const useDashTrend = () => useList<DashTrend>('DashTrendSet', { $orderby: 'Period asc' });
