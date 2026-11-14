# Multi-course transcript layer

This layer adds local lexical retrieval to unified Nex AI. It does not replace approved notes/prompts, change playback or enrollment, train a model, or require embeddings.

`original/` preserves the supplied ZIP and the exact bytes of its five files. Its README is dataset documentation, not application policy. `published-catalog.json` is a read-only export of the existing isolated local QA catalog, including stored media URLs and durations. No production read or write was needed. `index.json` contains the derived bindings, source hashes, audit results and retrieval records.

85 lesson documents and 95 chunks were checked. 84 lessons and 93 chunks map by exact published media URL across six courses. `AI-Influencer:Lesson-01` and its two chunks are quarantined: the supplied 153.9-second AI-basics video has a different URL from the published 78.13-second introduction. A numbered or similarly named lesson is not sufficient evidence to bind it. Real Estate Videos has no transcript in this dataset.

The player uses embedded course-video IDs as its canonical lesson IDs. The local catalog has no separate Lesson rows; the index records this explicitly rather than inventing IDs.

Every original source segment is represented by its supplied chunks, with the documented one-segment overlap. This is dataset coverage, not proof of a complete or accurate transcription of the recording. Six mapped lessons have unknown video durations. Three transcripts start over five seconds into the recording, and two end over five seconds before it ends. Those limits remain visible. Chunk times cannot support word-level timestamp claims.

Runtime retrieval verifies original file hashes and each chunk's exact source text, then rechecks its course/video ID, order, URL and known duration against the current published catalog. Explicit lessons and timestamps outrank the active video; current-lecture questions target the active video. Follow-ups can retain an earlier transcript target across a player course switch. Missing or ambiguous sources produce limitations, not fabricated speech.

Recheck ingestion without overwriting anything, from `edunex-b`:

```sh
node scripts/prepare-transcript-knowledge.cjs --catalog transcripts/skillomate-rag-v1/published-catalog.json --check
node --require ./tests/helpers/deny-network.cjs --test tests/transcript-integration.test.cjs
```

Initial ingestion refuses to overwrite an existing index. Corrected datasets should be ingested as a separately reviewed version; the original files remain unchanged.
