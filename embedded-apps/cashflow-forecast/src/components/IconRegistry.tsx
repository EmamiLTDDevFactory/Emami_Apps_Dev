'use client';

import {
  Activity,
  Banknote,
  CalendarClock,
  Gauge,
  Globe,
  HandCoins,
  Landmark,
  OctagonAlert,
  Percent,
  ReceiptText,
  Scale,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { IconKey } from '../types';

/** Semantic icon registry – KPI payloads stay serializable over OData. */
export const ICONS: Record<IconKey, LucideIcon> = {
  wallet: Wallet,
  trendUp: TrendingUp,
  octagonAlert: OctagonAlert,
  handCoins: HandCoins,
  receiptText: ReceiptText,
  userX: UserX,
  calendarClock: CalendarClock,
  gauge: Gauge,
  timer: Timer,
  activity: Activity,
  banknote: Banknote,
  globe: Globe,
  scale: Scale,
  landmark: Landmark,
  shieldCheck: ShieldCheck,
  percent: Percent,
};
