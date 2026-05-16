# StudyMate — MINI_COURSE

The concepts you need, in roughly the order you'll need them. Sixteen lessons across three parts: foundations from your prep guide, then talking to Claude, then the RAG-specific stuff that makes StudyMate work.

Each lesson: the idea in plain English, an illustrative snippet (a *shape*, not StudyMate code), an exercise to prove you got it, and the pitfall everyone hits.

---

# Part A — Foundations

## Lesson 1 — Git: the eight commands you'll actually use

**The idea.** Git saves snapshots of your code so you can recover any past state. Most days you only use eight commands. Branches and pull requests come once you're collaborating; for solo StudyMate, working on `main` is fine.

**Shape:**
```bash
git init                          # start versioning this folder
git status                        # what's changed?
git diff                          # show me the changes
git add ROADMAP.md                # stage one file
git commit -m "Add roadmap"       # save a snapshot
git push                          # send commits to GitHub
git pull                          # pull commits from GitHub
git log --oneline                 # see snapshot history
```

**Try this.** Make a tiny change, run `git status`, then `git diff`, then commit. Open the repo on GitHub and confirm the commit is there.

**Pitfall.** Committing your `.env.local`. Add it to `.gitignore` *before* your first commit. Once a key is in git history, even removing it doesn't fully erase it from clones.

---

## Lesson 2 — The terminal: just enough

**The idea.** The terminal is faster than clicking once you know it. A handful of commands cover most of what you'll do. Pipes (`|`) feed the output of one command into the next — that's the secret sauce.

**Shape:**
```bash
cd ~/projects/studymate          # go somewhere
ls -la                           # what's here, including hidden files
pwd                              # where am I?
mkdir lib                        # make a folder
cat package.json                 # print a file
cat package.json | grep version  # find lines containing "version"
npm install zod                  # install a package
```

**Try this.** From the terminal: `cd` into your StudyMate folder, `ls` it, `cat package.json`, then pipe it through `grep` to find one specific line.

