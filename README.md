# Notebook · LM — a RAG reading companion

> Assignment 03 — Krritin Keshan (24bcs10122)

Upload a PDF or plain-text manuscript and converse with its contents. Replies
are drawn only from the page — the model is forbidden from answering from its
own knowledge.

- **Live demo:** _add your Vercel URL after deployment_
- **GitHub repo:** _add your repo URL_

---

## Stack

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Framework        | Next.js 14 (App Router)                                 |
| Document loaders | `@langchain/community` PDFLoader / TextLoader           |
| Chunking         | `RecursiveCharacterTextSplitter` — 1000 / 200           |
| Embeddings       | **Local** `Xenova/all-MiniLM-L6-v2` (no API key needed) |
| Vector DB        | Qdrant — local Docker / Qdrant Cloud                    |
| LLM              | **OpenRouter** (default model: `openai/gpt-4o-mini`)    |
| Hosting          | Vercel + Qdrant Cloud                                   |

### Why OpenRouter + local embeddings?

OpenRouter is a unified gateway that routes a single API key to any of ~200
chat models (GPT, Claude, Llama, Mistral, etc.). It does **not** expose an
embeddings endpoint, so this project ships embeddings locally via
`@xenova/transformers`. That keeps setup down to a **single API key** for the
whole pipeline.

## Pipeline

```
upload  →  chunk  →  embed (local MiniLM)  →  Qdrant
                                                 │
                                          retrieve top-4
                                                 │
                                       OpenRouter LLM (grounded)
                                                 │
                                  answer + page-cited footnotes
```

### Chunking

[src/lib/rag.js](src/lib/rag.js) uses `RecursiveCharacterTextSplitter` with
`chunkSize: 1000` and `chunkOverlap: 200`.

- It splits hierarchically — paragraphs → sentences → words — so chunks stay
  semantically coherent rather than being cut mid-sentence.
- The 200-char overlap preserves context across chunk boundaries.
- Every chunk inherits the `pageNumber` metadata produced by `PDFLoader`,
  which powers the page-citation in answers.

### Grounding

The system prompt in [src/lib/rag.js](src/lib/rag.js) forces the model to:

1. Use **only** the retrieved context.
2. Reply `I could not find this in the document.` when the answer is absent.
3. Append `(Source: page X, page Y)` to every answer.

Combined with `temperature: 0.1`, this dramatically reduces hallucination.

---

## Local setup

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/google-notebooklm-rag.git
cd google-notebooklm-rag
npm install
```

### 2. Start Qdrant

```bash
docker compose up -d
# Dashboard at http://localhost:6333/dashboard
```

### 3. Configure environment

```bash
cp .env.example .env.local
# open .env.local and paste your OPENROUTER_API_KEY
```

Get a free key at <https://openrouter.ai/keys>.

> The `meta-llama/llama-3.3-70b-instruct:free` model on OpenRouter is free
> tier; switch `OPENROUTER_MODEL` in `.env.local` to use it without spending
> credits.

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

The first ingestion downloads the embedding model (~80 MB) into the cache —
subsequent runs are instant.

---

## Deploy (Vercel + Qdrant Cloud)

1. Spin up a free Qdrant Cloud cluster at <https://cloud.qdrant.io>. Copy the
   cluster URL and API key.
2. Push this repo to GitHub.
3. Import it on Vercel. Under *Project Settings → Environment Variables*, add:
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` *(optional — defaults to `openai/gpt-4o-mini`)*
   - `QDRANT_URL` — your Qdrant Cloud cluster URL
   - `QDRANT_API_KEY` — your Qdrant Cloud key
   - `SITE_URL` — your Vercel URL (used as the OpenRouter `HTTP-Referer`)
4. Click **Deploy**.

> The serverless function may have a cold-start delay on the first request
> after deploy because the local embedding model has to download into `/tmp`.
> Subsequent requests on the same warm instance are fast.

---

## Project layout

```
src/
├── app/
│   ├── api/
│   │   ├── upload/route.js   ← receives file → ingestFile()
│   │   └── chat/route.js     ← receives query → answerQuery()
│   ├── globals.css           ← editorial paper styling
│   ├── layout.js             ← Bodoni Moda · EB Garamond · IBM Plex Mono
│   └── page.js               ← masthead, deposit form, conversation ledger
└── lib/
    └── rag.js                ← chunk · embed · store · retrieve · generate
docker-compose.yml            ← local Qdrant
.env.example                  ← env vars
```

---

## License

MIT — built for educational purposes as part of the Scaler GenAI assignment.
