# Agent API and MCP boundary

XCPC Trainer exposes a provider-neutral HTTP contract at `/api/openapi`. It is intentionally smaller than the internal application API.

## Allowed agent operations

- `getTrainingContext`: read the due queue without notes, algorithm tags, editorials, or prior solutions.
- `submitTrainingEvidence`: submit one of the four evidence values after the user attempts the problem.
- `createContestSession`: record a contest and its exposed problems in one structured operation.
- `createUnseenTransferTask`: attach one unlabeled, unseen transfer problem to a retained source problem.

`getTrainingContext` also returns retained transfer candidates with only problem identity fields. An agent may use the source URL to choose a related unseen problem, but must not reveal the relationship or algorithm label to the user before the attempt.

The API never accepts `nextReviewAt`, interval length, review stage, clean streak, retained status, or stable status from a client. Those values are produced by the deterministic scheduler.

## Authentication

An owner browser session can call the API through the private Site. A future standalone client must reach the deployment through an approved private connection or separately approved API surface, then send `Authorization: Bearer <AGENT_API_KEY>`. The key is stored only as a deployment environment variable.

Do not put an API key in D1, exported backups, source control, a prompt, or a public MCP configuration. The initial deployment does not configure this key, so third-party clients are denied by default. A bearer key does not by itself bypass the private Site access policy.

## MCP adapter shape

An MCP server should map tools one-to-one onto the HTTP operations:

| MCP tool | HTTP operation | Writable fields |
|---|---|---|
| `xcpc_get_training_context` | `GET /api/agent/context` | none |
| `xcpc_submit_evidence` | `POST /api/agent/evidence` | `problemId`, `evidence`, `notes` |
| `xcpc_create_contest_session` | `POST /api/contests` | contest metadata and problem evidence |
| `xcpc_create_unseen_transfer` | `POST /api/transfers` | source problem id and transfer problem identity |

Keep credentials and HTTP transport inside the adapter. Do not place model-provider code in the scheduler or database layer.

## Web chat clients

Browser-based GPT, Claude, Gemini, DeepSeek, or another chat frontend should integrate through this contract, a browser extension, or an MCP-capable host. Automating private webpage DOMs and cookies is deliberately outside the core project because it is brittle and creates account-security risk.
