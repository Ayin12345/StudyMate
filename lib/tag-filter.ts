const GENERIC_BLOCKLIST = new Set([
  'notes', 'note', 'general notes', 'class notes', 'lecture notes',
  'document', 'documents', 'general', 'text', 'file', 'study',
  'study notes', 'lecture', 'class', 'course', 'homework', 'assignment',
  'reading', 'chapter', 'section', 'pdf', 'handout', 'review',
  'summary', 'overview', 'misc', 'miscellaneous', 'other', 'untitled',
]);

export function isStudiableTopic(tag: string): boolean {
  const n = tag.toLowerCase().trim();
  return n.length > 1 && !GENERIC_BLOCKLIST.has(n);
}

export function pickTopic(tags: string[]): { subject: string; topic: string } {
  const meaningful = tags.filter(isStudiableTopic);
  const subject = meaningful[0] ?? tags[0] ?? 'General';
  const topic = meaningful[1] ?? meaningful[0] ?? tags[0] ?? 'General';
  return { subject, topic };
}

// Maps a study event's specific tag (`subject`/`topic`) back to the broad
// supertag of the document it came from (e.g. "Data Structures" -> "Computer Science").
// Falls back to the event's own `supertag` column, then the tag itself.
export function buildSupertagResolver(docs: { tags: string[]; supertag: string | null }[]) {
  const tagToSupertag = new Map<string, string>();
  for (const d of docs) {
    if (!d.supertag) continue;
    for (const t of d.tags ?? []) {
      if (!tagToSupertag.has(t)) tagToSupertag.set(t, d.supertag);
    }
  }
  return (e: { subject: string; topic: string; supertag?: string | null }): string =>
    tagToSupertag.get(e.subject) ?? tagToSupertag.get(e.topic) ?? e.supertag ?? e.subject ?? "General";
}

export function classifyQuestion(question: string): { confusionScore: number; questionType: string } {
  const q = question.toLowerCase();
  const isConfusion = /\b(confused|don'?t (understand|get)|not sure|unclear|struggling|lost|help me understand|can you (explain|clarify))\b/.test(q);
  const isWhy = /\bwhy\b/.test(q);
  const isHow = /\bhow\b/.test(q);
  const isCompare = /\b(compare|difference|differ|vs\.?|versus|contrast|between)\b/.test(q);
  const isWhat = /\bwhat\b/.test(q);

  const confusionScore = isConfusion ? 2 : (isWhy || isHow) ? 1 : 0;
  const questionType = isConfusion ? 'confusion'
    : isCompare ? 'compare'
    : isWhy ? 'why'
    : isHow ? 'how'
    : isWhat ? 'recall'
    : 'general';

  return { confusionScore, questionType };
}
