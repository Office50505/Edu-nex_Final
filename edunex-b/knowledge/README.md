# Tutor knowledge

The main `/api/ai/chat` route uses the published course catalog and local text retrieval. It does not fine-tune a model or require Ollama/Atlas vector search. The standalone tutor and floating popup share this endpoint.

## Bundled course content

`ai-influencer/` contains copies of the existing extracted transcripts in `appcopyai/Ai/uploads/transcripts/`:

- `notes.txt`: lesson notes and prompts.
- `lessons.txt`: master lesson script.
- `troubleshooting.txt`: common problems and fixes.

These files are mapped only to the published course whose slug is exactly `ai-influencer`. Full document excerpts and lesson example prompts require the same active/trial subscription dates used by the content routes. All signed-in learners can still ask about course overviews or request general teaching examples. No subscription records are modified by this feature.

References point to the course page and identify the source document/section. They are not video timestamps or verified transcript-to-video mappings. Model citations identify supplied excerpts, but still need correctness evaluation.

## Retrieval and teaching

The service splits text into overlapping sections, scores keyword matches with document-frequency and length weighting, expands a small English/Hinglish vocabulary, and retrieves up to six passages. Short follow-ups use recent conversation context. This is lexical retrieval, not semantic embedding search. The source text is treated as reference data, not system instructions.

The prompt requests direct explanations, language matching, concrete troubleshooting, practice questions with withheld solutions, and citations for course claims. General explanations are explicitly distinguished from course excerpts. Old tool claims in the documents should be reviewed periodically by an instructor.

## Updating knowledge

The video player supplies the current course and lesson IDs to the floating tutor on every message, updates them when the learner switches videos, and clears them when leaving the player. The backend validates the lesson against the published course. Selected lesson notes and matching bundled document sections take priority for requests such as “summarize this video” or “iss video mein kya sikhaya hai.” Answers follow the question's language, including Roman Hinglish. Lesson notes retain the same subscription checks as other full materials.

This is knowledge from saved materials, not direct video analysis. Other courses need their own lesson notes or explicitly mapped text transcripts for detailed summaries. A title/description alone supports only an overview; the tutor is instructed to disclose that limitation. Remote transcript URLs are not automatically downloaded. Bundled sections match by lesson title or an explicit lesson number, never by assuming list position.

Edit the corresponding text files after instructor review and restart the backend (documents are loaded once). To add courses, extend the document configuration/loading in `services/tutorKnowledge.js` with explicit published slugs and add retrieval test cases. Do not attach these documents to unrelated courses by title similarity. Do not put credentials or learner personal data in knowledge files.

## Testing

- `npm run test:ai`: offline history, retrieval, and subscription-boundary regression tests.
- `npm run eval:ai`: four live requests against the configured provider, using a fixture course and subscription in an isolated harness. This incurs provider usage, sends the included course excerpts to the provider, and does not access or modify learner accounts. Review the printed Hinglish and quiz answers manually; automated checks cannot establish overall teaching quality.
- `node scripts/eval-tutor.cjs --video-context`: two live fixture requests checking selected-video summaries in English and Roman Hinglish.

Use the popup on `/` or the standalone `/ai-tutor` page. Refresh after frontend changes. Try a specific question, then “explain that simply,” “give an example,” and “quiz me.” Both chats retain six exchanges in page memory; refresh/New chat clears history. This is not durable cross-device memory.

The main backend supports `FAL_API_KEY` or `FAL_KEY`. Provider calls time out after 25 seconds, then return a clearly labeled basic course guide. This feature does not depend on the separate `appcopyai/Ai/backend` server.
