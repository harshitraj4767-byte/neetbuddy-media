export type Subject = "biology" | "physics" | "chemistry";

export interface Topic {
  slug: string;
  title: string;
  blurb: string;
  tag: string;
}

export const biologyTopics: Topic[] = [
  { slug: "dna", title: "DNA Double Helix", blurb: "Inspect antiparallel strands and base-pair geometry in a true 3D model.", tag: "Genetics" },
  { slug: "heart", title: "Human Heart", blurb: "Photoreal anatomical heart — chambers, vessels and great arteries.", tag: "Human Physiology" },
  { slug: "neuron", title: "Neuronal Cell Environment", blurb: "Soma, dendrites, axons and synaptic terminals in a tissue setting.", tag: "Neural Control" },
  { slug: "brain", title: "Human Brain", blurb: "Cerebrum, cerebellum and brainstem — rotate to study lobes and gyri.", tag: "Neural Control" },
  { slug: "lungs", title: "Human Lungs", blurb: "Bronchial tree and lobes of the respiratory system.", tag: "Breathing & Exchange" },
  { slug: "skeleton", title: "Human Skeleton", blurb: "Full axial + appendicular skeleton for bone identification.", tag: "Locomotion" },
  { slug: "cell", title: "Animal Cell — Annotated", blurb: "Labelled organelles: nucleus, mitochondria, ER, Golgi, lysosomes.", tag: "Cell Structure" },
  { slug: "kidney", title: "Human Kidney", blurb: "Cortex, medulla and renal pelvis of the excretory system.", tag: "Excretion" },
  { slug: "mitosis", title: "Mitosis — Cell Division", blurb: "Step through prophase to cytokinesis with chromosomes you can scrub.", tag: "Cell Cycle" },
  { slug: "replication", title: "DNA Replication", blurb: "Helicase, polymerase and semiconservative base pairing in motion.", tag: "Molecular Biology" },
  { slug: "ear", title: "Human Ear", blurb: "External, middle and inner ear — the receptor of sound.", tag: "Sense Organs" },
  { slug: "spinalCord", title: "Spinal Cord — Cauda Equina", blurb: "Spinal nerves emerging from the conus medullaris.", tag: "Neural Control" },
  { slug: "mouth", title: "Human Mouth & Teeth", blurb: "Buccal cavity, dentition and tongue — start of digestion.", tag: "Digestion" },
  { slug: "tooth", title: "Human Tooth", blurb: "Enamel, dentine and pulp — anatomy of a single tooth.", tag: "Digestion" },
  { slug: "humanCell", title: "Human Cell — Detailed", blurb: "A photoreal view of organelles inside a human cell.", tag: "Cell Structure" },
  { slug: "cardiacCell", title: "Cardiac Muscle Cell", blurb: "Striated cardiomyocyte with intercalated discs and mitochondria.", tag: "Animal Tissues" },
  { slug: "chloroplast", title: "Chloroplast", blurb: "Thylakoids, grana and stroma — the site of photosynthesis.", tag: "Photosynthesis" },
  { slug: "simpleCell", title: "Animal Cell — Simple", blurb: "A clean cutaway view of a generalised animal cell.", tag: "Cell Structure" },
  { slug: "influenza", title: "Influenza Virus", blurb: "HA and NA glycoproteins on an enveloped RNA virus.", tag: "Microbiology" },
  { slug: "covid", title: "SARS-CoV-2 Virus", blurb: "Spike-decorated coronavirus — structure of COVID-19.", tag: "Microbiology" },
  { slug: "sperm", title: "Human Sperm Cell", blurb: "Head, midpiece and flagellum of a male gamete.", tag: "Reproduction" },
  { slug: "meiosis", title: "Meiosis & Crossing-Over", blurb: "Two divisions, four haploid gametes — with chiasma swap visible.", tag: "Cell Cycle" },
  { slug: "photosynthesis", title: "Photosynthesis", blurb: "Light + CO₂ + H₂O → glucose + O₂ inside a chloroplast.", tag: "Plant Physiology" },
  { slug: "blood", title: "Blood Cells in a Vessel", blurb: "RBCs, WBCs and platelets streaming through a blood vessel.", tag: "Body Fluids" },
];

