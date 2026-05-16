# StudyMate — REFERENCES

Curated links, organized by topic. Official docs first, then one or two great tutorials. If something is *the* canonical resource, I say so. Don't try to read it all — pick what's rusty for you and skip the rest.

---

## Git

- [Pro Git book](https://git-scm.com/book/en/v2) — **canonical.** Free, written by the Git maintainers. Chapters 1–3 cover everything you need; the rest is reference.
- [Learn Git Branching](https://learngitbranching.js.org) — interactive in-browser visualizer for branch/merge/rebase. The fastest way to fix a fuzzy mental model.
- [Atlassian Git tutorials](https://www.atlassian.com/git/tutorials) — practical task-oriented guides ("how do I undo X?"). Good when you have a specific problem.

## Command line

- [The Missing Semester (MIT)](https://missing.csail.mit.edu) — **canonical.** The class your CS program didn't teach: shell, scripting, vim, tmux, git. Lectures 1, 2, and 5 are the must-watch ones for this project.
- [explainshell.com](https://explainshell.com) — paste any shell command, get every flag and pipe explained. Use it whenever you copy a command you don't fully understand.

## TypeScript

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) — **canonical.** Read "The Basics" through "Object Types." That's 80% of what you'll use.
- [Total TypeScript — free tutorials](https://www.totaltypescript.com/tutorials) — Matt Pocock's free essentials. Best modern explanation of generics, utility types, and inference.

## React + Next.js

- [react.dev](https://react.dev) — **canonical.** The 2023 rewrite. "Learn React" is genuinely the best React tutorial that exists. Skip the "Reference" half until you need it.
- [Next.js Learn course](https://nextjs.org/learn) — **canonical.** Official walkthrough using the App Router. The dashboard project they build mirrors a lot of what StudyMate needs.
- [Next.js docs — App Router](https://nextjs.org/docs/app) — reference, not tutorial. Bookmark the Route Handlers and Server Actions pages.

## HTTP & APIs

- [MDN — HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview) — **canonical.** The vocabulary (methods, status codes, headers) shows up in every API issue you'll ever debug.
- [MDN — Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) — how `fetch` actually works in the browser and Node, including streams.

## Claude API

- [Claude API docs](https://docs.claude.com) — **canonical.** Start with "Get started," then "Messages," then "Streaming." Skip everything else until you need it.
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — runnable examples for tool use, RAG patterns, structured outputs. Steal the patterns, don't copy whole files.
- [Prompt engineering guide (in the docs)](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview) — short, practical, written by people who actually train the model.

## RAG (retrieval-augmented generation)

- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — **read this.** Anthropic's own writeup on why naive chunking hurts retrieval and what to do about it. Directly relevant to Phase 3.
- [Pinecone Learn — RAG](https://www.pinecone.io/learn/retrieval-augmented-generation/) — vendor-flavored but technically clear. Good visuals for the end-to-end loop.
- [The original RAG paper (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401) — where the term comes from. Worth skimming the abstract and figure 1; the math is optional.

## PDF parsing

- [pdf-parse on npm](https://www.npmjs.com/package/pdf-parse) — the v1 default. Read the README, that's it.
- [Mozilla pdf.js (`pdfjs-dist`)](https://mozilla.github.io/pdf.js/) — the upgrade path when `pdf-parse` isn't enough. The "Examples" section shows how to extract text *with positions*.

## Embeddings

- [Vicki Boykis — *What are embeddings?*](https://vickiboykis.com/what_are_embeddings/) — **canonical intuition builder.** Free 60-page book. Chapter 1 alone is worth the time.
- [Voyage AI docs](https://docs.voyageai.com) — your default embeddings provider. Read "Quickstart" and "Embeddings models" — pick `voyage-3-lite` to start.
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings) — useful even if you go with Voyage; the conceptual sections are provider-agnostic and well-written.

## Vector search

- [Pinecone Learn — Vector Search](https://www.pinecone.io/learn/vector-search-basics/) — clear primer on what an index is and why brute-force-then-ANN is the usual progression.
- [`pgvector` README](https://github.com/pgvector/pgvector) — the v2 option for Postgres. Read the "Querying" section to see what cosine similarity looks like in SQL.
- [`sqlite-vec` README](https://github.com/asg017/sqlite-vec) — the v2 option for SQLite. Newer, simpler than the older `sqlite-vss`.

---

## How to use this list

- **Don't binge.** Pick the topic that's rusty *for the phase you're in*, read the canonical link, then come back to building.
- **Official docs > tutorials > blog posts.** In that order, when you're confused. Tutorials get out of date; canonical docs rarely lie.
- **If a link 404s,** the project moved or got renamed. Search "[topic] official docs" and you'll find the new home — don't trust a five-year-old Medium post over the current docs.
