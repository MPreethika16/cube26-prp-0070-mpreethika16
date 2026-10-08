# Prep Round 3

Prep is called over HTTP. The Next.js pages are not required. One Claude observation is followed by the existing TypeScript rules, which choose READY, STOP_AND_FIX, or REVIEW_REQUIRED.

## Endpoint

`POST /run` and `POST /api/run` accept the same Agent Input and return an Agent Output. `GET /health` and `GET /api/health` always return HTTP 200.

Live observation requires `ANTHROPIC_API_KEY`. `PREP_VISION_PROVIDER=gemini` is ignored on this path. Round 3 does not read a Gemini key.

Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`), `PREP_CLAUDE_TIMEOUT_MS` (default 45000), `PREP_MAX_IMAGE_BYTES` (default 8388608), `PREP_EVIDENCE_DIR`.

## Agent Input

```json
{
  "schema_version": "1.0",
  "request_id": "req-product-13",
  "workflow_id": "WF-org_demo_alpha-PRODUCT-13",
  "stage": "prep",
  "subject": { "org_id": "org_demo_alpha", "subject_id": "PRODUCT-13" },
  "inputs": [
    { "ref": "front.jpeg", "media_type": "image/jpeg", "data_base64": "<jpeg>" },
    { "ref": "back.jpeg", "media_type": "image/jpeg", "data_base64": "<jpeg>" },
    { "ref": "label.jpeg", "media_type": "image/jpeg", "data_base64": "<jpeg>" }
  ],
  "context": {
    "work_order": {
      "workOrderId": "WO-PRODUCT-13",
      "unitId": "PRODUCT-13",
      "sku": "SKU-GABANY",
      "asin": "UNKNOWN",
      "expectedFnsku": "NONE",
      "requirements": {
        "polybag": "UNKNOWN",
        "suffocationWarning": "UNKNOWN",
        "expiryDate": "UNKNOWN",
        "handlingMarks": { "state": "UNKNOWN", "requiredMarks": [] }
      }
    }
  }
}
```

Photos may be `data_base64`, an `http`/`https` `url`, or a `ref` that is an absolute path or a path under this repo. Front, back, and label are all required before Claude is called. Demo orgs are `org_demo_alpha` and `org_demo_bravo`.

## Agent Output

The body is always an Agent Output envelope (`schema_version` 1.0, `stage` prep, evidence `content_hash`). `content_hash` covers the decision and checks and ignores `produced_at`, `captured_at`, and `latency_ms`, so an identical decision hashes the same.

A completed inspection uses `status: completed` and a verdict of PASS or FAIL. Anything that cannot be decided uses:

- HTTP 200, except an unknown org, which is HTTP 404
- `status: pending`
- `verdict: UNCERTAIN`
- `evidence.decision.outcome: review_required`
- `error.message` in plain language

The same `request_id`, `org_id`, and `subject_id` return the stored envelope and do not call Claude again.

## Failure modes

| Case | HTTP | Envelope |
|---|---|---|
| Malformed JSON | 200 | pending, body was not valid JSON |
| Missing request, workflow, org, or subject id | 200 | pending, those fields are required |
| `stage` other than prep | 200 | pending, stage must be prep |
| Org other than the two demo orgs | 404 | pending, unknown tenant |
| Unknown work order | 200 | pending, no work order could be resolved |
| Zero photos, or any count other than three | 200 | pending, observation was not run |
| Photo over the byte limit | 200 | pending, names the limit |
| Non-image bytes | 200 | pending, not a JPEG, PNG, GIF, or WebP |
| Photo URL that fails | 200 | pending, the URL error |
| `ANTHROPIC_API_KEY` missing | 200 | pending, key is not set |
| Claude timeout (45s, AbortController) | 200 | pending, timed out |
| Claude non-JSON or a tool call that fails the observation schema | 200 | pending, names the parse failure |
| Postgres down or the evidence table missing | 200 | the inspection still returns; the record is written under `data/round3-evidence` |
| Evidence directory missing | 200 | the directory is created |

`PREP_E2E_FAULTS=1` lets a harness set `context.round3_fault` to `claude_timeout`, `claude_non_json`, or `claude_zod`. Leave it unset in the orchestrator. Those faults are not a substitute for the 45s timeout in `claude-observer.ts`.

## Health

```json
{
  "ok": true,
  "degraded": false,
  "stage": "prep",
  "agent_id": "prep-manager@1.0.0",
  "version": "0.1.0",
  "provider": "claude",
  "model": "claude-sonnet-4-5",
  "anthropic_key_present": true,
  "db_reachable": false,
  "evidence_dir_writable": true
}
```

`degraded` is true when the key is missing, Postgres is unreachable, or the evidence directory is not writable. `ok` stays true and the status stays 200 so the orchestrator can register the agent. `anthropic_key_present` is only a boolean.

## E2E harness

```bash
npm run round3:e2e
```

The script starts Next.js on port 3477, sends every failure case without a live model call, then sends PRODUCT-13 (front, back, label) once with the key. Set `ANTHROPIC_API_KEY` in the environment first. Do not commit it.

## Evaluation, stated honestly

The frozen Gemini held-out score remains **95.1%** on scorable fields, from one annotator. It is not a Round 3 Claude score.

Vinay labeled the same 15 products afterward. Agreement on the fields both of them judged:

- barcode visible 14/14 (PRODUCT-4 is unscored: MAC/IMEI is not a GTIN)
- barcode value 13/13
- FNSKU visible 15/15
- expiry visible 14/15 (PRODUCT-3)
- handling 11/15 (PRODUCT-1, PRODUCT-12, PRODUCT-13, PRODUCT-15)

Polybag seal and suffocation warning were not measured. There is no new overall percentage.