export const physicsTopics: Topic[] = [
  { slug: "projectile", title: "Projectile Motion", blurb: "Tune angle, speed and gravity. Watch trajectory and velocity vector.", tag: "Mechanics" },
  { slug: "tension", title: "Tension & Pulley", blurb: "Atwood machine — integrates real acceleration; rests when balanced.", tag: "Newton's Laws" },
  { slug: "pendulum", title: "Simple Pendulum", blurb: "Numerical SHM with damping. Period vs length and gravity.", tag: "Oscillations" },
  { slug: "circular", title: "Uniform Circular Motion", blurb: "See velocity (tangent) and centripetal acceleration vectors in real time.", tag: "Mechanics" },
  { slug: "rotation", title: "Rotational Motion", blurb: "Torque → angular acceleration on a disc. τ = Iα.", tag: "Rigid Body" },
  { slug: "spring", title: "Spring SHM (with damping)", blurb: "Mass on a spring — tune k, m, A and damping b. ω = √(k/m).", tag: "Oscillations" },
  { slug: "incline", title: "Inclined Plane with Friction", blurb: "Block on a ramp — see N, f, and net a = g(sinθ − μcosθ).", tag: "Newton's Laws" },
  { slug: "collision", title: "1-D Collisions (e adjustable)", blurb: "Two balls — elastic ↔ inelastic. Check momentum & KE.", tag: "Work, Energy, Power" },
  { slug: "lens", title: "Thin Lens (Convex & Concave)", blurb: "Ray diagram, focal length and magnification for converging/diverging lenses.", tag: "Ray Optics" },
  { slug: "mirror", title: "Spherical Mirror", blurb: "Concave & convex mirror image formation with F, C and magnification.", tag: "Ray Optics" },
  { slug: "ohms", title: "Ohm's Law Circuit", blurb: "Tune V and R — see current, power and animated charge flow.", tag: "Current Electricity" },
];

export const chemistryTopics: Topic[] = [
  { slug: "atom", title: "Atomic Structure", blurb: "Rotate atomic models — nucleus, shells and electron orbitals.", tag: "Structure of Atom" },
  { slug: "water", title: "Water Molecule (H₂O)", blurb: "Bent geometry and bond angle of the most important molecule in biology.", tag: "Chemical Bonding" },
  { slug: "methane", title: "Methane (CH₄)", blurb: "Perfect tetrahedral geometry — 109.5° bond angles.", tag: "Hybridisation" },
  { slug: "benzene", title: "Benzene Ring", blurb: "Planar aromatic ring with delocalised π electrons.", tag: "Aromatic Chemistry" },
  { slug: "titration", title: "Acid–Base Titration", blurb: "NaOH into HCl with phenolphthalein. Find the endpoint.", tag: "Ionic Equilibrium" },
  { slug: "combustion", title: "Combustion of Methane", blurb: "CH₄ + 2O₂ → CO₂ + 2H₂O — animated molecular view.", tag: "Hydrocarbons" },
  { slug: "electrolysis", title: "Electrolysis of Water", blurb: "Watch H₂ and O₂ collect at the electrodes.", tag: "Electrochemistry" },
  { slug: "reactions", title: "Reaction Quiz — Predict the Product", blurb: "Practice organic reactions. Wrong picks explain why.", tag: "Organic Chemistry" },
  { slug: "ethanol", title: "Ethanol (C₂H₅OH)", blurb: "Hydroxyl-bearing alcohol — rotate to see the C–O–H angle.", tag: "Alcohols" },
  { slug: "ethanolHbond", title: "Ethanol–Water Hydrogen Bond", blurb: "How alcohols dissolve in water through O–H···O bonds.", tag: "Intermolecular Forces" },
  { slug: "ethane", title: "Ethane (C₂H₆)", blurb: "The simplest C–C single bond — staggered conformation.", tag: "Alkanes" },
  { slug: "ammonia", title: "Ammonia (NH₃)", blurb: "Trigonal pyramidal molecule with one lone pair on N.", tag: "Chemical Bonding" },
  { slug: "ammoniaHbond", title: "Ammonia Hydrogen Bonding", blurb: "Why NH₃ boils high — N–H···N hydrogen bonds in 3D.", tag: "Intermolecular Forces" },
  { slug: "glucose", title: "Glucose (C₆H₁₂O₆)", blurb: "Pyranose ring of the key biological fuel molecule.", tag: "Biomolecules" },
  { slug: "insulinHexamer", title: "Insulin — Hexamer", blurb: "Six insulin monomers assembled around two Zn²⁺ ions.", tag: "Biomolecules" },
  { slug: "insulinMonomer", title: "Insulin — Monomer", blurb: "A single insulin molecule — A and B peptide chains.", tag: "Biomolecules" },
  { slug: "maltose", title: "Maltose", blurb: "A disaccharide of two α-glucose units linked α-1,4.", tag: "Biomolecules" },
  { slug: "labGame", title: "🧪 Reaction Lab — Drag & Drop Game", blurb: "Pick the right reagent and drop it in. Wrong choice = BOOM!", tag: "Game" },
];

export const subjects = {
  biology:   { title: "Biology",   topics: biologyTopics,   accent: "from-blue-500 to-sky-400",   desc: "Photoreal 3D anatomy and animated processes for NEET biology." },
  physics:   { title: "Physics",   topics: physicsTopics,   accent: "from-blue-600 to-indigo-500", desc: "Physics-driven simulations you can tweak in real time." },
  chemistry: { title: "Chemistry", topics: chemistryTopics, accent: "from-sky-500 to-blue-500",    desc: "Molecular 3D models, virtual lab reactions and a self-test." },
} as const;
