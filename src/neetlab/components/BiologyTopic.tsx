import type { ReactNode } from "react";
import { TopicShell } from "./TopicShell";
import { SketchfabEmbed } from "./SketchfabEmbed";
import { sketchfabModels, type ModelKey } from "../data/models";
import { MitosisAnim, DNAReplicationAnim, DNAHelixAnim, MeiosisAnim, PhotosynthesisAnim, BloodCellsAnim } from "../sims/BiologyAnims";
import { biologyTopics } from "../data/topics";

const NOTES: Record<string, ReactNode> = {
  dna: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Two antiparallel polynucleotide strands.</li>
      <li>A–T (2 H-bonds), G–C (3 H-bonds).</li>
      <li>Right-handed B-DNA: 10 bp per turn, pitch 3.4 nm.</li>
      <li>Sugar–phosphate backbone outside, bases inside.</li>
    </ul>
  ),
  heart: (
    <ul className="space-y-2 list-disc pl-4">
      <li>4 chambers: 2 atria + 2 ventricles.</li>
      <li>Right side → pulmonary; left side → systemic circuit.</li>
      <li>Valves: tricuspid, bicuspid, semilunars.</li>
      <li>SA node sets the pace (~72 bpm at rest).</li>
    </ul>
  ),
  neuron: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Dendrites receive; axon transmits.</li>
      <li>Myelin (Schwann / oligodendrocytes) speeds conduction.</li>
      <li>Saltatory conduction at Nodes of Ranvier.</li>
      <li>Synaptic terminals release neurotransmitters.</li>
    </ul>
  ),
  brain: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Cerebrum: thought, voluntary action (frontal, parietal, temporal, occipital lobes).</li>
      <li>Cerebellum: balance and coordination.</li>
      <li>Brainstem: medulla, pons, midbrain — vital reflexes.</li>
      <li>Grey matter outside, white matter inside.</li>
    </ul>
  ),
  lungs: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Right lung: 3 lobes; Left lung: 2 lobes + cardiac notch.</li>
      <li>Trachea → bronchi → bronchioles → alveoli.</li>
      <li>Gas exchange across alveolar–capillary membrane.</li>
      <li>Surfactant lowers alveolar surface tension.</li>
    </ul>
  ),
  skeleton: (
    <ul className="space-y-2 list-disc pl-4">
      <li>206 bones — axial (skull, ribs, vertebrae) + appendicular.</li>
      <li>Joints: fibrous, cartilaginous, synovial.</li>
      <li>Vertebral formula: 7-12-5-5-4.</li>
      <li>Marrow inside long bones makes blood cells.</li>
    </ul>
  ),
  cell: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Nucleus stores DNA; nucleolus makes ribosomes.</li>
      <li>Mitochondria → ATP via oxidative phosphorylation.</li>
      <li>Rough ER + ribosomes → protein synthesis.</li>
      <li>Golgi packages; lysosomes digest.</li>
    </ul>
  ),
  kidney: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Outer cortex, inner medulla, renal pelvis funnels urine.</li>
      <li>Nephron = functional unit (~1 million per kidney).</li>
      <li>Filtration in glomerulus; selective reabsorption in tubules.</li>
      <li>ADH and aldosterone fine-tune water and Na⁺.</li>
    </ul>
  ),
  mitosis: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Prophase → Metaphase → Anaphase → Telophase → Cytokinesis.</li>
      <li>Sister chromatids separate at the centromere in anaphase.</li>
      <li>Spindle = microtubules from centrosomes.</li>
      <li>Result: 2 genetically identical daughter cells (2n → 2n).</li>
    </ul>
  ),
  replication: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Helicase unwinds; polymerase synthesises 5′ → 3′.</li>
      <li>Leading strand: continuous. Lagging: Okazaki fragments.</li>
      <li>Base pairing: A=T (2H), G≡C (3H).</li>
      <li>Semiconservative — each daughter keeps one parental strand.</li>
    </ul>
  ),
};

const MODEL_FOR: Partial<Record<string, ModelKey>> = {
  heart: "heart",
  neuron: "neuron",
  brain: "brain",
  lungs: "lungs",
  skeleton: "skeleton",
  cell: "cell",
  kidney: "kidney",
  ear: "ear",
  spinalCord: "spinalCord",
  mouth: "mouth",
  tooth: "tooth",
  humanCell: "humanCell",
  cardiacCell: "cardiacCell",
  chloroplast: "chloroplast",
  simpleCell: "simpleCell",
  influenza: "influenza",
  covid: "covid",
  sperm: "sperm",
};

export function BioTopic({ topic }: { topic: string }) {
  const t = biologyTopics.find((x) => x.slug === topic);
  if (!t) return <div className="p-6 text-sm text-muted-foreground">Topic not found.</div>;
  const renderBody = () => {
    if (topic === "dna") return <DNAHelixAnim />;
    if (topic === "mitosis") return <MitosisAnim />;
    if (topic === "meiosis") return <MeiosisAnim />;
    if (topic === "replication") return <DNAReplicationAnim />;
    if (topic === "photosynthesis") return <PhotosynthesisAnim />;
    if (topic === "blood") return <BloodCellsAnim />;
    const key = MODEL_FOR[topic];
    if (key) return <SketchfabEmbed model={sketchfabModels[key]} />;
    return null;
  };
  return (
    <TopicShell subject="biology" title={t.title} tag={t.tag} blurb={t.blurb} notes={NOTES[topic]}>
      {renderBody()}
    </TopicShell>
  );
}
