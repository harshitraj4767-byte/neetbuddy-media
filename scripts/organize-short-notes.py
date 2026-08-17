#!/usr/bin/env python3
"""Organise the raw short-notes PDF dump into public/short_notes/<subject>/class-<11|12>/
and emit src/data/short-notes.ts (subject + class + chapter ordered manifest)."""
import os, re, glob, json, shutil, unicodedata, sys

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/snx/out/Short notes"

MAP = {
    "units and measurements": ("physics", 11, 1, "Units and Measurements"),
    "motion in a straight line": ("physics", 11, 2, "Motion in a Straight Line"),
    "motion in a plane": ("physics", 11, 3, "Motion in a Plane"),
    "laws of motion": ("physics", 11, 4, "Laws of Motion"),
    "work energy": ("physics", 11, 5, "Work, Energy and Power"),
    "system of particles": ("physics", 11, 6, "System of Particles and Rotational Motion"),
    "gravitation": ("physics", 11, 7, "Gravitation"),
    "mechanical properties of solids": ("physics", 11, 8, "Mechanical Properties of Solids"),
    "mechanical properties of fluids": ("physics", 11, 9, "Mechanical Properties of Fluids"),
    "thermal properties of matter": ("physics", 11, 10, "Thermal Properties of Matter"),
    "chapter 11 thermodynamics": ("physics", 11, 11, "Thermodynamics"),
    "kinetic theory": ("physics", 11, 12, "Kinetic Theory"),
    "oscillations": ("physics", 11, 13, "Oscillations"),
    "chapter 14 waves short notes": ("physics", 11, 14, "Waves"),
    "electric charges and fields": ("physics", 12, 1, "Electric Charges and Fields"),
    "electrostatic potential": ("physics", 12, 2, "Electrostatic Potential and Capacitance"),
    "current electricity": ("physics", 12, 3, "Current Electricity"),
    "moving charges": ("physics", 12, 4, "Moving Charges and Magnetism"),
    "magnetism and matter": ("physics", 12, 5, "Magnetism and Matter"),
    "electromagnetic induction": ("physics", 12, 6, "Electromagnetic Induction"),
    "alternating current": ("physics", 12, 7, "Alternating Current"),
    "electromagnetic waves": ("physics", 12, 8, "Electromagnetic Waves"),
    "ray optics": ("physics", 12, 9, "Ray Optics and Optical Instruments"),
    "wave optics": ("physics", 12, 10, "Wave Optics"),
    "dual nature": ("physics", 12, 11, "Dual Nature of Radiation and Matter"),
    "atoms short notes": ("physics", 12, 12, "Atoms"),
    "nuclei": ("physics", 12, 13, "Nuclei"),
    "semiconductor": ("physics", 12, 14, "Semiconductor Electronics"),
    "some basic concept of chemistry": ("chemistry", 11, 1, "Some Basic Concepts of Chemistry"),
    "structure of atom": ("chemistry", 11, 2, "Structure of Atom"),
    "classification of elements": ("chemistry", 11, 3, "Classification of Elements and Periodicity in Properties"),
    "chemical bonding": ("chemistry", 11, 4, "Chemical Bonding and Molecular Structure"),
    "chemical thermodynamics": ("chemistry", 11, 5, "Chemical Thermodynamics"),
    "equilibrium": ("chemistry", 11, 6, "Equilibrium"),
    "redox": ("chemistry", 11, 7, "Redox Reactions"),
    "organic chemistry": ("chemistry", 11, 8, "Organic Chemistry - Some Basic Principles and Techniques"),
    "hydrocarbons": ("chemistry", 11, 9, "Hydrocarbons"),
    "p block elements": ("chemistry", 11, 10, "The p-Block Elements"),
    "solutions": ("chemistry", 12, 1, "Solutions"),
    "electrochemistry": ("chemistry", 12, 2, "Electrochemistry"),
    "chemical kinetics": ("chemistry", 12, 3, "Chemical Kinetics"),
    "d and f block": ("chemistry", 12, 4, "The d- and f-Block Elements"),
    "coordination compounds": ("chemistry", 12, 5, "Coordination Compounds"),
    "haloalkanes": ("chemistry", 12, 6, "Haloalkanes and Haloarenes"),
    "alcohols": ("chemistry", 12, 7, "Alcohols, Phenols and Ethers"),
    "aldehydes": ("chemistry", 12, 8, "Aldehydes, Ketones and Carboxylic Acids"),
    "amines": ("chemistry", 12, 9, "Amines"),
    "chapter 10 biomolecules": ("chemistry", 12, 10, "Biomolecules"),
    "living world": ("biology", 11, 1, "The Living World"),
    "biological classification": ("biology", 11, 2, "Biological Classification"),
    "plant kingdom": ("biology", 11, 3, "Plant Kingdom"),
    "animal kingdom": ("biology", 11, 4, "Animal Kingdom"),
    "morphology of flowering": ("biology", 11, 5, "Morphology of Flowering Plants"),
    "anatomy of flowering": ("biology", 11, 6, "Anatomy of Flowering Plants"),
    "structural organisation": ("biology", 11, 7, "Structural Organisation in Animals"),
    "the cell the unit of life": ("biology", 11, 8, "Cell: The Unit of Life"),
    "chapter 9 biomolecules": ("biology", 11, 9, "Biomolecules"),
    "cell cycle": ("biology", 11, 10, "Cell Cycle and Cell Division"),
    "photosynthesis": ("biology", 11, 11, "Photosynthesis in Higher Plants"),
    "respiration in plants": ("biology", 11, 12, "Respiration in Plants"),
    "plant growth": ("biology", 11, 13, "Plant Growth and Development"),
    "breathing": ("biology", 11, 14, "Breathing and Exchange of Gases"),
    "body fluids": ("biology", 11, 15, "Body Fluids and Circulation"),
    "excretory": ("biology", 11, 16, "Excretory Products and Their Elimination"),
    "locomotion": ("biology", 11, 17, "Locomotion and Movement"),
    "neural control": ("biology", 11, 18, "Neural Control and Coordination"),
    "chemical coordination": ("biology", 11, 19, "Chemical Coordination and Integration"),
    "sexual reproduction": ("biology", 12, 1, "Sexual Reproduction in Flowering Plants"),
    "human reproduction": ("biology", 12, 2, "Human Reproduction"),
    "reproductive health": ("biology", 12, 3, "Reproductive Health"),
    "principles of inheritance": ("biology", 12, 4, "Principles of Inheritance and Variation"),
    "molecular basis": ("biology", 12, 5, "Molecular Basis of Inheritance"),
    "evolution": ("biology", 12, 6, "Evolution"),
    "human health": ("biology", 12, 7, "Human Health and Disease"),
    "microorganisms in human welfare": ("biology", 12, 8, "Microbes in Human Welfare"),
    "biotechnology principles": ("biology", 12, 9, "Biotechnology: Principles and Processes"),
    "biotechnology and its applications": ("biology", 12, 10, "Biotechnology and its Applications"),
    "organisms and populations": ("biology", 12, 11, "Organisms and Populations"),
    "ecosystem": ("biology", 12, 12, "Ecosystem"),
    "biodiversity": ("biology", 12, 13, "Biodiversity and Conservation"),
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("#u2013", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(s))).strip("-")


