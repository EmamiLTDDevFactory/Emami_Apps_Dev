// What the Emami Apps assistant can do. Every tool runs in the browser through the hub's own APIs with the signed-in
// person's session, so the access backend still decides what they may change (admin tools are only offered to
// Super Admins / Admins, and the server re-checks). Tools that change something ask the person to confirm first.
import type Anthropic from '@anthropic-ai/sdk';
import type { AppItem, AppRole, AppStage, MyAccess } from '../../types';
import { APPS } from '../../data/mockData';
import { STAGES, isAppStage, stageDef } from '../../data/appStages';
import { listAuthorizedUsers, setAppAccess } from '../accessApi';
import { getAdminOverview } from '../adminApi';
import { setAppStage, type StoredStage } from '../appStagesApi';
import { logEvent } from '../authApi';
import { AUDIT_CAPA_APP_ID, roleOptionsFor } from '../../components/admin/adminShared';

type Tool = Anthropic.Beta.BetaTool;

/** Live state the tools read and act on, supplied by the assistant panel (always the current values). */
export interface AssistantContext {
  userEmail: string;
  access: MyAccess | null;
  isAdmin: boolean;
  stageOf: (appId: string) => AppStage | undefined;
  applySaved: (appId: string, saved: StoredStage) => void;
  isFavorite: (appId: string) => boolean;
  toggleFavorite: (appId: string) => void;
  navigate: (path: string) => void;
  /** Shows a confirm card (and accepts a spoken yes/no); resolves true when the person agrees. */
  confirm: (summary: string) => Promise<boolean>;
}

const PAGES: Record<string, string> = {
  home: '/',
  my_applications: '/my-applications',
  favorites: '/favorites',
  recent: '/recent',
  help: '/help',
  profile: '/settings',
  admin_center: '/manage-access',
};
const ADMIN_TABS = ['overview', 'people', 'apps', 'status', 'activity', 'settings'];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const appById = (id: string) => APPS.find((a) => a.id === id);
const appBrief = (a: AppItem, ctx: AssistantContext) => {
  const grant = ctx.access?.apps.find((g) => g.appId === a.id);
  return {
    id: a.id,
    name: a.name,
    category: a.cat,
    status: ctx.stageOf(a.id) ?? null,
    canOpen: !!grant,
    yourRole: grant?.role ?? null,
    favorite: ctx.isFavorite(a.id),
  };
};

const appIdSchema = { type: 'string', enum: APPS.map((a) => a.id), description: 'App id from find_apps / list_my_apps.' } as const;

