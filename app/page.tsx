"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SAMPLE = `Reading doesn't have to mean slowing down. Rapid keeps your eyes in one place while the words find you. Paste an article, a report, or your own notes, choose a pace, and let your focus settle in.`;
const MINIMUM_ARTICLE_WORDS = 80;
const RANDOM_ARTICLE_URL = "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0&prop=extracts&explaintext=1&exsectionformat=plain&exchars=15000&origin=*";
const TOPICS = [
  ["any", "Any topic", ""],
  ["science", "Science", "Category:Science"],
  ["history", "History", "Category:History"],
  ["technology", "Technology", "Category:Technology"],
  ["arts", "Arts", "Category:Visual_arts"],
  ["nature", "Nature", "Category:Natural_history"],
  ["biography", "People", "Category:Living_people"],
] as const;
const ARTICLE_LENGTHS = [200, 300, 600, 1200] as const;

type WikipediaResponse = {
  query?: { pages?: Record<string, { title?: string; extract?: string }> };
};

type PendingArticle = {
  title: string;
  text: string;
  url: string;
  preview: string;
  wordCount: number;
  topic: string;
};

function sanitizeWikipediaText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
}

function makePreview(value: string) {
  const sentence = value.match(/^.{100,500}?[.!?](?=\s|$)/)?.[0];
  return sentence ?? `${value.slice(0, 420).trimEnd()}…`;
}

function limitWords(value: string, limit: number) {
  return value.split(/\s+/).filter(Boolean).slice(0, limit).join(" ");
}

function splitWord(word: string) {
  const coreStart = word.search(/[A-Za-z0-9]/);
  const coreEnd = Math.max(...Array.from(word).map((char, index) => /[A-Za-z0-9]/.test(char) ? index : -1));
  if (coreStart < 0 || coreEnd < 0) return { before: "", focus: word[0] || "", after: word.slice(1) };
  const length = coreEnd - coreStart + 1;
  const offset = length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4;
  const focusIndex = Math.min(coreStart + offset, coreEnd);
  return { before: word.slice(0, focusIndex), focus: word[focusIndex], after: word.slice(focusIndex + 1) };
}

