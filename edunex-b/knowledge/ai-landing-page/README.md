# AI Se Landing Page Banao

Published owner: `6aeb1d5f2497c8173516e257`, slug `ai-se-landing-page-banao`.
The preserved read-only catalog and matching PDF note contents verify all 11
lesson IDs in `course-binding.json`. Do not bind this pack to a guessed owner.

`sources/` preserves the supplied knowledge-base TXT, description TXT/PDF and
11 lesson-note PDFs byte for byte. `index.json` contains 49 unique chunks,
including 10 unchanged prompts from ORIGINAL ALL PROMPTS. The duplicated Part F
prompt section is not indexed again; its failed prompt remains a counterexample.
Canonical prompt records include SHA-256 hashes and original UTF-8 byte ranges.

The 11 detailed PDF notes already match the published database notes after
whitespace normalization. Their existing lesson associations are reused: this
ingestion performs no database writes, notes replacement or migration. TXT
lesson notes are distinct source excerpts, not duplicate PDF uploads.

Rebuild deterministically from preserved sources and binding:

```sh
node edunex-b/scripts/prepare-landing-page-knowledge.cjs
```

For an intentional identity refresh, provide a newly verified read-only catalog
snapshot as the first argument. It must contain exactly one matching published
course, all 11 unique video lesson IDs in order, and notes matching every PDF.
The script never connects to a database or makes provider requests.

The existing course-pack registry exposes this course through authenticated
unified Nex AI retrieval, including from other course players. Video entitlement,
authentication, subscriptions and billing remain governed by their existing
services. Restart the backend after registering or changing a pack.

Only complete, unchanged canonical prompt bodies may retain approval. Filling
placeholders, translating or rewriting creates a **Customized AI Prompt** with
its correct course/lesson attribution. Sweet Crumbs, example prices and links
remain course examples. Never present them as learner facts or real guarantees.
