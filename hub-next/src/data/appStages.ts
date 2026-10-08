import type { AppStage } from '../types';

/** Every release status an app tile can carry, in lifecycle order. The colour is used by the tile badge
 * (StageBadge) and by the Admin Center's App status tab. Same codes as backend/appStages.js. */
export interface StageDef {
  stage: AppStage;
  /** Long name, shown in the Admin Center picker and as the badge's tooltip. */
  name: string;
  color: string;
}

export const STAGES: StageDef[] = [
  { stage: 'WIP', name: 'Work In Progress', color: '#475569' },
  { stage: 'IAT', name: 'Integration Acceptance Testing', color: '#1D4ED8' },
  { stage: 'UAT', name: 'User Acceptance Testing', color: '#B45309' },
  { stage: 'Controlled Live', name: 'Controlled Live', color: '#7C3AED' },
  { stage: 'Partial Live', name: 'Partial Live', color: '#0F766E' },
  { stage: 'Live', name: 'Live', color: '#1F7A4D' },
  { stage: 'UIP', name: 'Update In Progress', color: '#BE185D' },
];

const BY_STAGE = new Map(STAGES.map((s) => [s.stage, s]));

export const stageDef = (stage: AppStage): StageDef => BY_STAGE.get(stage) ?? STAGES[0];
export const isAppStage = (v: unknown): v is AppStage => typeof v === 'string' && BY_STAGE.has(v as AppStage);
