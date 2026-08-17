import { TopicShell } from "./TopicShell";
import {
  ProjectileSim, TensionSim, PendulumSim, CircularMotionSim, RotationalMotionSim,
  SpringSHMSim, InclinedPlaneSim, CollisionSim,
  LensSim, MirrorSim, OhmsLawSim,
} from "../sims/PhysicsSims";
import { physicsTopics } from "../data/topics";

export function PhyTopic({ topic }: { topic: string }) {
  const t = physicsTopics.find((x) => x.slug === topic);
  if (!t) return <div className="p-6 text-sm text-muted-foreground">Topic not found.</div>;

  const Sim =
    topic === "projectile" ? ProjectileSim :
    topic === "tension"    ? TensionSim :
    topic === "pendulum"   ? PendulumSim :
    topic === "circular"   ? CircularMotionSim :
    topic === "spring"     ? SpringSHMSim :
    topic === "incline"    ? InclinedPlaneSim :
    topic === "collision"  ? CollisionSim :
    topic === "lens"       ? LensSim :
    topic === "mirror"     ? MirrorSim :
    topic === "ohms"       ? OhmsLawSim :
    RotationalMotionSim;

  const notes = topic === "projectile" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>R = u² sin(2θ) / g</li>
      <li>H = u² sin²θ / 2g</li>
      <li>T = 2u sinθ / g</li>
      <li>Max range at θ = 45°.</li>
    </ul>
  ) : topic === "tension" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>a = (m₂ − m₁)g / (m₁ + m₂)</li>
      <li>T = 2 m₁ m₂ g / (m₁ + m₂)</li>
      <li>When m₁ = m₂ ⇒ a = 0 (system at rest).</li>
      <li>Assumes massless, inextensible string; frictionless pulley.</li>
    </ul>
  ) : topic === "pendulum" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>T = 2π √(L/g) for small angles.</li>
      <li>Numerical ODE: θ̈ = −(g/L) sin θ − b·θ̇.</li>
      <li>Independent of mass (ideal pendulum).</li>
    </ul>
  ) : topic === "circular" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>v = ωr (tangential speed).</li>
      <li>aᶜ = v²/r = ω²r (always toward centre).</li>
      <li>Fᶜ = m·aᶜ — supplied by tension/gravity/normal.</li>
      <li>Period T = 2π/ω, frequency f = 1/T.</li>
    </ul>
  ) : topic === "spring" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>F = −kx; ω = √(k/m); T = 2π √(m/k).</li>
      <li>Energy: ½kA² shared between KE and PE.</li>
      <li>With damping b, amplitude decays as e<sup>−bt</sup>.</li>
    </ul>
  ) : topic === "incline" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>Normal N = mg cosθ.</li>
      <li>Friction f = μN = μmg cosθ.</li>
      <li>Net a = g(sinθ − μ cosθ) down the incline.</li>
      <li>Block stays at rest if tanθ ≤ μₛ.</li>
    </ul>
  ) : topic === "collision" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>Momentum conserved: m₁u₁ + m₂u₂ = m₁v₁ + m₂v₂.</li>
      <li>Coefficient of restitution e = (v₂ − v₁) / (u₁ − u₂).</li>
      <li>Elastic (e = 1): KE conserved. Perfectly inelastic (e = 0): bodies stick.</li>
    </ul>
  ) : topic === "lens" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>Lens formula: 1/v − 1/u = 1/f (Cartesian sign convention).</li>
      <li>Magnification m = v/u = h'/h.</li>
      <li>Convex (f &gt; 0): converging. Concave (f &lt; 0): always virtual, erect, diminished.</li>
      <li>Power P = 1/f (in metres), unit: dioptre.</li>
    </ul>
  ) : topic === "mirror" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>Mirror formula: 1/v + 1/u = 1/f. f = R/2.</li>
      <li>Concave (f &gt; 0): image real & inverted when object beyond F; virtual when inside F.</li>
      <li>Convex (f &lt; 0): image always virtual, erect and diminished.</li>
      <li>Magnification m = −v/u.</li>
    </ul>
  ) : topic === "ohms" ? (
    <ul className="space-y-2 list-disc pl-4">
      <li>Ohm's Law: V = IR ⇒ I = V/R.</li>
      <li>Power dissipated: P = VI = I²R = V²/R.</li>
      <li>Series: R = R₁ + R₂. Parallel: 1/R = 1/R₁ + 1/R₂.</li>
    </ul>
  ) : (
    <ul className="space-y-2 list-disc pl-4">
      <li>Torque τ = r × F (here τ = F·R, force tangent).</li>
      <li>Disc: I = ½MR². Hoop: I = MR². Sphere: ⅖MR².</li>
      <li>Newton's 2nd law for rotation: τ = Iα.</li>
      <li>ω(t) = ω₀ + αt for constant α.</li>
    </ul>
  );

  return (
    <TopicShell subject="physics" title={t.title} tag={t.tag} blurb={t.blurb} notes={notes}>
      <Sim />
    </TopicShell>
  );
}
