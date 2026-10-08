import { z } from "zod";

export const agentOutputSchema = z
  .object({
    schema_version: z.literal("1.0"),
    workflow_id: z.string().min(1),
    stage: z.literal("prep"),
    agent_id: z.string().min(1),
    status: z.enum(["pending", "completed", "error"]),
    verdict: z.enum(["PASS", "FAIL", "UNCERTAIN"]),
    confidence: z.null(),
    timestamp: z.string().min(1),
    model: z.object({
      name: z.string(),
      version: z.string(),
      provider: z.string().nullable(),
      prompt_version: z.string(),
      calls: z.number().int().nonnegative(),
      cost_usd: z.null(),
    }),
    error: z
      .object({
        code: z.string(),
        message: z.string().min(1),
        retryable: z.boolean(),
      })
      .nullable(),
    next_step_recommendation: z.object({
      action: z.string().min(1),
      reason: z.string().min(1),
    }),
    evidence: z
      .object({
        schema_version: z.literal("1.0"),
        record_id: z.string().min(4),
        stage: z.literal("prep"),
        status: z.enum(["pending", "completed", "error"]),
        content_hash: z.string().regex(/^[a-f0-9]{64}$/),
        decision: z.object({
          verdict: z.enum(["PASS", "FAIL", "UNCERTAIN"]),
          outcome: z.string().min(1),
          reason: z.string().min(1),
          needs_human: z.boolean(),
          confidence: z.null(),
        }),
        checks: z.array(z.object({ check_key: z.string() }).passthrough()),
      })
      .passthrough(),
  })
  .passthrough();

export type AgentOutput = z.infer<typeof agentOutputSchema>;

export function assertPendingEnvelope(body: unknown): AgentOutput {
  const parsed = agentOutputSchema.parse(body);
  if (parsed.status !== "pending" || parsed.verdict !== "UNCERTAIN") {
    throw new Error(`expected pending/UNCERTAIN, got ${parsed.status}/${parsed.verdict}`);
  }
  if (parsed.evidence.decision.outcome !== "review_required") {
    throw new Error(`expected review_required, got ${parsed.evidence.decision.outcome}`);
  }
  if (!parsed.error?.message) throw new Error("pending envelope is missing a human-readable error");
  return parsed;
}
