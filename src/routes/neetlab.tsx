import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FlaskConical, Atom, Microscope } from "lucide-react";
import { SubjectIndex } from "@/neetlab/components/SubjectIndex";
import { BioTopic } from "@/neetlab/components/BiologyTopic";
import { PhyTopic } from "@/neetlab/components/PhysicsTopic";
import { ChemTopic } from "@/neetlab/components/ChemistryTopic";
import { subjects } from "@/neetlab/data/topics";
import { FeatureLock } from "@/components/feature-lock";

export const Route = createFileRoute("/neetlab")({
  head: () => ({ meta: [{ title: "NEETLab — 3D Sims & Simulations" }] }),
  component: () => (<FeatureLock feature="neetlab"><NEETLabPage /></FeatureLock>),
});

function NEETLabPage() {
  const [bio, setBio] = useState<string | null>(null);
  const [phy, setPhy] = useState<string | null>(null);
  const [chem, setChem] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-3 text-white shadow-lg">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">NEETLab</h1>
            <p className="text-sm text-muted-foreground">3D models & interactive physics / chemistry / biology simulations.</p>
          </div>
        </div>

        <Tabs defaultValue="biology" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="biology"><Microscope className="mr-1 h-4 w-4" /> Biology</TabsTrigger>
            <TabsTrigger value="physics"><Atom className="mr-1 h-4 w-4" /> Physics</TabsTrigger>
            <TabsTrigger value="chemistry"><FlaskConical className="mr-1 h-4 w-4" /> Chemistry</TabsTrigger>
          </TabsList>

          <TabsContent value="biology">
            {bio ? <BioTopic topic={bio} /> : (
              <SubjectIndex subject="biology" title={subjects.biology.title} desc={subjects.biology.desc} topics={subjects.biology.topics as any} onPick={setBio} />
            )}
            {bio && <div className="mt-4"><Button variant="ghost" onClick={() => setBio(null)}>← Back to all topics</Button></div>}
          </TabsContent>

          <TabsContent value="physics">
            {phy ? <PhyTopic topic={phy} /> : (
              <SubjectIndex subject="physics" title={subjects.physics.title} desc={subjects.physics.desc} topics={subjects.physics.topics as any} onPick={setPhy} />
            )}
            {phy && <div className="mt-4"><Button variant="ghost" onClick={() => setPhy(null)}>← Back to all topics</Button></div>}
          </TabsContent>

          <TabsContent value="chemistry">
            {chem ? <ChemTopic topic={chem} /> : (
              <SubjectIndex subject="chemistry" title={subjects.chemistry.title} desc={subjects.chemistry.desc} topics={subjects.chemistry.topics as any} onPick={setChem} />
            )}
            {chem && <div className="mt-4"><Button variant="ghost" onClick={() => setChem(null)}>← Back to all topics</Button></div>}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
