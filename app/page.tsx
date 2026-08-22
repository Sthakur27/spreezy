"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SAMPLE = `Reading doesn't have to mean slowing down. Rapid keeps your eyes in one place while the words find you. Paste an article, a report, or your own notes, choose a pace, and let your focus settle in.`;

type WikipediaResponse = {
  query?: { pages?: Record<string, { title?: string; extract?: string }> };
};

function sanitizeWikipediaText(value: string) {
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/={2,}[^=]+={2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
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
  const [isFindingArticle, setIsFindingArticle] = useState(false);
  const [articleError, setArticleError] = useState("");
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
  }, []);

  const loadRandomArticle = useCallback(async () => {
    setIsFindingArticle(true);
    setArticleError("");
    try {
      const response = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0&prop=extracts&explaintext=1&exsectionformat=plain&exchars=15000&origin=*",
      );
      if (!response.ok) throw new Error("Wikipedia is unavailable right now.");
      const payload = (await response.json()) as WikipediaResponse;
      const page = Object.values(payload.query?.pages ?? {})[0];
      const cleanedText = sanitizeWikipediaText(page?.extract ?? "");
      if (cleanedText.split(/\s+/).filter(Boolean).length < 12) {
        throw new Error("That page was too short. Try another one.");
      }
      setText(cleanedText);
      setSourceTitle(page?.title ?? "A random Wikipedia article");
      begin(cleanedText);
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : "Couldn’t load an article. Please try again.");
    } finally {
      setIsFindingArticle(false);
    }
  }, [begin]);

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
        {reading && <button className="text-button" onClick={reset}>New text <span>↗</span></button>}
      </header>

      {!reading ? (
        <section className="landing">
          <div className="intro">
            <p className="kicker"><span /> Read at the speed of thought</p>
            <h1>One word.<br /><em>Zero distraction.</em></h1>
            <p className="lede">Rapid brings each word to a single focal point, so your eyes can stay still and your mind can move faster.</p>
          </div>

          <div className="composer">
            <div className="composer-label"><label htmlFor="source">Paste your text</label><span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span></div>
            <textarea id="source" value={text} onChange={(event) => { setText(event.target.value); setSourceTitle(""); }} placeholder="Drop in an article, notes, or anything you want to read…" autoFocus />
            <div className="composer-footer">
              <div className="composer-actions">
                <button className="sample" onClick={() => { setText(SAMPLE); setSourceTitle(""); }}>Use sample text</button>
                <button className="random" disabled={isFindingArticle} onClick={loadRandomArticle}>{isFindingArticle ? "Finding an article…" : "Random Wikipedia"}</button>
              </div>
              <button className="primary" disabled={!text.trim()} onClick={() => begin()}>Start reading <span>→</span></button>
            </div>
            {articleError && <p className="article-error" role="alert">{articleError}</p>}
          </div>
          <div className="how"><span>01</span><p>Paste text</p><i>→</i><span>02</span><p>Set your pace</p><i>→</i><span>03</span><p>Press play</p></div>
        </section>
      ) : (
        <section className="reader">
          <div className="reader-top">
            <div><span className="meta-label">PACE</span><strong>{wpm} <small>WPM</small></strong></div>
            <div className="count"><span className="meta-label">PROGRESS</span><strong>{index + 1} <small>/ {words.length}</small></strong></div>
          </div>
          {sourceTitle && <p className="article-title">Wikipedia / <span>{sourceTitle}</span></p>}

          <div className="word-stage" aria-live="polite" aria-atomic="true">
            <span className="guide top" />
            <div className="word" aria-label={current}>
              <span className="before">{parts.before}</span><b>{parts.focus}</b><span className="after">{parts.after}</span>
            </div>
            <span className="guide bottom" />
          </div>

          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>

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
