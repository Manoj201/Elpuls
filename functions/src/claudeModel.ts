import type Anthropic from '@anthropic-ai/sdk';
import * as logger from 'firebase-functions/logger';

/**
 * The one Claude model every function uses (bill and appliance scans,
 * explainer, Din plan text, outlook text). Claude Haiku 5.5 since 2026-11-24
 * (was claude-haiku-4-5-20251001): ~10x cheaper per token, same request shape.
 *
 * Notes for this model: forced `tool_choice` is accepted and then skips
 * thinking (so replies are the tool call only, like before); never send
 * temperature/top_p/top_k or an assistant prefill (400); the same text is
 * ~30 % more tokens than on Haiku 4.5, so max_tokens values were raised; a
 * request can come back with stop_reason "refusal" (no server-side fallback).
 */
export const CLAUDE_MODEL = 'claude-haiku-5-5';

/** Log why a reply has no usable tool call (cut off or declined), so it shows up in the logs. */
export function logStopReason(message: Anthropic.Message, what: string): void {
  if (message.stop_reason === 'max_tokens') {
    logger.error(`${what}: reply cut off at max_tokens (${message.usage.output_tokens} output tokens).`);
  } else if (message.stop_reason === 'refusal') {
    logger.error(`${what}: model declined (refusal).`);
  }
}
