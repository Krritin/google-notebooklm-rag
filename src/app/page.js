"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [collection, setCollection] = useState(null);
  const [docInfo, setDocInfo] = useState(null);
  const [uploadStatus, setUploadStatus] = useState({ kind: "idle", text: "" });

  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);

  const ledgerRef = useRef(null);

  useEffect(() => {
    if (ledgerRef.current) {
      ledgerRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, asking]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;

    setUploadStatus({ kind: "loading", text: "Pressing the manuscript into memory" });
    setMessages([]);
    setCollection(null);
    setDocInfo(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setCollection(data.collectionName);
      setDocInfo(data);
      setUploadStatus({
        kind: "success",
        text: `Catalogued “${data.filename}” — ${data.pages} folio${data.pages === 1 ? "" : "s"}, ${data.chunks} passages indexed.`,
      });
    } catch (err) {
      setUploadStatus({ kind: "error", text: err.message });
    }
  }

  async function handleAsk(e) {
    e.preventDefault();
    if (!collection || !query.trim() || asking) return;

    const userMessage = { role: "user", content: query.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setAsking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionName: collection,
          query: userMessage.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `— ${err.message}` },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const isUploading = uploadStatus.kind === "loading";
  const fileLabel = file?.name ?? "no manuscript chosen";

  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead__row">
          <span>Notebook · LM</span>
          <span>vol. <em>I</em> · № 03 · MMXXVI</span>
        </div>
        <div className="rule rule--double" />
        <h1 className="masthead__title">
          The notebook<br />
          <em>that reads back</em>
        </h1>
        <p className="masthead__lede">
          A retrieval-augmented reading companion. Deposit a manuscript and
          converse with its contents — every reply drawn solely from the page,
          never from the engine&rsquo;s imagination.
        </p>
      </header>

      <section className="section section--deposit">
        <h2 className="section__title">
          <span className="roman">§ I</span>
          <span>Deposit a manuscript</span>
        </h2>
        <form className="deposit" onSubmit={handleUpload}>
          <label className="deposit__field">
            <span className="deposit__field-label">Source — pdf, txt or md</span>
            <span className={`deposit__field-value ${file ? "" : "empty"}`}>
              {fileLabel}
            </span>
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={isUploading}
            />
          </label>
          <button
            type="submit"
            className="btn"
            disabled={!file || isUploading}
          >
            {isUploading ? "Indexing" : "Index →"}
          </button>
        </form>
        {uploadStatus.text && (
          <p
            className={`deposit__note deposit__note--${uploadStatus.kind}`}
            key={uploadStatus.text}
          >
            <span>{uploadStatus.text}</span>
          </p>
        )}
      </section>

      <section className="section section--ledger">
        <h2 className="section__title">
          <span className="roman">§ II</span>
          <span>Conversation</span>
        </h2>

        <div className="ledger">
          {messages.length === 0 && !asking && (
            <p className="ledger__empty">
              {collection
                ? "Pose your question below."
                : "Awaiting a manuscript."}
            </p>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="entry entry--question">
                <span className="entry__marker">Q.</span>
                <p>{m.content}</p>
              </div>
            ) : (
              <div key={i} className="entry entry--answer">
                <p className="entry__body">{m.content}</p>
                {m.sources?.length > 0 && (
                  <div className="footnotes">
                    <p className="footnotes__label">
                      Retrieved passages — verbatim
                    </p>
                    <ol>
                      {m.sources.map((s, j) => (
                        <li key={j}>
                          <span className="page-mark">
                            fol. {s.page ?? "?"}
                          </span>
                          {s.snippet}…
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ),
          )}

          {asking && (
            <p className="entry entry--thinking">
              Composing<span className="dots" />
            </p>
          )}
          <div ref={ledgerRef} />
        </div>

        <form className="composer" onSubmit={handleAsk}>
          <span className="composer__caret">›</span>
          <input
            type="text"
            placeholder={
              collection
                ? "Pose a question to the manuscript…"
                : "Deposit a manuscript first"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!collection || asking}
          />
          <button
            type="submit"
            className="btn btn--ghost"
            disabled={!collection || !query.trim() || asking}
          >
            Send
          </button>
        </form>
      </section>

      <footer className="colophon">
        <div className="rule rule--hair" />
        <p>
          <em>
            Set in Bodoni Moda, EB Garamond &amp; IBM Plex Mono. Hand-bound by
          </em>
          <br />
          Krritin Keshan · № 24bcs10122
        </p>
      </footer>
    </main>
  );
}