const COMMON_TOOLS: Tool[] = [
  {
    name: 'list_my_apps',
    description: 'Lists the Emami Apps the signed-in person can open, with category, release status and their role.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'find_apps',
    description:
      'Searches every app in Emami Apps (open or locked) by words in its name, category or description. Use it to turn what the person said (in any language or a nickname such as "expense", "gate pass", "timesheet") into an app id. Empty query returns all apps.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'English keywords, e.g. "expense", "gate", "audit". Translate Bengali/Hindi words to English first.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_app',
    description: 'Opens an app the person has access to (same as clicking its tile). Fails for a locked app.',
    input_schema: { type: 'object', properties: { app_id: appIdSchema }, required: ['app_id'], additionalProperties: false },
  },
  {
    name: 'go_to_page',
    description: 'Moves the hub to one of its pages. admin_center (with an optional tab) is for Super Admins / Admins only.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(PAGES) },
        admin_tab: { type: 'string', enum: ADMIN_TABS, description: 'Only with page=admin_center.' },
      },
      required: ['page'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_favorite',
    description: 'Adds an app to, or removes it from, the person\'s favourites.',
    input_schema: {
      type: 'object',
      properties: { app_id: appIdSchema, favorite: { type: 'boolean' } },
      required: ['app_id', 'favorite'],
      additionalProperties: false,
    },
  },
  {
    name: 'app_status_summary',
    description: `Release status of every app (${STAGES.map((s) => `${s.stage} = ${s.name}`).join(', ')}): counts per status and which apps are in each.`,
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const ADMIN_TOOLS: Tool[] = [
  {
    name: 'set_app_status',
    description: 'Admin only. Changes an app\'s release status, shown on its tile for everyone. The person is asked to confirm.',
    input_schema: {
      type: 'object',
      properties: { app_id: appIdSchema, status: { type: 'string', enum: STAGES.map((s) => s.stage) } },
      required: ['app_id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_people',
    description: 'Admin only. Finds people who can sign in to Emami Apps by part of their email or name, with their level, active state and app access.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Part of an email or name, e.g. "rahul" or "sen@emamigroup".' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'grant_app_access',
    description:
      'Admin only. Gives a person access to an app with a role (most apps: User or Admin). The person must already be able to sign in (use find_people for the exact email). Asks to confirm.',
    input_schema: {
      type: 'object',
      properties: { email: { type: 'string' }, app_id: appIdSchema, role: { type: 'string', enum: ['User', 'Admin', 'Finance'] } },
      required: ['email', 'app_id', 'role'],
      additionalProperties: false,
    },
  },
  {
    name: 'revoke_app_access',
    description: 'Admin only. Removes a person\'s access to an app. Asks to confirm.',
    input_schema: {
      type: 'object',
      properties: { email: { type: 'string' }, app_id: appIdSchema },
      required: ['email', 'app_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'usage_overview',
    description: 'Admin only. Org-wide numbers: people with access, active in the last 7/30 days, never signed in, sign-ins, app opens, most used app.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const toolsFor = (isAdmin: boolean): Tool[] => (isAdmin ? [...COMMON_TOOLS, ...ADMIN_TOOLS] : COMMON_TOOLS);

/** Runs one tool. Returns the JSON text for the tool_result, and whether it failed. */
export async function runTool(name: string, input: Record<string, unknown>, ctx: AssistantContext): Promise<{ content: string; isError?: boolean }> {
  const ok = (v: unknown) => ({ content: JSON.stringify(v) });
  const fail = (message: string) => ({ content: JSON.stringify({ error: message }), isError: true });
  const adminOnly = ['set_app_status', 'find_people', 'grant_app_access', 'revoke_app_access', 'usage_overview'];
  if (adminOnly.includes(name) && !ctx.isAdmin) return fail('Only Super Admins and Admins can do this.');

  switch (name) {
    case 'list_my_apps':
      return ok(APPS.filter((a) => ctx.access?.apps.some((g) => g.appId === a.id)).map((a) => appBrief(a, ctx)));

    case 'find_apps': {
      const words = str(input.query).toLowerCase().split(/\s+/).filter(Boolean);
      const hits = APPS.filter((a) => {
        const hay = `${a.id} ${a.name} ${a.cat} ${a.desc}`.toLowerCase();
        return !words.length || words.some((w) => hay.includes(w));
      });
      return ok(hits.map((a) => appBrief(a, ctx)));
    }

    case 'open_app': {
      const app = appById(str(input.app_id));
      if (!app) return fail('Unknown app.');
      if (!ctx.access?.apps.some((g) => g.appId === app.id)) {
        return fail(`${app.name} is locked for this person. An Admin can grant it in the Admin Center (or the person can ask from Help & Support).`);
      }
      if (ctx.userEmail) logEvent(ctx.userEmail, 'APP_OPEN', app.id);
      // Leave a moment for the spoken reply to start before the page changes.
      window.setTimeout(() => (app.url ? window.location.assign(app.url) : ctx.navigate(`/apps/${app.id}`)), 1200);
      return ok({ opened: app.name });
    }

    case 'go_to_page': {
      const page = str(input.page);
      if (!PAGES[page]) return fail('Unknown page.');
      if (page === 'admin_center' && !ctx.isAdmin) return fail('The Admin Center is only for Super Admins and Admins.');
      const tab = str(input.admin_tab);
      ctx.navigate(page === 'admin_center' && ADMIN_TABS.includes(tab) ? `${PAGES[page]}?tab=${tab}` : PAGES[page]);
      return ok({ page, tab: tab || undefined });
    }

    case 'set_favorite': {
      const app = appById(str(input.app_id));
      if (!app) return fail('Unknown app.');
      const want = input.favorite === true;
      if (ctx.isFavorite(app.id) !== want) ctx.toggleFavorite(app.id);
      return ok({ app: app.name, favorite: want });
    }

    case 'app_status_summary': {
      const byStage: Record<string, string[]> = {};
      APPS.forEach((a) => {
        const s = ctx.stageOf(a.id) ?? 'No status';
        (byStage[s] ??= []).push(a.name);
      });
      return ok(Object.entries(byStage).map(([status, apps]) => ({ status, meaning: isAppStage(status) ? stageDef(status).name : 'not set', count: apps.length, apps })));
    }

    case 'set_app_status': {
      const app = appById(str(input.app_id));
      const status = str(input.status);
      if (!app || !isAppStage(status)) return fail('Unknown app or status.');
      if (ctx.stageOf(app.id) === status) return ok({ app: app.name, status, unchanged: true });
      if (!(await ctx.confirm(`Change ${app.name} to ${stageDef(status).name} (${status})?`))) return ok({ declined: true });
      const r = await setAppStage(app.id, status);
      if (!r.ok || !r.saved) return fail(r.error || 'Could not change the status.');
      ctx.applySaved(app.id, r.saved);
      return ok({ app: app.name, status });
    }

    case 'find_people': {
      const q = str(input.query).toLowerCase();
      const r = await listAuthorizedUsers();
      if (!r.ok) return fail(r.error || 'Could not load people.');
      const hits = (r.users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q) || u.email.toLowerCase().replace(/[._-]/g, ' ').includes(q)).slice(0, 15);
      return ok({
        matches: hits.map((u) => ({ email: u.email, level: u.accessLevel, active: u.isActive, apps: u.apps.map((g) => `${appById(g.appId)?.name ?? g.appId} (${g.role})`) })),
        more: Math.max(0, (r.users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q)).length - hits.length),
      });
    }

    case 'grant_app_access': {
      const email = str(input.email).toLowerCase();
      const app = appById(str(input.app_id));
      const role = str(input.role) as AppRole;
      if (!app) return fail('Unknown app.');
      if (app.id === AUDIT_CAPA_APP_ID) return fail('Audit & CAPA needs a CQA/Depot/View role and a depot - do it in the Admin Center.');
      if (!roleOptionsFor(app.id).includes(role)) return fail(`${app.name} takes these roles: ${roleOptionsFor(app.id).join(', ')}.`);
      if (!(await ctx.confirm(`Give ${email} access to ${app.name} as ${role}?`))) return ok({ declined: true });
      const r = await setAppAccess(email, app.id, role, null, ctx.userEmail);
      return r.ok ? ok({ granted: { email, app: app.name, role } }) : fail(r.error || 'Could not grant access.');
    }

    case 'revoke_app_access': {
      const email = str(input.email).toLowerCase();
      const app = appById(str(input.app_id));
      if (!app) return fail('Unknown app.');
      if (!(await ctx.confirm(`Remove ${email}'s access to ${app.name}?`))) return ok({ declined: true });
      const r = await setAppAccess(email, app.id, null, null, ctx.userEmail);
      return r.ok ? ok({ revoked: { email, app: app.name } }) : fail(r.error || 'Could not remove access.');
    }

    case 'usage_overview': {
      const r = await getAdminOverview();
      if (!r.ok || !r.overview) return fail(r.error || 'Could not load the overview.');
      const o = r.overview;
      return ok({ ...o, mostUsedApp: o.mostUsedApp ? { app: appById(o.mostUsedApp.appId)?.name ?? o.mostUsedApp.appId, opens: o.mostUsedApp.opens } : null });
    }

    default:
      return fail(`Unknown tool ${name}.`);
  }
}