**Pitfall.** Running random commands from blog posts without knowing what they do. Paste the command into [explainshell.com](https://explainshell.com) when in doubt. `rm -rf /` jokes are not jokes.

---

## Lesson 3 — TypeScript essentials for AI apps

**The idea.** You don't need fancy generics for v1. You need three things: typed function arguments and return values, `async`/`await` for slow API calls (Claude takes seconds — never block), and typed shapes for objects coming over the wire. Strict mode (`"strict": true`) makes the compiler honest about `null`/`undefined`.

**Shape:**
```ts
type Doc = { id: string; subject: string; text: string };

async function summarize(doc: Doc): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: `Summarize: ${doc.text}` }),
  });
  const data: { reply: string } = await res.json();
  return data.reply;
}
```

**Try this.** Write a function `greet(p: { name: string }): Promise<string>`. Try calling it with `{ name: 42 }` — TS should refuse to compile.

**Pitfall.** Reaching for `any` to make red squiggles go away. `any` turns off type checking and the bug surfaces at runtime instead. Prefer `unknown` and narrow with a check.

---

## Lesson 4 — React in 5 minutes

**The idea.** A React component is a function that returns JSX (HTML-like markup). Components hold *state* with `useState` and react to side effects with `useEffect`. When state changes, React re-renders the component. That's 80% of React.

**Shape:**
```tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
```

**Try this.** Build a component with a textbox and a "submitted" display. Type, click submit, see your text below. Then make submit clear the textbox.

**Pitfall.** Mutating state directly: `count = count + 1` instead of `setCount(count + 1)`. React doesn't see the change and won't re-render. State is read-only — always go through the setter.

---

## Lesson 5 — Next.js: pages, API routes, server vs client

**The idea.** Next.js gives you two kinds of code in one project: **server code** (route handlers in `app/api/.../route.ts`, plus Server Components by default) and **client code** (anything marked `"use client"`). Your Claude key lives in server code only. The browser calls `/api/...`; those endpoints call Claude.

**Shape:**
```ts
// app/api/echo/route.ts          ← runs on the server
export async function POST(req: Request) {
  const { msg } = await req.json();
  return Response.json({ echo: msg });
}
```
```tsx
// app/page.tsx                   ← Server Component by default
export default function Page() {
  return <main className="p-8">Hello StudyMate</main>;
}
```

**Try this.** Add `console.log("server")` in a route handler and `console.log("client")` in a `"use client"` component. The first appears in your terminal, the second in DevTools. That gap is the security boundary.

**Pitfall.** Trying to read `process.env.ANTHROPIC_API_KEY` from a client component. It's `undefined` (correctly — the browser must never see it). All key access goes through a route handler.

---

## Lesson 6 — HTTP, fetch, and `.env.local`

**The idea.** HTTP is request/response over the internet. The browser `fetch`es a URL with a method (`GET`/`POST`), optional JSON body, and gets a response with a status code (`200` ok, `4xx` your fault, `5xx` server's fault). `.env.local` is a file Next.js auto-loads at startup; values *without* the `NEXT_PUBLIC_` prefix stay server-side.

**Shape:**
```bash
# .env.local              ← never commit this
ANTHROPIC_API_KEY=sk-ant-...
```
```ts
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello" }),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();
```

**Try this.** In a route handler return `Response.json({ ok: true }, { status: 418 })`. From the client, `fetch` it and log `res.status`. Confirm it's 418.

**Pitfall.** Naming your key `NEXT_PUBLIC_ANTHROPIC_API_KEY` because "it didn't work otherwise." That prefix bundles the value into the client. Your key is now in every browser that loads the page.

---

# Part B — Talking to Claude

## Lesson 7 — Calling Claude from a Next.js API route

**The idea.** The browser must never see your API key. So: browser → your route handler → Claude. Two hops, one secret. The Anthropic SDK reads `ANTHROPIC_API_KEY` from the environment, so init is one line.

**Shape:**
```ts
// app/api/chat/route.ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

export async function POST(req: Request) {
  const { message } = await req.json();
  const reply = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: message }],
  });
  return Response.json({ reply: reply.content });
}
```

**Try this.** Wire this up, then in DevTools → Network confirm the only outbound call is to `/api/chat`, never to `api.anthropic.com`.

**Pitfall.** Forgetting `max_tokens`. The SDK won't infer it and will error out. Pick a sensible cap per use case (chat: 512–1024; long answers: 2048).

---

## Lesson 8 — Streaming responses

**The idea.** Without streaming, the user stares at a spinner for 5 seconds. With streaming, tokens arrive as Claude produces them and the UI types out in real time. Same cost; completely different feel. The SDK exposes the response as an async iterable; you forward chunks into a `ReadableStream` your client reads via `fetch`.

**Shape:**
```ts
const stream = await client.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 512,
  messages,
});

return new Response(
  new ReadableStream({
    async start(controller) {
      for await (const evt of stream) {
        if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
          controller.enqueue(new TextEncoder().encode(evt.delta.text));
        }
      }
      controller.close();
    },
  })
);
```

**Try this.** Convert your Lesson 7 chat to streaming. On the client use `await response.body.getReader()` and append each chunk to React state.

**Pitfall.** "Nothing appears, then everything appears at once" usually means the client called `res.text()` (which buffers the whole stream) instead of reading chunks one at a time.

---

## Lesson 9 — Prompt engineering basics

**The idea.** Prompts work better when they're (1) specific about the task, (2) show an example of the expected output, and (3) ask for *structured* output (JSON) when you'll parse it. The **system prompt** sets the role and rules; the **user prompt** is the input. Vague prompts produce vague answers.

**Shape:**
```ts
const reply = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 200,
  system: `You extract topics from study questions.
Return JSON only: { "topics": ["..."] }.

Example input: "What is photosynthesis?"
Example output: { "topics": ["biology", "photosynthesis"] }`,
  messages: [{ role: "user", content: "How do eigenvalues work?" }],
});
```

**Try this.** Write two prompts for the same task — one vague ("summarize this"), one specific ("Summarize this in 2 bullets, max 15 words each, factual only"). Compare outputs.

**Pitfall.** Burying instructions deep in the user prompt. Put rules in the **system prompt** — the model treats them as higher-priority and follows them more reliably.

---

## Lesson 10 — Tool use, briefly

**The idea.** Tool use lets Claude *request* that you run a function and feed the result back. You define tools (name, description, input schema). The model returns a `tool_use` block instead of (or alongside) text. You execute the tool in your code, send a `tool_result` back, and the model continues. This is what makes "agents" possible — the model decides *what to do* but you control *what runs*.

**The loop:**
```
Round 1: user message  → model returns tool_use("search_notes", { query: "X" })
You:     run search_notes("X") yourself → got results
Round 2: send tool_result → model uses results to compose the final answer
```

**Try this.** Define one tool, `get_current_time`, with no inputs. Ask Claude "what time is it?" Watch the model request the tool, then return a final answer once you give it the result.

**Pitfall.** Treating tool use as magic. The model can call tools that don't exist or pass nonsense arguments. *You* still validate inputs and handle errors. The "agent" is just a loop you wrote.

> For StudyMate v1 you don't need tool use — RAG is enough. Come back to this for v2.

---

# Part C — RAG: the StudyMate core

## Lesson 11 — What a chunk is, and why fixed-size is dumb

**The idea.** A chunk is a slice of a document small enough to retrieve, large enough to *stand alone* — because at answer time the model only sees the chunks you send, not the surrounding doc. A chunk that ends mid-sentence is almost worse than no chunk: retrieval still matches it on keywords, but the model gets a fragment and gets confused. Fixed-size chunking ("every 1000 chars") cuts blindly. Recursive splitting respects natural boundaries: paragraphs first, then sentences, then words.

**Shape (sketch — fill in the packing):**
```ts
const SEPARATORS = ["\n\n", "\n", ". ", " "];

function split(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const sep = SEPARATORS.find(s => text.includes(s)) ?? "";
  const parts = sep ? text.split(sep) : [...text]; // last resort: per-char
  // exercise: greedily pack `parts` (re-joined by sep) into chunks <= maxLen
  return [];
}
```

**Try this.** Take a 5-paragraph article. Chunk it three ways: every 200 chars, every paragraph, recursive-with-overlap. Pick a question the article answers — which chunking scheme produced a chunk that *cleanly contains* the answer?

**Pitfall.** Confusing characters with tokens. Models budget by tokens (1000 chars ≈ 200–500 tokens depending on content). Set your chunk budget in tokens, with a tokenizer.

---

## Lesson 12 — What an embedding is, intuitively

**The idea.** An embedding is a function from a string to a fixed-length list of numbers (e.g. 1024 floats), engineered so that strings with similar *meaning* land near each other in vector space. "Photosynthesis is how plants make food" and "Plants convert sunlight into sugar" share almost no words — keyword search misses the link, but their embeddings sit close together. That's the magic that lets RAG handle paraphrase.

**Shape:**
```ts
import { VoyageAIClient } from "voyageai";
const vy = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });

const res = await vy.embed({
  input: ["plants make sugar from sunlight"],
  model: "voyage-3-lite",
});
console.log(res.data[0].embedding.length);    // e.g. 1024
console.log(res.data[0].embedding.slice(0, 5)); // [0.013, -0.02, ...]
```

**Try this.** Embed three short sentences — two on the same topic, one unrelated. Compute pairwise cosine similarity (next lesson). Same-topic pairs should score noticeably higher (>0.7) than unrelated pairs (<0.4).

**Pitfall.** Treating embeddings as "the meaning." They're a projection engineered for retrieval. "I love this movie" and "I hate this movie" can sit close because topic + grammar dominate the signal. Embeddings retrieve; they don't reason.

---

## Lesson 13 — Cosine similarity in 11 lines

**The idea.** Cosine similarity measures *direction alignment* between two vectors, ignoring magnitude. 1.0 = same direction (most similar), 0.0 = perpendicular, -1.0 = opposite. For embeddings, direction encodes meaning, so cosine is what you want — not Euclidean distance.

```ts
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

That's the whole retrieval engine for v1. Top-k:
```ts
chunks
  .map(c => ({ c, score: cosine(qVec, c.vec) }))
  .sort((x, y) => y.score - x.score)
  .slice(0, k);
```

**Try this.** Hand-build `[1,0,0,0]`, `[0.9,0.1,0,0]`, `[0,0,0,1]`. The first pair scores ~0.99; first-and-third scores 0.0.

**Pitfall.** Comparing vectors from *different* embedding models. They're both "1024 floats," but they live in different spaces — the similarities are meaningless. Pick one model and store its name with every vector.

---

## Lesson 14 — The RAG loop, end-to-end

**The idea.** RAG is five steps. One at index time, four at query time.

1. **Index (per upload):** chunk → embed each chunk → store `{ text, vector, sourceMeta }`.
2. **Query A:** embed the user's question with *the same model*.
3. **Query B:** find top-k chunks by cosine similarity.
4. **Query C:** build a prompt with the chunks as context, then the question.
5. **Query D:** call Claude; return the answer.

**Prompt template that works:**
```
System: Answer ONLY using the context below. If the answer
isn't in the context, say "I don't know."

Context:
[1] {chunk 1 text}
[2] {chunk 2 text}
[3] {chunk 3 text}

Question: {user question}
```

**Shape:**
```ts
async function rag(question: string) {
  const qVec = await embed(question);
  const top  = retrieveTopK(qVec, store, 4);
  const ctx  = top.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
  const reply = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: "Answer ONLY using the context. Say 'I don't know' otherwise.",
    messages: [{ role: "user", content: `Context:\n${ctx}\n\nQ: ${question}` }],
  });
  return { reply, sources: top };
}
```

**Try this.** Don't call the LLM yet. Run steps 1–3 only. For five real questions about your notes, print the top-3 chunks each one retrieves. If the right chunks aren't surfacing, no prompt will save you — fix retrieval first. This separation is the single most useful debugging habit in RAG.

**Pitfall.** Embedding model mismatch between index time and query time. Bake the model name into every stored vector; assert it on every query.

---

## Lesson 15 — Citations: asking and parsing safely

**The idea.** Two halves: (a) get Claude to return citations in a parseable shape (JSON with chunk IDs), (b) validate them on your end. The trick is to label each chunk visibly in the prompt and require the model to reference those IDs. JSON beats prose footnotes — JSON is unambiguous; footnotes are a regex problem.

**Prompt fragment:**
```
Each context block is labeled [1], [2], [3].
Cite each claim by its number.
Respond with JSON only: { "answer": "...", "citations": [1, 3] }.
```

**Parsing:**
```ts
import { z } from "zod";

