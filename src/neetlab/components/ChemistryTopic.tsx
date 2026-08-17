import type { ReactNode } from "react";
import { TopicShell } from "./TopicShell";
import { SketchfabEmbed } from "./SketchfabEmbed";
import { sketchfabModels, type ModelKey } from "../data/models";
import { TitrationSim, CombustionSim, ElectrolysisSim } from "../sims/ChemSims";
import { ReactionQuiz } from "../sims/ReactionQuiz";
import { ChemLabGame } from "../sims/ChemLabGame";
import { chemistryTopics } from "../data/topics";

const MODEL_FOR: Partial<Record<string, ModelKey>> = {
  water: "water",
  methane: "methane",
  benzene: "benzene",
  atom: "atom",
  ethanol: "ethanol",
  ethanolHbond: "ethanolHbond",
  ethane: "ethane",
  ammonia: "ammonia",
  ammoniaHbond: "ammoniaHbond",
  glucose: "glucose",
  insulinHexamer: "insulinHexamer",
  insulinMonomer: "insulinMonomer",
  maltose: "maltose",
};

const NOTES: Record<string, ReactNode> = {
  atom: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Nucleus: protons + neutrons; electrons in shells.</li>
      <li>Bohr → quantum mechanical model (orbitals).</li>
      <li>s, p, d, f orbitals — distinct shapes and energies.</li>
      <li>Aufbau, Pauli, Hund control filling order.</li>
    </ul>
  ),
  water: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Bent (V-shape), bond angle ≈ 104.5°.</li>
      <li>sp³ hybridised oxygen with 2 lone pairs.</li>
      <li>Polar molecule — strong hydrogen bonding.</li>
      <li>High boiling point, universal solvent.</li>
    </ul>
  ),
  methane: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Tetrahedral geometry — bond angle 109.5°.</li>
      <li>sp³ hybridised carbon, 4 σ C–H bonds.</li>
      <li>Non-polar; primary natural gas constituent.</li>
      <li>Combustion: CH₄ + 2O₂ → CO₂ + 2H₂O.</li>
    </ul>
  ),
  benzene: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Planar regular hexagon, all C–C 139 pm.</li>
      <li>Six delocalised π electrons (4n+2, n=1).</li>
      <li>Aromatic — undergoes electrophilic substitution.</li>
      <li>Resonance hybrid of two Kekulé structures.</li>
    </ul>
  ),
  titration: (
    <ul className="space-y-2 list-disc pl-4">
      <li>HCl + NaOH → NaCl + H₂O</li>
      <li>Phenolphthalein: colourless ↔ pink (pH 8.2–10).</li>
      <li>At equivalence, moles acid = moles base.</li>
      <li>Strong acid + strong base ⇒ pH 7 at endpoint.</li>
    </ul>
  ),
  combustion: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Balanced: CH₄ + 2 O₂ → CO₂ + 2 H₂O.</li>
      <li>Exothermic, ΔH ≈ −890 kJ/mol.</li>
      <li>Complete combustion needs excess O₂.</li>
      <li>Incomplete combustion produces CO and soot.</li>
    </ul>
  ),
  electrolysis: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Cathode (−): 2 H⁺ + 2 e⁻ → H₂</li>
      <li>Anode (+): 2 H₂O → O₂ + 4 H⁺ + 4 e⁻</li>
      <li>Volume ratio H₂ : O₂ = 2 : 1.</li>
      <li>Add a little H₂SO₄ to improve conductivity.</li>
    </ul>
  ),
  reactions: (
    <ul className="space-y-2 list-disc pl-4">
      <li>Five named reactions covered.</li>
      <li>Pick the product — wrong picks explain the misconception.</li>
      <li>Mechanism summary appears after each answer.</li>
      <li>Reset to retake; questions reshuffle.</li>
    </ul>
  ),
};

export function ChemTopic({ topic }: { topic: string }) {
  const t = chemistryTopics.find((x) => x.slug === topic);
  if (!t) return <div className="p-6 text-sm text-muted-foreground">Topic not found.</div>;
  const renderBody = () => {
    const key = MODEL_FOR[topic];
    if (key) return <SketchfabEmbed model={sketchfabModels[key]} />;
    if (topic === "titration") return <TitrationSim />;
    if (topic === "combustion") return <CombustionSim />;
    if (topic === "electrolysis") return <ElectrolysisSim />;
    if (topic === "labGame") return <ChemLabGame />;
    return <ReactionQuiz />;
  };
  return (
    <TopicShell subject="chemistry" title={t.title} tag={t.tag} blurb={t.blurb} notes={NOTES[topic]}>
      {renderBody()}
    </TopicShell>
  );
}