keys = sorted(MAP.keys(), key=len, reverse=True)
rows, unmatched, seen = [], [], set()
for f in sorted(glob.glob(os.path.join(SRC_DIR, "*.pdf"))):
    nb = norm(os.path.basename(f))
    hit = next((MAP[k] for k in keys if k in nb), None)
    if not hit:
        unmatched.append(os.path.basename(f))
        continue
    subject, cls, no, name = hit
    if (subject, cls, no) in seen:
        unmatched.append("DUP " + os.path.basename(f))
        continue
    seen.add((subject, cls, no))
    dest = f"public/short_notes/{subject}/class-{cls}/ch{no:02d}-{slug(name)}.pdf"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(f, dest)
    rows.append({"subject": subject, "cls": cls, "chapter": no, "name": name, "file": "/" + dest[len("public/"):]})

rows.sort(key=lambda r: (r["subject"], r["cls"], r["chapter"]))
ts = [
    "// AUTO-GENERATED by scripts/organize-short-notes.py — do not edit by hand.",
    "export type ShortNote = { subject: \"physics\" | \"chemistry\" | \"biology\"; cls: 11 | 12; chapter: number; name: string; file: string };",
    "",
    "export const SHORT_NOTES: ShortNote[] = [",
]
for r in rows:
    ts.append(
        f'  {{ subject: "{r["subject"]}", cls: {r["cls"]}, chapter: {r["chapter"]}, '
        f'name: {json.dumps(r["name"])}, file: {json.dumps(r["file"])} }},'
    )
ts += ["];", ""]
os.makedirs("src/data", exist_ok=True)
open("src/data/short-notes.ts", "w").write("\n".join(ts))
print("written", len(rows), "unmatched:", unmatched)
