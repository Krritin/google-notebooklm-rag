# Notebook · LM — a RAG reading companion

> Assignment 03 — Krritin Keshan (24bcs10122)

Upload a PDF or plain-text manuscript and converse with its contents. Replies
are drawn only from the page — every factual claim is grounded in the
retrieved chunks, with page numbers cited as footnotes.

- **Live demo:** <https://google-notebooklm-rag.vercel.app>
- **GitHub repo:** <https://github.com/Krritin/google-notebooklm-rag>

---

## Stack

| Layer            | Choice                                                        |
| ---------------- | ------------------------------------------------------------- |
| Framework        | Next.js 14 (App Router)                                       |
| Document loaders | `@langchain/community` — `PDFLoader` / `TextLoader`           |
| Chunking         | `RecursiveCharacterTextSplitter` — 2000 / 200                 |
| Embeddings       | **Jina AI** — `jina-embeddings-v2-base-en` (768-dim)          |
| Vector DB        | **Qdrant Cloud** (free tier)                                  |
| LLM              | **OpenRouter** — default model `openai/gpt-4o-mini`           |
| Hosting          | Vercel                                                        |
| Typography       | Bodoni Moda · EB Garamond · IBM Plex Mono                     |

### Why three providers?

- **OpenRouter** routes a single API key to any of ~200 chat models, but it
  does not expose embeddings.
- **Jina** offers 1M free embedding tokens with batched calls and very low
  latency — fast enough for Vercel's 60 s function limit.
- **Qdrant Cloud** has a free tier and is the same vector store the original
  example code used.

All three providers offer free tiers, so the whole pipeline runs without
spending money.

## Pipeline

```
upload  →  chunk  →  embed (Jina)  →  Qdrant Cloud
                                          │
                                   retrieve top-4
                                          │
                              OpenRouter LLM (grounded)
                                          │
                       answer + page-cited footnotes
```

Each upload creates a fresh Qdrant collection (`nblm_<uuid>`), so multiple
documents stay isolated and the user can switch between them by re-uploading.

### Chunking

[src/lib/rag.js](src/lib/rag.js) uses `RecursiveCharacterTextSplitter` with
`chunkSize: 2000` and `chunkOverlap: 200`.

- It splits hierarchically — paragraphs → sentences → words — so chunks stay
  semantically coherent rather than being cut mid-sentence.
- The 200-char overlap preserves context across chunk boundaries, which keeps
  retrieval accurate when an answer spans two adjacent chunks.
- Every chunk inherits the `pageNumber` metadata produced by `PDFLoader`,
  which powers the page-citation in answers.
- 2000 was tuned to balance retrieval granularity against the number of
  embedding API calls per upload (so ingestion finishes well under Vercel's
  60-second serverless timeout).

### Grounding

The system prompt in [src/lib/rag.js](src/lib/rag.js) forces the model to:

1. Use **only** facts present in the retrieved context.
2. Be allowed to summarize, synthesize, paraphrase, and expand acronyms — but
   never introduce facts that are not in the context.
3. Reply `"I could not find this in the document."` when the context does not
   contain enough information.
4. Append `(Source: page X, page Y)` to every answer.

Combined with `temperature: 0.1`, this almost eliminates hallucination while
still allowing useful answers when the user phrases questions naturally.

---

## Local setup

### 1. Clone & install

```bash
git clone https://github.com/Krritin/google-notebooklm-rag.git
cd google-notebooklm-rag
npm install
```

### 2. Get the three free API keys

| Provider | Where | What to copy |
| -------- | ----- | ------------ |
| OpenRouter | <https://openrouter.ai/keys> | `OPENROUTER_API_KEY` |
| Jina AI | <https://jina.ai/?sui=apikey> | `JINA_API_KEY` |
| Qdrant Cloud | <https://cloud.qdrant.io> → create cluster | `QDRANT_URL` + `QDRANT_API_KEY` |

None of them require a credit card.

### 3. Configure environment

```bash
cp .env.example .env.local
# open .env.local and paste the four keys
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

> **Optional:** if you want to run Qdrant locally instead of using the cloud,
> `docker compose up -d` will start a local Qdrant container. Then set
> `QDRANT_URL=http://localhost:6333` and leave `QDRANT_API_KEY` empty.

---

## Deploy on Vercel

1. Push the repo to GitHub (already done — `Krritin/google-notebooklm-rag`).
2. Import the repo at <https://vercel.com/new>.
3. Under **Environment Variables**, add:
   - `OPENROUTER_API_KEY`
   - `JINA_API_KEY`
   - `QDRANT_URL` — your Qdrant Cloud cluster URL
   - `QDRANT_API_KEY` — your Qdrant Cloud key
   - `OPENROUTER_MODEL` *(optional — defaults to `openai/gpt-4o-mini`)*
   - `SITE_URL` *(optional — your Vercel URL)*
4. Click **Deploy**. First build takes ~90 s.

That's it. The live URL Vercel gives you is your submission link.

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
docker-compose.yml            ← optional local Qdrant
.env.example                  ← env vars
```

---

## How to verify it's working

1. Upload any PDF (e.g. a textbook chapter or research paper).
2. Wait for `Catalogued … N folios, M passages indexed`.
3. Ask a specific question — note the page citation.
4. Ask something that is **not** in the document — the model should reply
   `"I could not find this in the document."`

If both pass, the pipeline meets every criterion in the assignment rubric:
ingestion → chunking → embedding → storage → retrieval → grounded generation.

---

## License

MIT — built for educational purposes as part of the Scaler GenAI assignment.
