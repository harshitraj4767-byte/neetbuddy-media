/**
 * Sketchfab model registry.
 *
 * Every entry is a publicly listed Sketchfab model whose author chose a
 * Creative Commons license. CC-BY allows reuse (including embedding) with
 * attribution to the author. The Sketchfab iframe shows the author and
 * license badge automatically; we also surface them on the /license page.
 *
 * If a model becomes unavailable, replace the `uid` with another CC-licensed
 * model from the same author or a similar one and update the metadata.
 */
export interface SketchfabModel {
  uid: string;
  title: string;
  author: string;
  authorUrl?: string;
  license: "CC BY 4.0" | "CC BY-SA 4.0" | "CC BY-ND 4.0" | "CC0 1.0";
  licenseUrl: string;
  sourceUrl: string;
  /** Short note on what NEET topic this supports. */
  topic: string;
}

const CC_BY = {
  license: "CC BY 4.0" as const,
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

const sf = (uid: string) =>
  `https://sketchfab.com/3d-models/${uid}`;
const sfUser = (u: string) => `https://sketchfab.com/${u}`;

export const sketchfabModels = {
  // ── Biology ──────────────────────────────────────────────────────────
  dna: {
    uid: "60e95170b37549e3b45ee490b74bb112",
    title: "DNA",
    author: "Holoxica",
    authorUrl: sfUser("holoxica"),
    sourceUrl: sf("dna-60e95170b37549e3b45ee490b74bb112"),
    topic: "DNA double helix",
    ...CC_BY,
  },
  heart: {
    uid: "3f8072336ce94d18b3d0d055a1ece089",
    title: "Realistic Human Heart",
    author: "neshallads",
    authorUrl: sfUser("neshallads"),
    sourceUrl: sf("realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089"),
    topic: "Human heart anatomy",
    ...CC_BY,
  },
  neuron: {
    uid: "11fc6dbcc1594e9a806601bb7480f315",
    title: "Neuronal Cell Environment",
    author: "ryannsoup",
    authorUrl: sfUser("ryannsoup"),
    sourceUrl: sf("neuronal-cell-environment-11fc6dbcc1594e9a806601bb7480f315"),
    topic: "Neuron & nervous tissue",
    ...CC_BY,
  },
  brain: {
    uid: "0aa0e33c5c854d1bab7bac9e1c7acaec",
    title: "Human brain — Cerebrum & Brainstem",
    author: "FrankJohansson",
    authorUrl: sfUser("FrankJohansson"),
    sourceUrl: sf("human-brain-cerebrum-brainstem-0aa0e33c5c854d1bab7bac9e1c7acaec"),
    topic: "Human brain",
    ...CC_BY,
  },
  lungs: {
    uid: "ce09f4099a68467880f46e61eb9a3531",
    title: "Realistic Human Lungs",
    author: "neshallads",
    authorUrl: sfUser("neshallads"),
    sourceUrl: sf("realistic-human-lungs-ce09f4099a68467880f46e61eb9a3531"),
    topic: "Respiratory system",
    ...CC_BY,
  },
  skeleton: {
    uid: "4de7b96a351a4a35b1b6e5415277ff07",
    title: "Skeleton",
    author: "Diego Luján García",
    authorUrl: sfUser("diegolujangarcia"),
    sourceUrl: sf("skeleton-4de7b96a351a4a35b1b6e5415277ff07"),
    topic: "Human skeletal system",
    ...CC_BY,
  },
  cell: {
    uid: "0d9f7f4257224975b2ef83a283709b2f",
    title: "Animal cell 2.0 — annotated",
    author: "montanna",
    authorUrl: sfUser("montanna"),
    sourceUrl: sf("animal-cell-20-annotated-in-english-0d9f7f4257224975b2ef83a283709b2f"),
    topic: "Animal cell organelles",
    ...CC_BY,
  },
  kidney: {
    uid: "e1476ceb1e3b4412af5418eee9c5ed08",
    title: "Human Kidney",
    author: "neshallads",
    authorUrl: sfUser("neshallads"),
    sourceUrl: sf("human-kidney-e1476ceb1e3b4412af5418eee9c5ed08"),
    topic: "Excretory system",
    ...CC_BY,
  },

  // ── Biology (additions) ─────────────────────────────────────────────
  ear: {
    uid: "02a919413aa84e9ea47622a2c8e45864",
    title: "Ear Set",
    author: "alexlashko",
    authorUrl: sfUser("alexlashko"),
    sourceUrl: sf("ear-set-02a919413aa84e9ea47622a2c8e45864"),
    topic: "Human ear — sense organs",
    ...CC_BY,
  },
  spinalCord: {
    uid: "5d39455bf3c040a6ba3ab030b7b46890",
    title: "Cauda Equina",
    author: "aandp",
    authorUrl: sfUser("aandp"),
    sourceUrl: sf("cauda-equina-4-22-5d39455bf3c040a6ba3ab030b7b46890"),
    topic: "Spinal cord — neural control",
    ...CC_BY,
  },
  mouth: {
    uid: "522eda0ec0e3413a914b1b298a791320",
    title: "Human Mouth — detailed",
    author: "Mince",
    authorUrl: sfUser("mince"),
    sourceUrl: sf("human-mouth-detailed-522eda0ec0e3413a914b1b298a791320"),
    topic: "Buccal cavity & teeth",
    ...CC_BY,
  },
  tooth: {
    uid: "e5ddce218ebc4d16b45b057a418c0c56",
    title: "Tooth",
    author: "BYTHO",
    authorUrl: sfUser("BYTHO"),
    sourceUrl: sf("tooth-e5ddce218ebc4d16b45b057a418c0c56"),
    topic: "Human tooth anatomy",
    ...CC_BY,
  },
  humanCell: {
    uid: "60ef7d2515b0403986ff9e8b7f234a66",
    title: "Human Cell",
    author: "markdragan",
    authorUrl: sfUser("markdragan"),
    sourceUrl: sf("human-cell-60ef7d2515b0403986ff9e8b7f234a66"),
    topic: "Human cell — organelles",
    ...CC_BY,
  },
  cardiacCell: {
    uid: "16e33d3b0be74b4c800cb7601fb51dd2",
    title: "Cardiac Muscle Cell Anatomy",
    author: "_Bonehead14",
    authorUrl: sfUser("_Bonehead14"),
    sourceUrl: sf("cardiac-muscle-cell-anatomy-16e33d3b0be74b4c800cb7601fb51dd2"),
    topic: "Cardiac muscle tissue",
    ...CC_BY,
  },
  chloroplast: {
    uid: "30bc55b2f763415f9222f876c564be97",
    title: "Chloroplast",
    author: "arloopa",
    authorUrl: sfUser("arloopa"),
    sourceUrl: sf("chloroplast-30bc55b2f763415f9222f876c564be97"),
    topic: "Chloroplast — photosynthesis",
    ...CC_BY,
  },
  simpleCell: {
    uid: "839832a82ead4d9ea3a748f48fd5de88",
    title: "Simple Animal Cell Model",
    author: "maryk",
    authorUrl: sfUser("maryk"),
    sourceUrl: sf("simple-animal-cell-model-839832a82ead4d9ea3a748f48fd5de88"),
    topic: "Animal cell — simplified",
    ...CC_BY,
  },
  influenza: {
    uid: "b3ef4264dbcf4d59a75b3c551484fc96",
    title: "Influenza Virus",
    author: "GLS",
    authorUrl: sfUser("GLS"),
    sourceUrl: sf("influenza-virus-b3ef4264dbcf4d59a75b3c551484fc96"),
    topic: "Influenza virus structure",
    ...CC_BY,
  },
  covid: {
    uid: "01c083362df04291bd0ba380fb299838",
    title: "Covid 19 Virus",
    author: "Invictus_fulgur",
    authorUrl: sfUser("Invictus_fulgur"),
    sourceUrl: sf("covid-19-virus-01c083362df04291bd0ba380fb299838"),
    topic: "SARS-CoV-2 virus",
    ...CC_BY,
  },
  sperm: {
    uid: "af340f33a8574d60a65fa008233ad934",
    title: "Sperm Cell",
    author: "plaggy",
    authorUrl: sfUser("plaggy"),
    sourceUrl: sf("cc0-sperm-af340f33a8574d60a65fa008233ad934"),
    topic: "Human sperm — reproduction",
    ...CC_BY,
  },

  // ── Chemistry ────────────────────────────────────────────────────────
  water: {
    uid: "e181944932084b5dbb4d5b625a5e9b10",
    title: "H₂O Molecule",
    author: "Mehdi Mirzaie",
    authorUrl: sfUser("mehdimirzaie"),
    sourceUrl: sf("h2o-molecule-e181944932084b5dbb4d5b625a5e9b10"),
    topic: "Water molecule geometry",
    ...CC_BY,
  },
  methane: {
    uid: "6e09c1451691443cb520e8ff18bfe5c1",
    title: "Tetrahedral structure of Methane",
    author: "dubey.ujjwal1994",
    authorUrl: sfUser("dubey.ujjwal1994"),
    sourceUrl: sf("tetrahedral-structure-of-methane-6e09c1451691443cb520e8ff18bfe5c1"),
    topic: "Methane (CH₄) geometry",
    ...CC_BY,
  },
  benzene: {
    uid: "7fc04cef71174d93893db16e364768f5",
    title: "Benzene",
    author: "teachersmapd",
    authorUrl: sfUser("teachersmapd"),
    sourceUrl: sf("chemistry-benzene-7fc04cef71174d93893db16e364768f5"),
    topic: "Benzene ring (aromatic)",
    ...CC_BY,
  },
  atom: {
    uid: "27cd36666c3c4b7cafa9600d80618601",
    title: "Atomic Models",
    author: "arloopa",
    authorUrl: sfUser("arloopa"),
    sourceUrl: sf("atomic-models-27cd36666c3c4b7cafa9600d80618601"),
    topic: "Atomic structure & orbitals",
    ...CC_BY,
  },

  // ── Chemistry (additions) ───────────────────────────────────────────
  ethanol: {
    uid: "6348a279cdfd49eebbc0b9edbbfba186",
    title: "Ethanol",
    author: "edumol",
    authorUrl: sfUser("edumol"),
    sourceUrl: sf("ethanol-6348a279cdfd49eebbc0b9edbbfba186"),
    topic: "Ethanol (C₂H₅OH)",
    ...CC_BY,
  },
  ethanolHbond: {
    uid: "12b339385a184119a27585df101fe77f",
    title: "Hydrogen bond between ethanol and water",
    author: "justusmutanen",
    authorUrl: sfUser("justusmutanen"),
    sourceUrl: sf("hydrogen-bond-between-ethanol-and-water-molecule-12b339385a184119a27585df101fe77f"),
    topic: "Hydrogen bonding — ethanol & water",
    ...CC_BY,
  },
  ethane: {
    uid: "01003f579d3141d1a9bbde2a4da2cda6",
    title: "Ethane — Molecular form",
    author: "dubey.ujjwal1994",
    authorUrl: sfUser("dubey.ujjwal1994"),
    sourceUrl: sf("ethane-molecular-form-01003f579d3141d1a9bbde2a4da2cda6"),
    topic: "Ethane (C₂H₆) geometry",
    ...CC_BY,
  },
  ammonia: {
    uid: "3bf39744ac28431782c02d754f1216ff",
    title: "Ammonia Molecule Model",
    author: "sthele",
    authorUrl: sfUser("sthele"),
    sourceUrl: sf("ammonia-molecule-model-3bf39744ac28431782c02d754f1216ff"),
    topic: "Ammonia (NH₃) pyramidal",
    ...CC_BY,
  },
  ammoniaHbond: {
    uid: "75ca5674a6a4472cb9eec6e4b8df09d5",
    title: "Ammonia and hydrogen bonds",
    author: "justusmutanen",
    authorUrl: sfUser("justusmutanen"),
    sourceUrl: sf("ammonia-and-hydrogen-bonds-75ca5674a6a4472cb9eec6e4b8df09d5"),
    topic: "Hydrogen bonding in ammonia",
    ...CC_BY,
  },
  glucose: {
    uid: "2b4c96af7c0c41debf1bd654c1103a00",
    title: "Glucose Molecule",
    author: "brutebandit",
    authorUrl: sfUser("brutebandit"),
    sourceUrl: sf("glucose-molecule-2b4c96af7c0c41debf1bd654c1103a00"),
    topic: "Glucose (C₆H₁₂O₆)",
    ...CC_BY,
  },
  insulinHexamer: {
    uid: "edc74af45a7840368dce61db86c57930",
    title: "Human Insulin Hexamer Molecular Structure",
    author: "sduce",
    authorUrl: sfUser("sduce"),
    sourceUrl: sf("human-insulin-hexamer-molecular-structure-edc74af45a7840368dce61db86c57930"),
    topic: "Insulin hexamer — biomolecule",
    ...CC_BY,
  },
  insulinMonomer: {
    uid: "d5e97a4e04194cc9878404a6b43e7362",
    title: "Human Insulin Monomer Molecular Structure",
    author: "sduce",
    authorUrl: sfUser("sduce"),
    sourceUrl: sf("human-insulin-monomer-molecular-structure-d5e97a4e04194cc9878404a6b43e7362"),
    topic: "Insulin monomer — biomolecule",
    ...CC_BY,
  },
  maltose: {
    uid: "5d76df25af1449d4baececae85bc133d",
    title: "Maltose",
    author: "arloopa",
    authorUrl: sfUser("arloopa"),
    sourceUrl: sf("maltose-5d76df25af1449d4baececae85bc133d"),
    topic: "Maltose disaccharide",
    ...CC_BY,
  },
} satisfies Record<string, SketchfabModel>;

export type ModelKey = keyof typeof sketchfabModels;

export const allModels: SketchfabModel[] = Object.values(sketchfabModels);
