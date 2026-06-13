export interface StudyDocument {
  id: string;
  supertag: string | null;
  tags: string[];
  title: string;
  text: string;
  date: string; // ISO string
}
