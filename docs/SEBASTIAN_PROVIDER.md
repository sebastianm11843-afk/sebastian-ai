# Sebastian AI provider and model-server contract

## Current architecture milestone

The web app's `/api/chat` route now calls the **Sebastian model-server interface**, not OpenRouter. The adapter is server-side and reads `SEBASTIAN_MODEL_SERVER_URL`, `SEBASTIAN_MODEL_ID`, and `SEBASTIAN_MODEL_SERVER_TOKEN` from environment variables. Do not put server tokens in client-side code or commit real secrets.

This change creates the provider boundary; it does **not** mean an inference engine or model weights are already hosted. Until a compatible model server is running, chat requests return a clear `503` configuration error instead of pretending to generate answers.

## Required model-server API

The separately hosted model server should implement:

- `GET /health` — `200` when the inference service is ready.
- `GET /v1/models` — JSON with either `{ "data": [{ "id": "sebastian" }] }` or `{ "models": [{ "id": "sebastian" }] }`.
- `POST /v1/chat/completions` — accept `model`, `messages`, `max_tokens`, `temperature`, `top_p`, and `stream`; return an OpenAI-compatible Server-Sent Events stream where text deltas appear at `choices[0].delta.content` and the stream ends with `data: [DONE]`.
- Optional bearer-token authentication using the same `SEBASTIAN_MODEL_SERVER_TOKEN`. In production, require authentication and keep the service off the public internet where practical.
- If image input is supported, accept user message content arrays containing `text` and `image_url` parts. The app validates image data URLs before forwarding them.

## Configure the web app

Set these as **server-side Vercel environment variables** and redeploy after a model server is actually available:

- `SEBASTIAN_MODEL_SERVER_URL` — HTTPS base URL, without a path, query, or credentials. HTTP is allowed only for localhost development.
- `SEBASTIAN_MODEL_ID` — model ID served by the model server; defaults to `sebastian`.
- `SEBASTIAN_MODEL_SERVER_TOKEN` — shared bearer token; use a strong secret in production.

The web app exposes `GET /api/ai/health` for readiness and `GET /api/ai/models` to list IDs. These endpoints do not reveal the configured URL or token.

## Current limitations and next milestone

- Web search is deliberately reported as not configured when toggled on; no fake search results are generated. Add a separate search adapter before enabling it.
- The app's in-memory request limit is per running instance and is not a distributed quota system. For a public launch, use a shared rate-limit store and authenticate users.
- The model server and inference engine still need to be built and deployed. The server must run actual model inference using suitable model weights and compute; an HTTP wrapper by itself is not an AI model. Review model licences and hardware requirements before selecting weights.
- Test build, streaming, timeouts, image handling, authentication, and model output before merging or deploying.
