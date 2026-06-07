# CLAUDE.md — StudyMate

## What this project is
A RAG-based study app where users upload notes/PDFs and chat with Claude. Answers are grounded in the user's own documents with inline citations. Built as a learning project for an AI internship.

---

## PHASE DISCIPLINE — READ THIS FIRST

**This project is built phase-by-phase. You must follow the active phase exactly — no more, no less.**

Rules you must never break:
- Never implement anything from a future phase unless the user explicitly says "start Phase N."
- Never refactor, generalize, or add "nice to haves" beyond the phase spec.
- Never skip a step within a phase — every bullet in the phase spec is required.
- When a phase is complete, stop and wait. Do not begin the next phase on your own.
- If a feature is listed in a later phase (e.g. streaming is Phase 8), do not add it early.

When the user says **"start Phase N"** or **"we're on Phase N"**, work only within that phase's scope below. If unsure which phase is active, ask.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One project for frontend + API routes |
| Styling | Tailwind CSS | No CSS system from scratch; shadcn/ui optional in Phase 8 |
| Claude SDK | `@anthropic-ai/sdk` | Never call Anthropic from the browser |
| Main model | `claude-sonnet-4-6` | All chat and answers |
| Background model | `claude-haiku-4-5-20251001` | Topic classification only (Phase 7) |
| PDF parsing | `pdf-parse` | Upgrade to `pdfjs-dist` only if layout breaks |
| Embeddings | OpenAI — `text-embedding-3-small` via `openai` npm package | Pick once, never switch; re-embedding is expensive |
| Vector storage | Supabase pgvector | Cosine similarity via `<=>` operator; pgvector extension enabled in Supabase |
| Database | Supabase (Postgres) | All persistent data — conversations, documents, chunks, study events |
| Validation | `zod` | Claude's JSON outputs + browser input |
| Deployment | Vercel | Free tier; keys as project env vars |

---

## Key Constraints (always active, every phase)

- API keys live in `.env.local` — never use `NEXT_PUBLIC_` prefix on any secret.
- All Claude and OpenAI calls go through Next.js route handlers. The browser calls `/api/...`; those handlers call external APIs.
- Browser must never contact `api.anthropic.com` or `api.openai.com` directly. Verify in DevTools → Network.
- Always store the embedding model name with every stored vector; assert it matches at query time.
- All persistent data lives in Supabase — no localStorage for any app data. localStorage is banned.
- All Supabase calls go through server-side route handlers. Never instantiate the Supabase client in browser code.

---

## Phase 1 — Base Claude Chat

**Done when:** User can type a message, hit send, get a Claude reply, and the full conversation history is preserved across turns.

Steps:
1. Create `/api/chat` route handler — calls Claude, returns the reply.
2. Add `useState` for the input field and message list.
3. On send: append user message, POST to `/api/chat`, append Claude reply.
4. Pass full message history to Claude each turn (stateful conversation).
5. Add basic error handling (catch fetch errors, show error state in UI).
6. Confirm in DevTools that the browser only calls `/api/chat`, never `api.anthropic.com`.

Do not add: streaming, PDF upload, embeddings, localStorage persistence, or any UI polish beyond a working input + message list.

---

## Phase 1.5 — Swap Conversation Storage to Supabase

**When to do this:** After Phase 1 is fully working and tested. Before starting Phase 2.

**Done when:** Conversation history is persisted in a Supabase Postgres table instead of in-memory React state, and the chat still works identically from the user's perspective.

Steps:
1. Create a Supabase project. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `.env.local` — server-side only, no `NEXT_PUBLIC_` prefix.
2. Install `@supabase/supabase-js`. Create a server-side Supabase client in a shared lib file (e.g. `lib/supabase.ts`) — never instantiate the client in a route handler inline.
3. Create a `conversations` table in Supabase:
   ```sql
   create table conversations (
     id uuid primary key default gen_random_uuid(),
     session_id text not null,
     role text not null,        -- 'user' or 'assistant'
     content text not null,
     created_at timestamptz default now()
   );
   ```
4. On every POST to `/api/chat`:
   - Accept a `sessionId` from the request body.
   - Load prior messages for that `sessionId` from Supabase (ordered by `created_at`).
   - Append the new user message, call Claude with full history, get the reply.
   - Write both the user message and assistant reply to Supabase.
   - Return the reply.
