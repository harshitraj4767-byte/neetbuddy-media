export type MascotMood =
  | "waving"
  | "happy"
  | "thinking"
  | "idea"
  | "studying"
  | "thumbs-up"
  | "excited"
  | "confident"
  | "shocked"
  | "pointing"
  | "coffee-break"
  | "working"
  | "calm"
  | "bored"
  | "grateful";

export interface MascotPose {
  mood: MascotMood;
  src: string;
  /** Short human label, useful for pickers / admin UIs. */
  label: string;
  /** Alt text for accessibility. */
  alt: string;
  /** Searchable synonyms so you can look up a pose by feeling. */
  tags: string[];
}

export const MASCOT_NAME = "Dr. Catalyst";

export const MASCOT_POSES: Record<MascotMood, MascotPose> = {
  waving: {
    mood: "waving",
    src: "/catalyst/dr-catalyst-waving.webp?v=catalyst_v2",
    label: "Waving",
    alt: "Dr. Catalyst waving hello",
    tags: ["hello", "hi", "welcome", "greeting", "onboarding", "friendly"],
  },
  happy: {
    mood: "happy",
    src: "/catalyst/dr-catalyst-happy.webp?v=catalyst_v2",
    label: "Happy",
    alt: "Dr. Catalyst smiling happily",
    tags: ["happy", "good", "cheerful", "smile", "positive", "cute"],
  },
  thinking: {
    mood: "thinking",
    src: "/catalyst/dr-catalyst-thinking.webp?v=catalyst_v2",
    label: "Thinking",
    alt: "Dr. Catalyst thinking with question marks",
    tags: ["thinking", "confused", "doubt", "question", "hmm", "why", "help"],
  },
  idea: {
    mood: "idea",
    src: "/catalyst/dr-catalyst-idea.webp?v=catalyst_v2",
    label: "Idea",
    alt: "Dr. Catalyst with a lightbulb idea",
    tags: ["idea", "tip", "hint", "explanation", "aha", "insight", "solution"],
  },
  studying: {
    mood: "studying",
    src: "/catalyst/dr-catalyst-studying.webp?v=catalyst_v2",
    label: "Studying",
    alt: "Dr. Catalyst writing notes in a book",
    tags: ["studying", "notes", "writing", "revision", "reading", "focus"],
  },
  "thumbs-up": {
    mood: "thumbs-up",
    src: "/catalyst/dr-catalyst-thumbs-up.webp?v=catalyst_v2",
    label: "Thumbs up",
    alt: "Dr. Catalyst giving a thumbs up",
    tags: ["thumbs up", "correct", "well done", "approve", "success", "good job"],
  },
  excited: {
    mood: "excited",
    src: "/catalyst/dr-catalyst-excited.webp?v=catalyst_v2",
    label: "Excited",
    alt: "Dr. Catalyst cheering excitedly",
    tags: ["excited", "love", "loved", "celebrate", "streak", "reward", "win"],
  },
  confident: {
    mood: "confident",
    src: "/catalyst/dr-catalyst-confident.webp?v=catalyst_v2",
    label: "Confident",
    alt: "Dr. Catalyst standing confidently with sunglasses",
    tags: ["confident", "ready", "strong", "challenge", "test", "serious"],
  },
  shocked: {
    mood: "shocked",
    src: "/catalyst/dr-catalyst-shocked.webp?v=catalyst_v2",
    label: "Shocked",
    alt: "Dr. Catalyst looking shocked",
    tags: ["shocked", "tensed", "surprised", "oops", "wrong", "error", "warning"],
  },
  pointing: {
    mood: "pointing",
    src: "/catalyst/dr-catalyst-pointing.webp?v=catalyst_v2",
    label: "Pointing",
    alt: "Dr. Catalyst pointing to the side",
    tags: ["pointing", "look here", "guide", "tour", "attention", "callout"],
  },
  "coffee-break": {
    mood: "coffee-break",
    src: "/catalyst/dr-catalyst-coffee-break.webp?v=catalyst_v2",
    label: "Coffee break",
    alt: "Dr. Catalyst taking a coffee break",
    tags: ["break", "coffee", "rest", "pause", "chill", "relax"],
  },
  working: {
    mood: "working",
    src: "/catalyst/dr-catalyst-working.webp?v=catalyst_v2",
    label: "Working",
    alt: "Dr. Catalyst working on a laptop",
    tags: ["working", "loading", "processing", "analysis", "practice", "laptop"],
  },
  calm: {
    mood: "calm",
    src: "/catalyst/dr-catalyst-calm.webp?v=catalyst_v2",
    label: "Calm",
    alt: "Dr. Catalyst feeling calm and relaxed",
    tags: ["calm", "relax", "peace", "breathe", "stress free", "meditation"],
  },
  bored: {
    mood: "bored",
    src: "/catalyst/dr-catalyst-bored.webp?v=catalyst_v2",
    label: "Bored",
    alt: "Dr. Catalyst resting tiredly on textbooks",
    tags: ["bored", "tired", "sleepy", "empty state", "waiting", "lazy"],
  },
  grateful: {
    mood: "grateful",
    src: "/catalyst/dr-catalyst-grateful.webp?v=catalyst_v2",
    label: "Grateful",
    alt: "Dr. Catalyst expressing appreciation",
    tags: ["thank you", "grateful", "love", "heart", "appreciation", "kind"],
  },
};

export const MASCOT_POSE_LIST: MascotPose[] = Object.values(MASCOT_POSES);

/** Get a pose image by mood, falling back to the happy pose. */
export function mascot(mood: MascotMood): MascotPose {
  return MASCOT_POSES[mood] ?? MASCOT_POSES.happy;
}

/** Find poses by a free-text feeling, e.g. "tensed" or "good". */
export function findMascotPoses(query: string): MascotPose[] {
  const q = query.trim().toLowerCase();
  if (!q) return MASCOT_POSE_LIST;
  return MASCOT_POSE_LIST.filter(
    (p) =>
      p.mood.includes(q) ||
      p.label.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q)),
  );
}
