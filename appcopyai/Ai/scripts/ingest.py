import os
from datetime import datetime, timezone

import requests

try:
    from pymongo import MongoClient, UpdateOne
except ImportError as exc:
    raise SystemExit("Install pymongo first: python3 -m pip install pymongo") from exc


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSCRIPTS = os.environ.get(
    "TRANSCRIPTS",
    os.path.join(os.environ.get("UPLOADS", os.path.join(ROOT, "uploads")), "transcripts"),
)

MONGO_URI = os.environ.get("MONGO_URI") or os.environ.get("ATLAS_URI")
MONGO_DB = os.environ.get("MONGO_DB", "test")
RAG_VECTOR_COLLECTION = os.environ.get("RAG_VECTOR_COLLECTION", "rag_chunks")
OLLAMA = os.environ.get("RAG_OLLAMA") or os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA = OLLAMA.rstrip("/")
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
EMBED_MODEL = os.environ.get("RAG_EMBED") or os.environ.get("OLLAMA_EMBED", "embeddinggemma")
REINDEX = os.environ.get("REINDEX", "").lower() in {"1", "true", "yes"}

if not MONGO_URI:
    raise SystemExit("Set MONGO_URI or ATLAS_URI to your MongoDB Atlas connection string.")


client = MongoClient(MONGO_URI)
db = client.get_default_database(default=MONGO_DB)
col = db[RAG_VECTOR_COLLECTION]
col.create_index("chunk_id", unique=True, sparse=True)
col.create_index([("course_id", 1), ("source", 1)])


def embed(text):
    headers = {}
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"

    response = requests.post(
        f"{OLLAMA}/api/embed",
        json={"model": EMBED_MODEL, "input": text},
        headers=headers,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["embeddings"][0]


def chunk(text, size=400, overlap=50):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunks.append(" ".join(words[i : i + size]))
        i += size - overlap
    return chunks


def ingest_file(path):
    fname = os.path.basename(path)
    course_id = fname.split("-")[0]
    with open(path, encoding="utf-8") as handle:
        text = handle.read().strip()
    if not text:
        print(f"Empty: {fname}")
        return 0

    chunks = chunk(text)
    print(f"{fname}: {len(chunks)} chunks")
    operations = []
    skipped = 0
    now = datetime.now(timezone.utc)

    for index, text_chunk in enumerate(chunks):
        chunk_id = f"{fname}-{index}"
        if not REINDEX and col.find_one({"chunk_id": chunk_id}, {"_id": 1}):
            skipped += 1
            continue
        operations.append(
            UpdateOne(
                {"chunk_id": chunk_id},
                {
                    "$set": {
                        "chunk_id": chunk_id,
                        "course_id": course_id,
                        "source": fname,
                        "chunk": index,
                        "text": text_chunk,
                        "embedding": embed(text_chunk),
                        "embedding_model": EMBED_MODEL,
                        "updated_at": now,
                    },
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )
        )

    if operations:
        result = col.bulk_write(operations, ordered=False)
        stored = result.upserted_count + result.modified_count
        print(f"   Stored {stored} chunks, skipped {skipped}")
        return stored

    print(f"   Already indexed, skipped {skipped}")
    return 0


print("Starting MongoDB RAG ingestion...")
files = [f for f in os.listdir(TRANSCRIPTS) if f.endswith(".txt")]
print(f"Found {len(files)} files\n")
total = 0
for file_name in sorted(files):
    total += ingest_file(os.path.join(TRANSCRIPTS, file_name))

print(f"\nDone. MongoDB collection: {db.name}.{RAG_VECTOR_COLLECTION}")
print(f"New or updated chunks: {total}")
