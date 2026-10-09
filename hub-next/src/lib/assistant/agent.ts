// The Emami Apps assistant's agent loop: Claude (called straight from the browser with the key the person typed in,
// kept only in this tab) decides which tool to run; tools.ts runs it here with the person's own hub session.
import Anthropic from '@anthropic-ai/sdk';
import { toolsFor, runTool, type AssistantContext } from './tools';

export const ASSISTANT_MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;

export type Turn = Anthropic.Beta.BetaMessageParam;

const SYSTEM = `You are the voice assistant inside Emami Apps, Emami Limited's internal app hub (emamiapps.in). People talk to you in Bengali, Hindi, English or a mix (Banglish/Hinglish), usually by voice through speech recognition, so the text may have recognition mistakes - read it for meaning.

Language: always reply in the language the person used in their latest message - Bengali in Bengali script, Hindi in Devanagari, English in English. For a mix, reply in the language most of their words were in. App names stay in English.

Your replies are read aloud: one or two short sentences, plain text, no markdown, lists, emojis or URLs. Say what you did or found; do not narrate tool calls.

Use the tools to act - opening apps, moving between pages, favourites, release status, and (for admins) people and app access. Find app ids with find_apps or list_my_apps rather than guessing. Tools that change something ask the person to confirm on screen; if a tool result says declined, accept it and say nothing was changed. Never say something was done unless a tool result confirms it. If a tool fails, say briefly why and what they can do instead. If a request is outside Emami Apps, say you can only help with Emami Apps.`;

export interface AgentEvents {
  /** A tool is about to run (for a short status line in the panel). */
  onTool?: (name: string) => void;
}

export function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** Runs one user turn to completion. `history` is mutated (append-only) and returned text is the spoken reply. */
export async function runTurn(client: Anthropic, history: Turn[], ctx: AssistantContext, events: AgentEvents = {}): Promise<string> {
  const who = `Signed-in person: ${ctx.userEmail} (${ctx.access?.accessLevel ?? 'Viewer'}${ctx.isAdmin ? ', can use admin tools' : ''}). Today: ${new Date().toDateString()}.`;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: who },
      ],
      tools: toolsFor(ctx.isAdmin),
      messages: history,
    });

    if (response.stop_reason === 'refusal') {
      history.push({ role: 'assistant', content: [{ type: 'text', text: '(declined)' }] });
      return 'Sorry, I can\'t help with that.';
    }

    history.push({ role: 'assistant', content: response.content });
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    if (response.stop_reason === 'pause_turn') continue;
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !uses.length) return text;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      events.onTool?.(use.name);
      let r: { content: string; isError?: boolean };
      try {
        r = await runTool(use.name, (use.input ?? {}) as Record<string, unknown>, ctx);
      } catch (e) {
        r = { content: JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed' }), isError: true };
      }
      results.push({ type: 'tool_result', tool_use_id: use.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    history.push({ role: 'user', content: results });
  }
  return 'That took too many steps - please try a simpler request.';
}

/** Friendly text for an API failure (bad key, rate limit, network). */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The Claude API key was not accepted. Check it and try again.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This Claude API key is not allowed to use the model.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude is busy (rate limit). Wait a moment and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check the network and try again.';
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}).`;
  return e instanceof Error ? e.message : 'Something went wrong.';
}
