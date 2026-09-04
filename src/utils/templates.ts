export interface BookTemplate {
  id: 'blank' | 'novel' | 'memoir' | 'short_story' | 'poetry' | 'journal' | 'screenplay';
  name: string;
  genre: string;
  description: string;
  badge: string;
  chapters: {
    title: string;
    content: string;
  }[];
}

export const BOOK_TEMPLATES: BookTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Book',
    genre: 'General',
    description: 'A clean slate with an empty initial chapter.',
    badge: '1 Chapter',
    chapters: [
      {
        title: 'Chapter 1: The Beginning',
        content: '<p>Every great story begins with a single word...</p>',
      },
    ],
  },
  {
    id: 'novel',
    name: 'Novel',
    genre: 'Fiction',
    description: 'Structured novel format with three sequential chapters to start your narrative arc.',
    badge: '3 Chapters',
    chapters: [
      {
        title: 'Chapter 1',
        content: '<p>The morning light broke through the quiet stillness...</p>',
      },
      {
        title: 'Chapter 2',
        content: '<p></p>',
      },
      {
        title: 'Chapter 3',
        content: '<p></p>',
      },
    ],
  },
  {
    id: 'memoir',
    name: 'Autobiography / Memoir',
    genre: 'Memoir',
    description: 'Chronological life narrative from early origins to personal turning points.',
    badge: '5 Sections',
    chapters: [
      {
        title: 'Introduction',
        content: '<p>Looking back across the years, memory is not a straight line but a mosaic of moments...</p>',
      },
      {
        title: 'Chapter 1 — Early Years',
        content: '<p></p>',
      },
      {
        title: 'Chapter 2 — My Journey',
        content: '<p></p>',
      },
      {
        title: 'Chapter 3 — Turning Points',
        content: '<p></p>',
      },
      {
        title: 'Chapter 4 — Where I Am Now',
        content: '<p></p>',
      },
    ],
  },
  {
    id: 'short_story',
    name: 'Short Story',
    genre: 'Short Fiction',
    description: 'Classic four-part narrative arc designed for focused short fiction.',
    badge: '4 Parts',
    chapters: [
      {
        title: 'Beginning',
        content: '<p>It started on an ordinary afternoon when everything changed...</p>',
      },
      {
        title: 'Rising Action',
        content: '<p></p>',
      },
      {
        title: 'Climax',
        content: '<p></p>',
      },
      {
        title: 'Resolution',
        content: '<p></p>',
      },
    ],
  },
  {
    id: 'poetry',
    name: 'Poetry',
    genre: 'Poetry',
    description: 'Verse and stanza collection layout for poems and lyrical writings.',
    badge: '3 Poems',
    chapters: [
      {
        title: 'Poem 1',
        content: '<p>In the silence between breaths,<br>words take flight.</p>',
      },
      {
        title: 'Poem 2',
        content: '<p></p>',
      },
      {
        title: 'Poem 3',
        content: '<p></p>',
      },
    ],
  },
  {
    id: 'journal',
    name: 'Journal',
    genre: 'Journal',
    description: 'Reflective daily entries and chronological thought logs.',
    badge: '3 Entries',
    chapters: [
      {
        title: 'Entry 1',
        content: '<p>Today was a reminder of why we write...</p>',
      },
      {
        title: 'Entry 2',
        content: '<p></p>',
      },
      {
        title: 'Entry 3',
        content: '<p></p>',
      },
    ],
  },
  {
    id: 'screenplay',
    name: 'Screenplay',
    genre: 'Screenplay',
    description: 'Standard cinematic script format beginning with Fade In and opening scenes.',
    badge: '4 Scenes',
    chapters: [
      {
        title: 'FADE IN:',
        content: '<p>EXT. CITY STREET - DUSK<br><br>Rain slicks the asphalt. Neon reflections shimmer in puddles.</p>',
      },
      {
        title: 'Scene 1',
        content: '<p>INT. COFFEE SHOP - CONTINUOUS</p>',
      },
      {
        title: 'Scene 2',
        content: '<p></p>',
      },
      {
        title: 'Scene 3',
        content: '<p></p>',
      },
    ],
  },
];