5. On the client, generate a stable `sessionId` (e.g. `crypto.randomUUID()` stored in `useState` — one per page load is fine for now) and include it in every POST body.
6. Confirm the chat history survives a full page refresh (because it's now in Supabase, not React state).

Do not add: user auth, multiple named sessions, a sessions list UI, or row-level security — those belong in a later polish pass.

---

## Phase 2 — PDF Upload & Extract

**Done when:** User can upload a `.pdf`, `.md`, or `.txt` file, see the extracted text in a preview, and the document is saved to Supabase.

Steps:
1. Create a `documents` table in Supabase: `{ id uuid, session_id text, subject text, title text, text text, date timestamptz }`.
2. Create `/api/extract` route that accepts a PDF body and returns extracted text using `pdf-parse`.
3. Support `.md` / `.txt` via `FileReader` / `file.text()` — no server route needed.
4. Create `/api/documents` POST route — saves the document record to Supabase and returns the saved document with its `id`.
5. Show an extracted text preview (debug feature — confirm clean extraction before chunking).
6. Detect scanned PDFs (no text layer): show a message asking the user to paste text instead.

Do not add: chunking, embedding, vector storage, or chat integration.

---

## Phase 2.5 — Swap Document Storage to Supabase

**When to do this:** After Phase 2 is fully working and tested. Before starting Phase 3.

**Done when:** Documents are persisted in a Supabase Postgres table instead of localStorage, and upload/view/delete still work identically from the user's perspective.

Steps:
1. Create a `documents` table in Supabase:
   ```sql
   create table documents (
     id uuid primary key default gen_random_uuid(),
     session_id text not null,
     subject text not null,
     title text not null,
     text text not null,
     date timestamptz default now()
   );
   ```
2. Create `/api/documents` route handler with two methods:
   - `GET ?sessionId=` — returns all documents for that session ordered by date.
   - `POST` — accepts `{ sessionId, subject, title, text }`, inserts a row, returns the saved document with its `id`.
3. Add `DELETE ?id=` to `/api/documents` — deletes a document by id.
4. Update the documents page: remove all `localStorage` usage; on mount fetch from `GET /api/documents`, on save call `POST /api/documents`, on delete call `DELETE /api/documents`.
5. Reuse the same `sessionId` from `sessionStorage` that the chat page uses (same key: `studymate_session_id`).
6. Confirm documents survive a full page refresh.

Do not add: chunking, embedding, chunk deletion, or any changes to the chat flow.

---

## Phase 3 — Chunk & Embed

**Done when:** When a document is saved, it is chunked, each chunk is embedded, and all chunks are stored in Supabase with their metadata and vectors.

Steps:
1. Enable the `pgvector` extension in Supabase: run `create extension if not exists vector;` in the SQL editor.
2. Create a `chunks` table in Supabase:
   ```sql
   create table chunks (
     id uuid primary key default gen_random_uuid(),
     document_id uuid not null references documents(id) on delete cascade,
     position int not null,
     content text not null,
     embedding vector(1536),
     embedding_model text not null,
     created_at timestamptz default now()
   );
   ```
3. Write a recursive splitter: split at `\n\n` → `\n` → `. ` → ` ` boundaries; greedily pack small pieces back together so no chunk is needlessly short.
4. Budget chunk size in tokens (approximate: 1 token ≈ 4 chars for English, or build a simple counter).
5. Create an embed proxy route `/api/embed` — accepts a string, calls OpenAI `text-embedding-3-small`, returns the vector.
6. Wire into the upload flow: after a document is saved, chunk it, embed each chunk, insert all chunks into Supabase.
7. Tag every chunk with: source document ID, position index, embedding model name (`"text-embedding-3-small"`).
8. When a document is re-uploaded (same ID), delete all prior chunks for that document before inserting new ones (cascade handles this if document is deleted and re-inserted).

Do not add: retrieval, RAG, chat integration, or citations.

---

## Phase 4 — Retrieval & RAG

**Done when:** User's question is answered using only the content of their uploaded documents, with chunks retrieved via pgvector similarity search.

Steps:
1. Create a Supabase RPC function for similarity search:
   ```sql
   create or replace function match_chunks(query_embedding vector(1536), match_count int, p_session_id text)
   returns table(id uuid, document_id uuid, content text, similarity float)
   language sql stable as $$
     select c.id, c.document_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
     from chunks c
     join documents d on d.id = c.document_id
     where d.session_id = p_session_id
     order by c.embedding <=> query_embedding
     limit match_count;
   $$;
   ```
2. Update the chat flow:
   - Embed the user's question via `/api/embed`.
   - Call the `match_chunks` RPC to retrieve top-k chunks from Supabase.
   - Build a prompt with numbered context blocks: `[1] chunk text`, `[2] chunk text`, etc.
   - Instruct Claude to answer **only** from the provided context; if the answer is not there, say "I don't know."
3. Run debugging tests: for 5 real questions about your notes, log the top-3 chunks retrieved. Confirm the right chunks appear before worrying about the Claude answer.

Do not add: citations, structured JSON output, progress tracking, or streaming.

---

## Phase 5 — Citations

**Done when:** Every Claude answer includes citation markers that point back to the exact chunks it used, and hallucinated citation IDs are filtered out.

Steps:
1. Update the system prompt: label each context block visibly (`[1]`, `[2]`, ...) and instruct Claude to return JSON only: `{ "answer": string, "citations": number[] }`.
2. Parse Claude's output with `JSON.parse`, validate the shape with Zod: `z.object({ answer: z.string(), citations: z.array(z.number().int().positive()) })`.
3. Filter returned citation IDs against IDs that were actually retrieved — discard any ID not in the retrieved set.
4. Render inline citation markers in the answer UI.
5. Render a citation panel beneath each answer showing chunk text and source document title.
6. Test cases to confirm before marking done:
   - Model does not invent a citation ID outside the retrieved set.
   - When the answer is not in any chunk, model returns `"I don't know"` and `citations: []`.

Do not add: streaming, progress tracking, or clicking/scrolling to highlight chunks (that is optional and for Phase 8 if at all).

---

## Phase 6 — Progress Tracking

**Done when:** A dedicated progress page shows top topics, weak spots, and topics due for review, derived from a Supabase event log.

Steps:
1. Create a `study_events` table in Supabase:
   ```sql
   create table study_events (
     id uuid primary key default gen_random_uuid(),
     session_id text not null,
     subject text not null,
     topic text not null,
     question text not null,
     retrieved_chunk_ids uuid[],
     follow_up_of uuid references study_events(id),
     created_at timestamptz default now()
   );
   ```
2. After every successful chat turn, POST to a `/api/study-events` route that inserts a row into Supabase.
3. Derive `topic` from the subject tag on the source document (start here — do not call Haiku until this feels too coarse).
4. Create a `/api/progress` route that reads from Supabase and returns three aggregations:
   - `topTopics`: group events by topic, count occurrences.
   - `weakSpots`: topics that appear 3+ times in the past 7 days.
   - `dueForReview`: topics whose most recent event timestamp is >14 days ago.
5. Render as a table (no chart needed in v1).
6. Surface weak spots and due-for-review as soft hints — not verdicts.
7. Add a navigation bar linking chat, documents, and progress pages.
8. Optional (only if step 3 feels too coarse): add one Haiku call per question to classify sub-topics from a small list.

Do not add: streaming, chart libraries, or links to outside resources.

---

## Phase 7 — Polish & Deploy

**Done when:** Chat streams, all UI states are handled, layout is mobile-responsive, and the app is deployed on Vercel.

Steps:
1. Convert chat to streaming: replace `messages.create` with `messages.stream`; read the response body chunk-by-chunk and append each piece to React state.
2. Add UI states: loading (spinner or skeleton), empty (prompt to upload a doc), error (display message, allow retry).
3. Style the full app: focus on layout, spacing, contrast, and mobile responsiveness.
4. Push final code to GitHub `main`.
5. Deploy via Vercel; add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` as project environment variables.

---

## How to work with this file

- The active phase is whatever the user last said. When unsure, ask: "Which phase are we on?"
- Treat each phase's step list as a checklist. Mark off steps as they are completed.
- Snippets from the MINI_COURSE are shapes — understand them, then write the StudyMate version yourself.
- When a phase's "Done when" condition is met, stop and report what was built. Wait for the user to move forward.
