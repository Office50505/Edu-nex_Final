import hashlib
import json
import os
import re
from datetime import datetime, timezone

import requests

try:
    from pymongo import MongoClient, UpdateOne
except ImportError as exc:
    raise SystemExit("Install pymongo first: python3 -m pip install pymongo") from exc

try:
    import certifi
except ImportError:
    certifi = None


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSCRIPTS = os.environ.get(
    "TRANSCRIPTS",
    os.path.join(os.environ.get("UPLOADS", os.path.join(ROOT, "uploads")), "transcripts"),
)

MONGO_URI = (
    os.environ.get("MONGO_URI")
    or os.environ.get("MONGODB_URI")
    or os.environ.get("ATLAS_URI")
    or os.environ.get("MONGO_URL")
    or os.environ.get("DATABASE_URL")
)
MONGO_DB = os.environ.get("MONGO_DB", "test")
RAG_VECTOR_COLLECTION = os.environ.get("RAG_VECTOR_COLLECTION", "rag_chunks")
OLLAMA = os.environ.get("RAG_OLLAMA") or os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA = OLLAMA.rstrip("/")
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
EMBED_MODEL = os.environ.get("RAG_EMBED") or os.environ.get("OLLAMA_EMBED", "nomic-embed-text")
REINDEX = os.environ.get("REINDEX", "").lower() in {"1", "true", "yes"}

if not MONGO_URI:
    raise SystemExit("Set MONGO_URI, MONGODB_URI, ATLAS_URI, MONGO_URL, or DATABASE_URL.")


mongo_kwargs = {}
if certifi:
    mongo_kwargs["tlsCAFile"] = certifi.where()

client = MongoClient(MONGO_URI, **mongo_kwargs)
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


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "course"


def metadata_for(path):
    meta_path = f"{path}.json"
    fallback_title = os.path.splitext(os.path.basename(path))[0]
    metadata = {
        "course_id": slugify(fallback_title),
        "course_name": fallback_title.replace("-", " ").replace("_", " "),
        "source_type": "transcript",
    }
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as handle:
            metadata.update(json.load(handle))
    metadata["course_id"] = slugify(str(metadata.get("course_id") or fallback_title))
    metadata["course_name"] = str(metadata.get("course_name") or metadata["course_id"])
    metadata["source_type"] = str(metadata.get("source_type") or "transcript")
    return metadata


def chunk(text, size=360, overlap=60):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunks.append(" ".join(words[i : i + size]))
        i += size - overlap
    return chunks


def ingest_file(path):
    fname = os.path.basename(path)
    metadata = metadata_for(path)
    course_id = metadata["course_id"]
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
    source_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    for index, text_chunk in enumerate(chunks):
        chunk_id = f"{course_id}:{fname}:{index}"
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
                        "course_name": metadata["course_name"],
                        "source": fname,
                        "source_type": metadata["source_type"],
                        "source_hash": source_hash,
                        "lesson_number": metadata.get("lesson_number"),
                        "module": metadata.get("module"),
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
