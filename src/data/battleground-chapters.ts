// Deterministic per-subject chapter rotation. Chapter switches every hour;
// all users see the same chapter within an hour (seeded by UTC hour slot).

export type BattleSubject = "Physics" | "Chemistry" | "Biology";

export const SUBJECT_CHAPTERS: Record<BattleSubject, string[]> = {
  Physics: [
    "Units & Measurements",
    "Kinematics",
    "Laws of Motion",
    "Work, Energy & Power",
    "Rotational Motion",
    "Gravitation",
    "Thermodynamics",
    "Oscillations & Waves",
    "Electrostatics",
    "Current Electricity",
    "Magnetism",
    "Electromagnetic Induction",
    "Ray Optics",
    "Wave Optics",
    "Modern Physics",
    "Semiconductor Electronics",
  ],
  Chemistry: [
    "Some Basic Concepts of Chemistry",
    "Structure of Atom",
    "Chemical Bonding",
    "States of Matter",
    "Thermodynamics",
    "Equilibrium",
    "Redox Reactions",
    "Solutions",
    "Electrochemistry",
    "Chemical Kinetics",
    "Coordination Compounds",
    "Haloalkanes & Haloarenes",
    "Alcohols, Phenols & Ethers",
    "Aldehydes, Ketones & Carboxylic Acids",
    "Amines",
    "Biomolecules",
  ],
  Biology: [
    "The Living World",
    "Biological Classification",
    "Plant Kingdom",
    "Animal Kingdom",
    "Morphology of Flowering Plants",
    "Anatomy of Flowering Plants",
    "Structural Organisation in Animals",
    "Cell: The Unit of Life",
    "Cell Cycle & Division",
    "Photosynthesis in Higher Plants",
    "Respiration in Plants",
    "Plant Growth & Development",
    "Digestion & Absorption",
    "Breathing & Exchange of Gases",
    "Body Fluids & Circulation",
    "Excretory Products",
    "Locomotion & Movement",
    "Neural Control & Coordination",
    "Chemical Coordination & Integration",
    "Sexual Reproduction in Flowering Plants",
    "Human Reproduction",
    "Reproductive Health",
    "Principles of Inheritance & Variation",
    "Molecular Basis of Inheritance",
    "Evolution",
    "Human Health & Disease",
    "Microbes in Human Welfare",
    "Biotechnology: Principles & Processes",
    "Biotechnology & its Applications",
    "Ecosystem",
    "Biodiversity & Conservation",
  ],
};

const HOUR_MS = 60 * 60 * 1000;

export function getSubjectRotation(subject: BattleSubject, now = Date.now()) {
  const chapters = SUBJECT_CHAPTERS[subject];
  const slot = Math.floor(now / HOUR_MS);
  // Offset each subject so subjects don't rotate to index 0 simultaneously.
  const offset = { Physics: 0, Chemistry: 5, Biology: 11 }[subject];
  const idx = ((slot + offset) % chapters.length + chapters.length) % chapters.length;
  return {
    subject,
    chapter: chapters[idx],
    index: idx,
    nextChangeAt: (slot + 1) * HOUR_MS,
  };
}
