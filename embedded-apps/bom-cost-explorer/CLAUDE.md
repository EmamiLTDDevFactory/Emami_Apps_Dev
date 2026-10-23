# AI layer rules (BOM Cost Explorer)

Adapted from the AI-layer prompt pack (03_claude_cli_prompt.md) to how this app is really built.

## What this app is
Static Next.js export (no API routes, no server). The browser calls the Azure SAP gateway directly
(ZMM_BOM_COST_SRV; NGD dev, NGQ QA = dev.emamiapps.in, NWP production = www.emamiapps.in). SAP does all costing maths.
The AI layer therefore runs in the browser too: Claude is called with `@anthropic-ai/sdk` (dangerouslyAllowBrowser)
using the key each user types on the AI settings screen. There is no server key, database or scheduler.

## Non-negotiable rules
1. Strictly additive: existing screens, queries, query keys, columns, exports, scenarios and tests do not change.
   Shared files only get an optional prop, a new export or a new button whose default equals today's behaviour.
2. New AI code lives in src/lib/ai/**, src/lib/snapshots/**, src/components/ai/**, evals/**.
3. Everything AI is behind NEXT_PUBLIC_AI_ENABLED (default false; the deployed DEV build turns it on in next.config.mjs).
   Off = no button, no request, no AI code in the existing bundles (next/dynamic).
4. The numbers rule: the model never calculates and never states a number that is not a fact from deterministic code or a
   tool result; every number carries [F#] and src/lib/ai/validate.ts checks it (one regeneration, then the template).
5. Read-only: no AI tool writes to SAP or sends a message. SAP costing runs from the assistant need the user's Run click.
6. Untrusted text (material, vendor names, SAP messages) is data in tool results, never in a system prompt.
7. decimal.js for money and quantities; reuse the existing SAP client and filter builders; never "+" in URLs.
8. Vendor names are masked (V1, V2 ...) before anything goes to the model (NEXT_PUBLIC_AI_MASK_VENDORS, default true).
9. Never log the API key or full SAP results (the local audit keeps questions, tools, tokens and validator results only).

## Workflow
- Run `npm test` before and after; the existing suite must pass unchanged. `npm run eval` runs evals/golden.json with a real key.
- Phase 3 (daily cost watch with a 06:00 digest) needs a server, a database and mail: not part of this static app yet.
