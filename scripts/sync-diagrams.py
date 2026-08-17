#!/usr/bin/env python3
"""Point questions at the diagram files that actually exist.

Every diagram file must be named:

    {subject}/{chapterId}_{questionId}_{kind}_{n}.{png|jpg|jpeg|webp|svg}
    subject ∈ physics | chemistry | biology
    kind    ∈ question | explanation

This script reads a list of such filenames and writes the matching relative
path into `qb_questions.question_image_url` / `qb_questions.explanation_image_url`.
Nothing else in the app needs to change: the frontend resolves those relative
paths against VITE_QBANK_IMAGE_BASE (jsDelivr/GitHub or /img/data).

Two input modes:

  # A) a local folder (public/img/data, or a clone of the diagrams repo)
  python3 scripts/sync-diagrams.py --dir public/img/data

  # B) a public GitHub repo, no clone needed (best for the 20k+ library)
  python3 scripts/sync-diagrams.py --github <user>/<repo> --branch main

Then apply:
  psql "$PGURI" -f /tmp/diagram-sync.sql

Add --apply to run it directly (needs $PGURI).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request

NAME_RE = re.compile(
    r"^(?P<chapter>\d+)_(?P<question>\d+)_(?P<kind>question|explanation)_(?P<n>\d+)"
    r"\.(?P<ext>png|jpe?g|webp|svg)$",
    re.I,
)
SUBJECTS = ("physics", "chemistry", "biology")


def from_dir(root):
    for subject in SUBJECTS:
        folder = os.path.join(root, subject)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            yield subject, name


def from_github(repo, branch):
    url = f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as fh:
        tree = json.load(fh)
    if tree.get("truncated"):
        print("WARNING: GitHub tree listing was truncated; use --dir on a clone "
              "for a complete sync.", file=sys.stderr)
    for node in tree.get("tree", []):
        if node.get("type") != "blob":
            continue
        parts = node["path"].split("/")
        if len(parts) < 2:
            continue
        subject = parts[-2].lower()
        if subject in SUBJECTS:
            yield subject, parts[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir")
    ap.add_argument("--github", help="user/repo of the public diagrams repo")
    ap.add_argument("--branch", default="main")
    ap.add_argument("--out", default="/tmp/diagram-sync.sql")
    ap.add_argument("--apply", action="store_true", help="run the SQL with psql $PGURI")
    args = ap.parse_args()

    if not args.dir and not args.github:
        ap.error("pass --dir or --github")

    source = from_dir(args.dir) if args.dir else from_github(args.github, args.branch)

    question, explanation, skipped = {}, {}, []
    for subject, name in source:
        m = NAME_RE.match(name)
        if not m:
            if not name.lower().endswith(".md"):
                skipped.append(f"{subject}/{name}")
            continue
        path = f"{subject}/{name}"
        qid = int(m.group("question"))
        target = question if m.group("kind").lower() == "question" else explanation
        # first file (n=1) wins; higher n are extra panels of the same question
        if int(m.group("n")) == 1 or qid not in target:
            target.setdefault(qid, path)

    lines = ["BEGIN;"]

    def emit(col, mapping):
        if not mapping:
            return
        values = ",".join(f"({qid},{sql_str(p)})" for qid, p in sorted(mapping.items()))
        lines.append(
            f"UPDATE public.qb_questions q SET {col} = v.path\n"
            f"FROM (VALUES {values}) AS v(id, path)\n"
            f"WHERE q.id = v.id AND q.{col} IS DISTINCT FROM v.path;"
        )

    emit("question_image_url", question)
    emit("explanation_image_url", explanation)
    lines.append("COMMIT;")

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(f"question images={len(question)} explanation images={len(explanation)} "
          f"unrecognised={len(skipped)} -> {args.out}")
    for s in skipped[:10]:
        print("  ignored (bad filename):", s)

    if args.apply:
        uri = os.environ.get("PGURI")
        if not uri:
            sys.exit("PGURI is not set")
        subprocess.check_call(["psql", uri, "-v", "ON_ERROR_STOP=1", "-f", args.out])


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


if __name__ == "__main__":
    main()