export default function Home() {
  const [text, setText] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState(300);
  const [playing, setPlaying] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pendingArticle, setPendingArticle] = useState<PendingArticle | null>(null);
  const [isFindingArticle, setIsFindingArticle] = useState(false);
  const [articleError, setArticleError] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number][0]>("any");
  const [articleLength, setArticleLength] = useState<(typeof ARTICLE_LENGTHS)[number]>(300);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reading = words.length > 0;
  const current = words[index] || "";
  const parts = useMemo(() => splitWord(current), [current]);
  const progress = words.length ? ((index + 1) / words.length) * 100 : 0;

  const begin = useCallback((source = text) => {
    const next = source.trim().split(/\s+/).filter(Boolean);
    if (!next.length) return;
    setWords(next);
    setIndex(0);
    setPlaying(true);
  }, [text]);

  const reset = useCallback(() => {
    setPlaying(false);
    setWords([]);
    setIndex(0);
    setSourceTitle("");
    setSourceUrl("");
    setPendingArticle(null);
  }, []);

  const loadRandomArticle = useCallback(async () => {
    setIsFindingArticle(true);
    setArticleError("");
    try {
      const selectedTopic = TOPICS.find(([id]) => id === topic) ?? TOPICS[0];
      const categoryUrl = selectedTopic[2]
        ? `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(selectedTopic[2])}&gcmnamespace=0&gcmtype=page&gcmlimit=50&origin=*`
        : RANDOM_ARTICLE_URL;
      const categoryResponse = selectedTopic[2] ? await fetch(categoryUrl) : null;
      if (categoryResponse && !categoryResponse.ok) throw new Error("Wikipedia is unavailable right now.");
      const categoryPayload = categoryResponse ? await categoryResponse.json() as WikipediaResponse : null;
      const categoryPages = Object.values(categoryPayload?.query?.pages ?? {});
      if (selectedTopic[2] && !categoryPages.length) {
        console.warn("[Rapid] Wikipedia category returned no article pages", { topic: selectedTopic[1], category: selectedTopic[2] });
        throw new Error(`Wikipedia couldn’t find articles in ${selectedTopic[1]}. Please choose another topic.`);
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        console.info("[Rapid] Wikipedia topic lookup", { topic: selectedTopic[1], attempt: attempt + 1 });
        const response = selectedTopic[2] ? null : await fetch(categoryUrl);
        if (response && !response.ok) throw new Error("Wikipedia is unavailable right now.");
        const payload = response ? await response.json() as WikipediaResponse : categoryPayload;
        const pages = selectedTopic[2] ? categoryPages : Object.values(payload?.query?.pages ?? {});
        const candidate = pages[Math.floor(Math.random() * pages.length)];
        const articleResponse = selectedTopic[2] && candidate?.title
          ? await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(candidate.title)}&prop=extracts&explaintext=1&exsectionformat=plain&exchars=15000&origin=*`)
          : null;
        if (articleResponse && !articleResponse.ok) throw new Error("Wikipedia is unavailable right now.");
        const articlePayload = articleResponse ? await articleResponse.json() as WikipediaResponse : payload;
        const page = articleResponse ? Object.values(articlePayload.query?.pages ?? {})[0] : candidate;
        const cleanedText = limitWords(sanitizeWikipediaText(page?.extract ?? ""), articleLength);
        const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;
        if (wordCount < MINIMUM_ARTICLE_WORDS) {
          console.warn("[Rapid] Wikipedia candidate was too short", { topic: selectedTopic[1], title: page?.title, wordCount });
          continue;
        }

        const title = page?.title ?? "A random Wikipedia article";
        setPendingArticle({
          title,
          text: cleanedText,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          preview: makePreview(cleanedText),
          wordCount,
          topic: selectedTopic[1],
        });
        return;
      }
      throw new Error("Couldn’t find a readable article. Please try again.");
    } catch (error) {
      console.error("[Rapid] Wikipedia article lookup failed", { topic, error });
      setArticleError(error instanceof Error ? error.message : "Couldn’t load an article. Please try again.");
    } finally {
      setIsFindingArticle(false);
    }
  }, [articleLength, topic]);

  const beginPendingArticle = useCallback(() => {
    if (!pendingArticle) return;
    setText(pendingArticle.text);
    setSourceTitle(pendingArticle.title);
    setSourceUrl(pendingArticle.url);
    begin(pendingArticle.text);
  }, [begin, pendingArticle]);

  const toggle = useCallback(() => {
    if (index >= words.length - 1) setIndex(0);
    setPlaying((value) => !value);
  }, [index, words.length]);

  useEffect(() => {
    if (!playing || !reading) return;
    const punctuationPause = /[.!?][”'\"]?$/.test(current) ? 1.7 : /[,;:][”'\"]?$/.test(current) ? 1.3 : 1;
    timer.current = setTimeout(() => {
      setIndex((value) => {
        if (value >= words.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, (60000 / wpm) * punctuationPause);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, reading, current, words.length, wpm]);

  useEffect(() => {
    if (!reading) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") { event.preventDefault(); toggle(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
      if (event.code === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(words.length - 1, value + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, toggle, words.length]);

  return (
    <main className={reading ? "app reading" : "app"}>
      <header className="topbar">
        <button className="brand" onClick={reset} aria-label="Rapid home"><span>R</span>APID</button>
        <div className="eyebrow">RSVP READER</div>
        {reading && <div className="top-actions"><button className="text-button" onClick={reset}>Browse or paste <span>↗</span></button></div>}
      </header>

      {!reading ? (
        <section className="landing">
          <div className="intro">
            <p className="kicker"><span /> Read at the speed of thought</p>
            <h1>One word.<br /><em>Zero distraction.</em></h1>
            <p className="lede">Rapid brings each word to a single focal point, so your eyes can stay still and your mind can move faster.</p>
          </div>

          <div className="composer">
            <div className="composer-label"><span>Choose your reading</span><span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span></div>
            <section className={pendingArticle ? "article-preview" : "article-discovery"} aria-live="polite">
              {pendingArticle ? <>
                <p className="discovery-kicker">{pendingArticle.topic} / Wikipedia</p>
                <h2>{pendingArticle.title}</h2>
                <p className="preview-copy">{pendingArticle.preview}</p>
                <p className="preview-meta">{pendingArticle.wordCount.toLocaleString()} word reading <span>·</span> cleaned for reading</p>
                <div className="preview-actions">
                  <button className="preview-read" onClick={beginPendingArticle}>Read this article <span>→</span></button>
                  <button className="preview-another" disabled={isFindingArticle} onClick={loadRandomArticle}>Find another</button>
                  <button className="preview-another" onClick={() => setPendingArticle(null)}>Back to topics</button>
                </div>
              </> : <>
                <p className="discovery-kicker">Random find / Wikipedia</p>
                <h2>Let curiosity<br />choose the subject.</h2>
                <p>We’ll pull an unexpected article, clean it up, and give you a moment to decide.</p>
                <div className="topic-picker" aria-label="Wikipedia topic">
                  {TOPICS.map(([id, label]) => <button key={id} className={topic === id ? "active" : ""} onClick={() => setTopic(id)}>{label}</button>)}
                </div>
                <div className="article-length">
                  <label htmlFor="article-length">Reading length</label>
                  <select id="article-length" value={articleLength} onChange={(event) => setArticleLength(Number(event.target.value) as (typeof ARTICLE_LENGTHS)[number])}>
                    {ARTICLE_LENGTHS.map((length) => <option key={length} value={length}>{length} words</option>)}
                  </select>
                </div>
                <button className="discovery-button" disabled={isFindingArticle} onClick={loadRandomArticle}>{isFindingArticle ? "Searching the archive…" : "Discover an article"} <span>→</span></button>
                {articleError && <p className="discovery-error" role="alert">{articleError}</p>}
              </>}
            </section>
            <div className="paste-label"><span>Or bring your own text</span><label htmlFor="source">Paste text</label></div>
            <textarea id="source" value={text} onChange={(event) => { setText(event.target.value); setSourceTitle(""); setSourceUrl(""); setPendingArticle(null); }} placeholder="Drop in an article, notes, or anything you want to read…" autoFocus />
            <div className="composer-footer">
              <div className="composer-actions">
                <button className="sample" onClick={() => { setText(SAMPLE); setSourceTitle(""); setSourceUrl(""); setPendingArticle(null); }}>Use sample text</button>
              </div>
              <button className="primary" disabled={!text.trim()} onClick={() => begin()}>Start reading <span>→</span></button>
            </div>
          </div>
          <div className="how"><span>01</span><p>Paste text</p><i>→</i><span>02</span><p>Set your pace</p><i>→</i><span>03</span><p>Press play</p></div>
        </section>
      ) : (
        <section className="reader">
          <div className="reader-top">
            <div><span className="meta-label">PACE</span><strong>{wpm} <small>WPM</small></strong></div>
            <div className="count"><span className="meta-label">PROGRESS</span><strong>{index + 1} <small>/ {words.length}</small></strong></div>
          </div>
          {sourceTitle && <p className="article-title">Wikipedia / {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceTitle} ↗</a> : <span>{sourceTitle}</span>}</p>}
          {articleError && <p className="reader-error" role="alert">{articleError}</p>}

          <div className="word-stage" aria-live="polite" aria-atomic="true">
            <span className="guide top" />
            <div className="word" aria-label={current}>
              <span className="before">{parts.before}</span><b>{parts.focus}</b><span className="after">{parts.after}</span>
            </div>
            <span className="guide bottom" />
          </div>

          <div className="progress-track">
            <input
              aria-label="Reading position"
              type="range"
              min="0"
              max={Math.max(words.length - 1, 0)}
              value={index}
              onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }}
              style={{ "--range": `${progress}%` } as React.CSSProperties}
            />
          </div>

          <div className="controls">
            <button className="skip" aria-label="Previous word" onClick={() => { setPlaying(false); setIndex((value) => Math.max(0, value - 1)); }}>←</button>
            <button className="play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? "Ⅱ" : "▶"}</button>
            <button className="skip" aria-label="Next word" onClick={() => { setPlaying(false); setIndex((value) => Math.min(words.length - 1, value + 1)); }}>→</button>
          </div>

          <div className="speed">
            <label htmlFor="speed">Slower</label>
            <input id="speed" type="range" min="100" max="900" step="25" value={wpm} onChange={(event) => setWpm(Number(event.target.value))} style={{ "--range": `${((wpm - 100) / 800) * 100}%` } as React.CSSProperties} />
            <label htmlFor="speed">Faster</label>
          </div>
          <p className="hint"><kbd>SPACE</kbd> to pause <span>·</span> <kbd>←</kbd> <kbd>→</kbd> to step</p>
        </section>
      )}
      <footer><span>Built for focused minds.</span><span>Rapid / {new Date().getFullYear()}</span></footer>
    </main>
  );
}
