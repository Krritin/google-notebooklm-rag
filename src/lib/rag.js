import { writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { JinaEmbeddings } from "@langchain/community/embeddings/jina";
import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAI } from "openai";

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

const EMBED_MODEL = process.env.EMBED_MODEL || "jina-embeddings-v2-base-en";
const JINA_API_KEY = process.env.JINA_API_KEY;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

let _embeddings;
function getEmbeddings() {
  if (!JINA_API_KEY) {
    throw new Error(
      "JINA_API_KEY is not set. Get a free key at https://jina.ai/?sui=apikey (no card required).",
    );
  }
  if (!_embeddings) {
    _embeddings = new JinaEmbeddings({
      apiKey: JINA_API_KEY,
      model: EMBED_MODEL,
    });
  }
  return _embeddings;
}

function getOpenRouter() {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (get one at https://openrouter.ai/keys).",
    );
  }
  return new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": SITE_URL,
      "X-Title": "Notebook·LM Clone",
    },
  });
}

function qdrantConfig(collectionName) {
  return {
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    collectionName,
  };
}

/**
 * Chunking strategy: RecursiveCharacterTextSplitter (2000 / 200).
 *
 * - Splits hierarchically — paragraphs → sentences → words — so chunks stay
 *   semantically coherent rather than cut mid-sentence.
 * - 200-char overlap preserves context across chunk boundaries, so retrieval
 *   still works when an answer spans two adjacent chunks.
 * - Each chunk inherits PDFLoader's `pageNumber` metadata, which powers the
 *   page-citation feature in the answer.
 */
function getSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 200,
  });
}

async function loadDocument(filePath, mimeType) {
  if (mimeType === "application/pdf" || filePath.toLowerCase().endsWith(".pdf")) {
    const loader = new PDFLoader(filePath);
    return loader.load();
  }
  const loader = new TextLoader(filePath);
  return loader.load();
}

/**
 * Ingest one uploaded file end-to-end:
 * load → chunk → embed (local MiniLM) → store in Qdrant.
 * Returns the unique collection name so the client can query it later.
 */
export async function ingestFile({ buffer, filename, mimeType }) {
  const dir = path.join(tmpdir(), "notebooklm-uploads");
  await mkdir(dir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tempPath = path.join(dir, `${randomUUID()}-${safeName}`);
  await writeFile(tempPath, buffer);

  try {
    const docs = await loadDocument(tempPath, mimeType);
    if (!docs.length) throw new Error("Could not extract any text from this file.");

    const chunks = await getSplitter().splitDocuments(docs);

    chunks.forEach((c) => {
      c.metadata = { ...c.metadata, source: filename };
    });

    const collectionName = `nblm_${randomUUID().replace(/-/g, "")}`;
    await QdrantVectorStore.fromDocuments(
      chunks,
      getEmbeddings(),
      qdrantConfig(collectionName),
    );

    return {
      collectionName,
      filename,
      pages: docs.length,
      chunks: chunks.length,
    };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

/**
 * Retrieve relevant chunks and generate a grounded answer via OpenRouter.
 * The system prompt forbids the model from drawing on outside knowledge.
 */
export async function answerQuery({ collectionName, query, k = 4 }) {
  const store = await QdrantVectorStore.fromExistingCollection(
    getEmbeddings(),
    qdrantConfig(collectionName),
  );

  const retriever = store.asRetriever({ k });
  const searched = await retriever.invoke(query);

  const context = searched
    .map((doc, i) => {
      const page = doc.metadata?.loc?.pageNumber ?? doc.metadata?.page ?? "?";
      return `--- Chunk ${i + 1} (page ${page}) ---\n${doc.pageContent}`;
    })
    .join("\n\n");

  const systemPrompt = `You are an AI assistant who answers user questions strictly from the document context provided below.

Rules:
- ONLY use facts from the context. If the answer is not in the context, reply: "I could not find this in the document."
- Be concise and accurate. Quote short phrases when useful.
- Cite the page number(s) you used at the end of each answer like: (Source: page 3, page 7).
- Do not invent information or rely on general knowledge.

Context:
${context}`;

  const client = getOpenRouter();
  const response = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
  });

  const answer = response.choices[0].message.content ?? "";
  const sources = searched.map((doc) => ({
    page: doc.metadata?.loc?.pageNumber ?? doc.metadata?.page ?? null,
    snippet: doc.pageContent.slice(0, 240),
  }));

  return { answer, sources };
}