const Reply = z.object({
  answer: z.string(),
  citations: z.array(z.number().int().positive()),
});

const parsed = Reply.parse(JSON.parse(modelOutput));
const validIds = new Set(retrievedChunks.map((_, i) => i + 1));
const realCitations = parsed.citations.filter(id => validIds.has(id));
```

**Try this.** Hardcode three chunks `[1]`, `[2]`, `[3]` where the answer is *only* in chunk 2. Confirm the model returns `citations: [2]`. Then ask a question whose answer is in *no* chunk — confirm it returns `"I don't know"` and `citations: []`.

**Pitfall.** Trusting that a returned citation ID was actually *used*. You can verify the ID exists. You can't prove the model relied on it. Surface citations in the UI as "the model said it referenced this," with the chunk text underneath so the user can verify themselves.

---

## Lesson 16 — Topic tracking with an event log

**The idea.** "Progress tracking" sounds like it needs a database. It doesn't — it needs an append-only event log plus a `groupBy`. *What have I studied?* and *where do I look stuck?* both fall out of one flat array.

**Shape:**
```ts
type StudyEvent = {
  id: string;
  ts: number;
  subject: string;
  topic: string;
  question: string;
  retrievedChunkIds: string[];
  followUpOf?: string;   // previous event id, if user is drilling in
};
```

Append on every chat turn. Compute everything else at read time:
- `groupBy(events, e => e.topic)` → "what I've studied"
- count `followUpOf` chains by topic → "where I keep getting stuck"
- topics whose `max(ts)` is > 14 days ago → "due for review"

**Where does `topic` come from?** Two options:
1. Use the **subject tag** the user already attached to the doc. Free, but coarse — you'll know they asked 47 things about Linear Algebra, not which sub-topic.
2. Ask **Haiku** to classify each question into a topic from a small per-subject list. One cheap LLM call per question; finer granularity ("Eigenvalues" vs just "Linear Algebra").

Start with (1). Add (2) only after (1) feels too coarse.

**Try this.** Hand-author 10 fake `StudyEvent`s with realistic topics and timestamps. Write three functions: `topTopics`, `weakSpots`, `dueForReview`. You'll discover 90% of the "progress tab" is one good `Map`/`reduce`.

**Pitfall.** Calling something a "weak spot" too confidently. Three questions on a topic in a week might mean confusion — or might mean *that's the chapter the user is studying this week*. Surface weak spots as a soft hint, not a verdict.

---

## How to use this

- **Read a lesson, then write the StudyMate version yourself.** Snippets are shapes, not solutions.
- **Do the "try this" exercises.** They're calibrated to expose the misunderstanding before it costs you a phase.
- **Loop back.** When you start a phase, re-read the matching lesson. First read builds intuition; second read with a real bug builds skill.
