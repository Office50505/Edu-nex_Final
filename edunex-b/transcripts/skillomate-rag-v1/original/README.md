# Skillomate RAG Dataset

`chunks.jsonl` is the embedding/indexing input. Embed `retrieval_text`; store `metadata`
as vector metadata and return `text` as the Roman-script Hinglish answer context.

`documents.jsonl` contains one complete bilingual document per lesson for audit and
full-lesson retrieval. No embeddings are included; generating them requires choosing
an embedding model and vector database.

Timestamped source review remains recommended because transcripts are automated.
