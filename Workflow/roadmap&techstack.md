StudyMate Project Details
1. Code Setup:
Create Github repository with all necessary README files
Access and store relevant API keys (Anthropic for Claude, Voyage or OpenAI text embedding)
2. Base: Claude API Chat (text first):
Create simple chat feature with input field
POST request to receive text field first
Add useState and call input + message list
On send, append reply to a list so full message history is saved each turn
Store history, so it becomes stateless (remembers history)
Add error handling
Confirm browser hits /api/ to make sure right call is being made & not on website
3. Upload PDF & extract:
Building on top of phase 2
Create route that accepts PDF body and returns text
Two paths (get files to be read as text directly)
.md/.txt
Already text, read through FileReader or file.text()
.pdf
Pdf-parse Node library
Turns binary PDF into text and returns string
Create Document shape (id, subject, title, text, date) 
Can add additional fields later, only necessary now
Be able to see extracted text preview (debug feature to make sure everything is right before chunking)
Make sure cleanly extracted in the beginning
Detect scanned PDF 
Store data in localStorage as JSON-encoded array
4. Chunk & Embed: 
Split text into pieces then turn each into a vector, each carries numeric fingerprint
Help minimize claude’s context window
Specific retrieval
Create recursive splitter to chunk big strings into array of them 
First split at natural boundaries (paragraph->line->sentence->word breaks)
Then if possible pack small pieces back together (if chuncked too much)
Count in tokens (maybe 4, not too sure maybe build tokenizer later instead of approximation)
Get Voyage proxy running
Server route to return text/string into a vector
Wire into upload flow 
When Document saved: chunk, embed, store
Embed after saving to ensure doc is always saved
Tag each chunk with its source document ID, position within document, and name of embedding model used
Make sure prior chunks are removed when re-uploading document
Make sure chunks are read as complete, self-contained pieces
5. Retrieval & RAG
Connect chat interface to user’s documents with embedding-based retrieval
Answers grounded in their own notes
Implement a cosine similarity function that compares 2 vectors
Returns score between -1 and 1
Top-k retrieval helper that scores every stored chunk against query vector and returns highest-scoring few
Update chat flow: 
User submits question, embed question, retrieve top chunks, send both to Claude
Construct prompt to include numbered context blocks (will see how many exactly later with testing)
Claude answers only from provided context (Ensure doesn’t make anything up
Run debugging tests to make sure Claude doesn’t hallucinate
6. Citations
Every answer should point back to specific chunk it came from
Update system prompt so Claude returns JSON object of form {answer: string, citations: number[] }
Use Zod to validate parsed JSON against expected shape (use the open source library)
Filter returned citation Id against ID actually retrieved to make sure AI doesn’t hallucinate
In UI, render inline citation markers as well as display citation panel beneath each answer with chunk text and source document title
Clicking one scrolls or highlights matching chunk?
Test cases
Model doensn’t invent citation ID
7. Progress Tracking
Create dedicated page that tracks studying patterns 
Topics, how often, where they question most or appear to struggle most
Define shape of event: id, timestamp, subject, topic, question text, retrieved chunk ID, follow-up reference for chained questions
After every successful chat turn, append new StudyEvent to flat array in localStorage
How to derive each event topic: use subject tag attached to source document
Build aggregations on event log
Top topics: group events by topic and count occurrences
Weak spots: Topics that appear 3+ times in past 7 days (arbitrary numbers, look more into detail later)
Due for review: Topics whose timestamp is a while ago (if still relevant)
Render as a sortable table (maybe chart later)
Present weak spots and due for review as flags rather than verdicts
Possibly link to other helpful sources (if user specifically flags certain topics)
Add navigation bar linking chat, documents, progress pages
8. Polish & Commit
Convert chat response to streaming response to tokens appear as claude generates them
Replace messages.create with messages.stream
Read response body chunk by chunk and append each piece to active message
Add remaining UI states: loading, empy, error
Style rest of page as needed: focus onlayout, spacing, contrast, and mobile responsiveness
Push final code to GitHub main branch
Deploy via Vercel?


StudyMate Tech Stack
Framework: Next.js (App Router) + TypeScript
Holds the React frontend and the server routes that talk to Claude in one project
TypeScript catches shape mismatches between chunks, vectors, and citations as they pass between layers
Without it, would need a separate backend just to keep the API keys off the browser
Styling: Tailwind CSS
Utility classes mean a usable UI without designing a CSS system from scratch
Optional later: shadcn/ui for pre-styled components built on Tailwind
Claude SDK: @anthropic-ai/sdk (official TypeScript SDK)
Type-safe wrapper around the Anthropic API with first-class streaming
Models used:
claude-sonnet-4-6 → main chat and answers
claude-haiku-4-5 → cheap background tasks (topic classification in Phase 6)
PDF Parsing: pdf-parse
Simple Node library, returns extracted text as a string
Fine for v1; upgrade to pdfjs-dist later if layout (columns, headings) becomes an issue
Scanned PDFs have no text layer — no parser will help, just detect and ask user to paste
Chunking: Recursive splitter
Splits at natural boundaries first (paragraph → line → sentence → word)
Token-based budget rather than character count
No external library — easier to write directly
Embeddings: OpenAI text-embedding
Anthropic's recommended embeddings partner
Strong retrieval quality at low cost
Pick once and stick with it — switching providers means re-embedding every chunk
Vector Storage (v1): In-memory + localStorage
Load all vectors into a JS array on page load
Compute cosine similarity in a simple loop (~11 lines)
Works for thousands of chunks before hitting the ~5MB localStorage ceiling
Upgrade path for v2: SQLite + sqlite-vec, or Supabase (Postgres + pgvector)
Validation: Zod
Parses untrusted JSON from the browser and from Claude's structured outputs
Throws cleanly when the shape is wrong instead of failing silently
Used heavily in Phase 5 for citation parsing
Deployment: Vercel or nohting???
Native Next.js host with zero-config deploys from GitHub
Add the Anthropic and Voyage API keys as project environment variables
Free tier covers a personal study app

