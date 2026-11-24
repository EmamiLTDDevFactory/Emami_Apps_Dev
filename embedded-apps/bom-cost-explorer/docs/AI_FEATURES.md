# AI features of the Costing Cockpit (Grok / xAI)

The model is **Grok (xAI)**; Claude is not used anywhere. **No AI feature can write to SAP**: the model only gets read-only tools and fact lists, and
`tests/unit/ai-readonly.test.ts` fails the build if AI code ever imports a SAP write function, uses a write HTTP method (other than the chat request to the AI
service), or exposes a tool with a write verb.

## Set-up
| What | How |
|---|---|
| Per-user key (default) | The person opens **AI settings** (gear next to any "Explain with AI" / "Ask" button), types the Grok API key (`xai-…`), tests it. The key stays in the browser (this tab, or the device if "remember") and goes only to `https://api.x.ai/v1`. |
| One shared key on the server (recommended) | On the hub backend set `XAI_API_KEY` (and optionally `XAI_BASE_URL`, `AI_MODELS_ALLOWED`, `AI_MAX_BODY_KB`, `AI_RATE_PER_MIN`); build the Cockpit with `NEXT_PUBLIC_AI_BASE_URL=<api>/me/cockpit-ai` and `NEXT_PUBLIC_AI_SERVER_KEY=true`. Nobody types a key; the route (`backend/cockpitAi.js`) needs a hub session and the Costing Cockpit grant, limits model, size and rate, and logs user, model, time and token counts (never the prompt). |
| Models | `NEXT_PUBLIC_AI_MODEL_MAIN` (default `grok-4`) and `NEXT_PUBLIC_AI_MODEL_FAST` (default `grok-3-mini`); editable on the AI settings screen. |
| Daily Cost watch digest | `XAI_API_KEY` on the backend (also `AI_MODEL_FAST`); without it the template text is sent. |
| Switch off | `NEXT_PUBLIC_AI_ENABLED=false` (no AI code is loaded). |

## How every written answer is kept honest
Deterministic code builds a list of **facts** (id, label, value, display, unit) from the figures on the screen; Grok writes only from them and must put the fact id
after every number. `lib/ai/validate.ts` checks every number against the facts; one regeneration with the errors, then a plain **template** from the facts
(marked "plain summary"). Without a key you always get the plain summary. Amounts in lakh are kept as rupees in the facts, so "90.0 lakh [F1]" is checked against 9,000,000.

## Features
| Feature | Where | What |
|---|---|---|
| Explain change | BOM costing | why the cost per piece moved (quantity, rate, freight, FX, source switch) |
| Ask the cockpit | BOM costing, Costing dashboard | questions in plain words; read-only tools for costing, freight, plans and the dashboard (`get_mis`, `get_sales_summary`, `get_margin_summary`); SAP costing runs ask for confirmation first |
| MIS review | MIS tab | budget vs actual COGM, brands that drive it, finished goods without a budget |
| Variance bridge review | MIS tab, below the table | rate / usage / overheads, what is not available |
| Sales, Margin, Freight review | Sales view, Margin, Freight analysis | headline, strongest and weakest groups, what is incomplete |
| Data-quality agent | BOM costing > Data quality | draft fix requests per owner (procurement, master data, finance) from the deterministic findings |
| Costing explainer | Cost breakup | what could make the breakup differ from CK13N (price period, rate sources, routings) |
| Rate outlook | Avg base price breakup (budget rates) | statistics on the monthly purchase history (trend, volatility, outlook with a range) and a written explanation; a suggestion only |
| Name mapping helper | Dashboard > AI insights | SAP brands without a management name get a suggested workbook name; the suggestion must be one of the closest names; copy as CSV, nothing is saved |
| Monthly review pack | Dashboard > AI insights | the latest review of each screen made in this tab, as one text to download |
| Smarter Cost watch | Monitoring > Cost watch | rule **R10**: today's cost per piece is a statistical outlier (z above 3) against its own last 30 days; digest written by Grok under the numbers rule |

Audit: every call is written to a local ring (200 entries) in the browser (user, feature, question, tokens, validator result, template used); the server proxy logs the same without prompts.
Vendor names are replaced by V1, V2 ... in what is sent (`NEXT_PUBLIC_AI_MASK_VENDORS`). Evals: `XAI_API_KEY=… npm run eval`.
