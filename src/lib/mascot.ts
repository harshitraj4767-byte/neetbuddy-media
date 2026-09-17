import { mediaAsset } from "@/lib/media-assets";

const waving = mediaAsset("src/assets/mascot/dr-vanshu-waving.webp");
const happy = mediaAsset("src/assets/mascot/dr-vanshu-happy.webp");
const thinking = mediaAsset("src/assets/mascot/dr-vanshu-thinking.webp");
const idea = mediaAsset("src/assets/mascot/dr-vanshu-idea.webp");
const studying = mediaAsset("src/assets/mascot/dr-vanshu-studying.webp");
const thumbsUp = mediaAsset("src/assets/mascot/dr-vanshu-thumbs-up.webp");
const excited = mediaAsset("src/assets/mascot/dr-vanshu-excited.webp");
const confident = mediaAsset("src/assets/mascot/dr-vanshu-confident.webp");
const shocked = mediaAsset("src/assets/mascot/dr-vanshu-shocked.webp");
const pointing = mediaAsset("src/assets/mascot/dr-vanshu-pointing.webp");
const coffeeBreak = mediaAsset("src/assets/mascot/dr-vanshu-coffee-break.webp");
const working = mediaAsset("src/assets/mascot/dr-vanshu-working.webp");
const calm = mediaAsset("src/assets/mascot/dr-vanshu-calm.webp");
const bored = mediaAsset("src/assets/mascot/dr-vanshu-bored.webp");
const grateful = mediaAsset("src/assets/mascot/dr-vanshu-grateful.webp");


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

export const MASCOT_NAME = "Dr. Vanshu";

export const MASCOT_POSES: Record<MascotMood, MascotPose> = {
  waving: {
    mood: "waving",
    src: waving,
    label: "Waving",
    alt: "Dr. Vanshu waving hello",
    tags: ["hello", "hi", "welcome", "greeting", "onboarding", "friendly"],
  },
  happy: {
    mood: "happy",
    src: happy,
    label: "Happy",
    alt: "Dr. Vanshu smiling happily",
    tags: ["happy", "good", "cheerful", "smile", "positive", "cute"],
  },
  thinking: {
    mood: "thinking",
    src: thinking,
    label: "Thinking",
    alt: "Dr. Vanshu thinking with question marks",
    tags: ["thinking", "confused", "doubt", "question", "hmm", "why", "help"],
  },
  idea: {
    mood: "idea",
    src: idea,
    label: "Idea",
    alt: "Dr. Vanshu with a lightbulb idea",
    tags: ["idea", "tip", "hint", "explanation", "aha", "insight", "solution"],
  },
  studying: {
    mood: "studying",
    src: studying,
    label: "Studying",
    alt: "Dr. Vanshu writing notes in a book",
    tags: ["studying", "notes", "writing", "revision", "reading", "focus"],
  },
  "thumbs-up": {
    mood: "thumbs-up",
    src: thumbsUp,
    label: "Thumbs up",
    alt: "Dr. Vanshu giving a thumbs up",
    tags: ["thumbs up", "correct", "well done", "approve", "success", "good job"],
  },
  excited: {
    mood: "excited",
    src: excited,
    label: "Excited",
    alt: "Dr. Vanshu hugging books with hearts",
    tags: ["excited", "love", "loved", "celebrate", "streak", "reward", "hearts"],
  },
  confident: {
    mood: "confident",
    src: confident,
    label: "Confident",
    alt: "Dr. Vanshu standing confidently with arms crossed",
    tags: ["confident", "ready", "strong", "challenge", "test", "serious"],
  },
  shocked: {
    mood: "shocked",
    src: shocked,
    label: "Shocked",
    alt: "Dr. Vanshu looking shocked and tensed",
    tags: ["shocked", "tensed", "surprised", "oops", "wrong", "error", "warning"],
  },
  pointing: {
    mood: "pointing",
    src: pointing,
    label: "Pointing",
    alt: "Dr. Vanshu pointing to the side",
    tags: ["pointing", "look here", "guide", "tour", "attention", "callout"],
  },
  "coffee-break": {
    mood: "coffee-break",
    src: coffeeBreak,
    label: "Coffee break",
    alt: "Dr. Vanshu holding a NEET coffee cup",
    tags: ["break", "coffee", "rest", "pause", "chill", "relax"],
  },
  working: {
    mood: "working",
    src: working,
    label: "Working",
    alt: "Dr. Vanshu working on a laptop",
    tags: ["working", "loading", "processing", "analysis", "practice", "laptop"],
  },
  calm: {
    mood: "calm",
    src: calm,
    label: "Calm",
    alt: "Dr. Vanshu meditating calmly",
    tags: ["calm", "relax", "peace", "breathe", "stress free", "meditation"],
  },
  bored: {
    mood: "bored",
    src: bored,
    label: "Bored",
    alt: "Dr. Vanshu resting on a stack of textbooks",
    tags: ["bored", "tired", "sleepy", "empty state", "waiting", "lazy"],
  },
  grateful: {
    mood: "grateful",
    src: grateful,
    label: "Grateful",
    alt: "Dr. Vanshu making a heart with her hands",
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
