require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

const PORT = process.env.PORT || 3001;
const RAG_OLLAMA = normalizeBaseUrl(process.env.RAG_OLLAMA || process.env.OLLAMA_HOST || "http://localhost:11434");
const RAG_CHAT_OLLAMA = normalizeBaseUrl(
  process.env.RAG_CHAT_OLLAMA || process.env.OLLAMA_CLOUD_HOST || process.env.OLLAMA_HOST || RAG_OLLAMA
);
const RAG_MODEL = process.env.RAG_MODEL || process.env.OLLAMA_MODEL || process.env.CLOUD_MODEL || "gpt-oss:120b";
const RAG_EMBED = process.env.RAG_EMBED || process.env.OLLAMA_EMBED || "embeddinggemma";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.ATLAS_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL;
const MONGO_DB = process.env.MONGO_DB || process.env.MONGODB_DB || process.env.DB_NAME || "test";
const RAG_VECTOR_COLLECTION = process.env.RAG_VECTOR_COLLECTION || "rag_chunks";
const RAG_VECTOR_INDEX = process.env.RAG_VECTOR_INDEX || "rag_vector_index";
const RAG_VECTOR_DIMS = Number(process.env.RAG_VECTOR_DIMS || 768);
const RAG_UPLOADS = process.env.RAG_UPLOADS || path.join(__dirname, "..", "uploads");
const DEFAULT_TOP_K = 2;
const DEFAULT_NUM_CANDIDATES = 100;
const MAX_CONTEXT_CHARS = 2200;
const MIN_RELEVANCE_SCORE = 0.45;
const REFUSAL_MESSAGE = "This is not covered in the current course materials.";

let db;

function getOllamaHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (OLLAMA_API_KEY) headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;
  return headers;
}

function getProviderError(error) {
  const data = error.response?.data;
  if (typeof data === "string") return data;
  return data?.error || data?.message || error.message;
}

async function ollamaGet(baseUrl, route) {
  try {
    const response = await axios.get(`${baseUrl}${route}`, { headers: getOllamaHeaders() });
    return response.data;
  } catch (error) {
    throw new Error(getProviderError(error));
  }
}

async function ollamaPost(baseUrl, route, body, options = {}) {
  try {
    const response = await axios.post(`${baseUrl}${route}`, body, {
      headers: getOllamaHeaders(),
      ...options,
    });
    return response.data;
  } catch (error) {
    throw new Error(getProviderError(error));
  }
}

async function getEmbedding(text) {
  const data = await ollamaPost(RAG_OLLAMA, "/api/embed", {
    model: RAG_EMBED,
    input: text,
  });
  const embedding = data.embeddings?.[0];
  if (!Array.isArray(embedding)) {
    throw new Error("Ollama /api/embed response did not include embeddings.");
  }
  return embedding;
}

async function ensureVectorIndexes() {
  const collection = db.collection(RAG_VECTOR_COLLECTION);
  await Promise.all([
    collection.createIndex({ course_id: 1, source: 1 }),
    collection.createIndex({ chunk_id: 1 }, { unique: true, sparse: true }),
  ]).catch(() => {});

  if (typeof collection.createSearchIndex !== "function") return;
  try {
    const existing = typeof collection.listSearchIndexes === "function"
      ? await collection.listSearchIndexes().toArray()
      : [];
    if (existing.some(index => index.name === RAG_VECTOR_INDEX)) return;
    await collection.createSearchIndex({
      name: RAG_VECTOR_INDEX,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: RAG_VECTOR_DIMS,
            similarity: "cosine",
          },
          { type: "filter", path: "course_id" },
          { type: "filter", path: "source" },
        ],
      },
    });
    console.log(`Requested Atlas Vector Search index ${RAG_VECTOR_INDEX}`);
  } catch (error) {
    console.warn(`Atlas Vector Search index was not created automatically: ${error.message}`);
  }
}

async function searchCourse(query, courseId, topK = DEFAULT_TOP_K) {
  const embedding = await getEmbedding(query);
  const vectorSearch = {
    index: RAG_VECTOR_INDEX,
    path: "embedding",
    queryVector: embedding,
    numCandidates: Math.max(DEFAULT_NUM_CANDIDATES, topK * 20),
    limit: topK,
  };
  if (courseId) vectorSearch.filter = { course_id: { $eq: courseId } };

  const rows = await db.collection(RAG_VECTOR_COLLECTION).aggregate([
    { $vectorSearch: vectorSearch },
    {
      $project: {
        text: 1,
        source: 1,
        course_id: 1,
        chunk: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]).toArray();

  return rows.map(row => ({
    text: String(row.text || "").slice(0, 900),
    source: row.source || courseId || "course transcript",
    score: Number(row.score) || 0,
  }));
}

function strongMatches(matches) {
  return matches.filter(match => match.score >= MIN_RELEVANCE_SCORE);
}

function buildContext(matches) {
  let context = "";
  for (const match of matches) {
    const next = `[${match.source}]\n${match.text}\n\n`;
    if (context.length + next.length > MAX_CONTEXT_CHARS) break;
    context += next;
  }
  return context.trim();
}

function buildSystemPrompt(context) {
  return `You are EduNex AI Assistant, a fast course tutor. Use only the course excerpts below.
Answer in exactly 3 short bullets.
Do not write an intro, heading, recap, or extra section.
Each bullet must be one complete sentence under 18 words.
Mention the lesson source once.
If the answer is not explicitly in the excerpts, say exactly: "${REFUSAL_MESSAGE}"
Never use outside knowledge, guesses, or general training data.

COURSE EXCERPTS:
${context}`;
}

function buildUserPrompt(message) {
  return `${message}

Answer format: exactly 3 short bullets, no intro, no headings, no code unless I ask for code.`;
}

function formatCourseName(courseId) {
  return String(courseId || "").replace(/\.txt$/i, "").replaceAll("-", " ");
}

async function listCourses(_req, res) {
  try {
    const rows = await db.collection(RAG_VECTOR_COLLECTION).aggregate([
      { $match: { course_id: { $type: "string", $ne: "" } } },
      { $group: { _id: "$course_id", modules: { $addToSet: "$source" } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    if (rows.length) {
      return res.json(rows.map(row => ({
        id: row._id,
        name: formatCourseName(row._id),
        modules: (row.modules || []).filter(Boolean).sort(),
      })));
    }

    const dir = path.join(RAG_UPLOADS, "transcripts");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith(".txt")) : [];
    const courses = {};
    files.forEach(file => {
      const id = file.split("-")[0];
      if (!courses[id]) courses[id] = { id, name: formatCourseName(id), modules: [] };
      courses[id].modules.push(file);
    });
    res.json(Object.values(courses));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function chat(req, res) {
  try {
    const { message, courseId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required." });

    const matches = await searchCourse(message.trim(), courseId);
    const evidence = strongMatches(matches);
    if (!evidence.length) return res.json({ answer: REFUSAL_MESSAGE, sources: [] });

    const data = await ollamaPost(RAG_CHAT_OLLAMA, "/api/chat", {
      model: RAG_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(buildContext(evidence)) },
        { role: "user", content: buildUserPrompt(message.trim()) },
      ],
      stream: false,
      options: { temperature: 0.2, num_ctx: 1024, num_predict: 140 },
    });

    res.json({
      answer: data.message?.content || "I could not generate an answer. Try asking again.",
      sources: [...new Set(evidence.map(match => match.source))],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
}

async function health(_req, res) {
  try {
    await ollamaGet(RAG_OLLAMA, "/api/tags");
    await db.command({ ping: 1 });
    const chunks = await db.collection(RAG_VECTOR_COLLECTION).estimatedDocumentCount();
    res.json({
      ok: true,
      ollama: "running",
      embeddingHost: RAG_OLLAMA,
      chatHost: RAG_CHAT_OLLAMA,
      mongodb: "connected",
      vectorCollection: RAG_VECTOR_COLLECTION,
      vectorIndex: RAG_VECTOR_INDEX,
      model: RAG_MODEL,
      embedModel: RAG_EMBED,
      hasOllamaApiKey: Boolean(OLLAMA_API_KEY),
      chunks,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
      embeddingHost: RAG_OLLAMA,
      chatHost: RAG_CHAT_OLLAMA,
      model: RAG_MODEL,
      embedModel: RAG_EMBED,
      hasOllamaApiKey: Boolean(OLLAMA_API_KEY),
    });
  }
}

async function courseChat(req, res) {
  try {
    const { question, videoTitle, videoDescription, currentTime, messages = [] } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "question required." });

    const systemPrompt = [
      "You are EduNex Course AI, a concise tutor inside a short-form course video player.",
      "Use the provided video title, description, and playback time as lesson context.",
      "Answer in simple language. Keep replies short unless the user asks for detail.",
      "For summaries use bullets. For practice requests give 3-5 questions.",
      `Video title: ${videoTitle || "Untitled video"}`,
      `Current playback time: ${Math.round(Number(currentTime) || 0)} seconds`,
      `Video description/context: ${(videoDescription || "No description provided.").slice(0, 2000)}`,
    ].join("\n");

    const safeHistory = Array.isArray(messages)
      ? messages.slice(-6)
          .filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
          .map(m => ({ role: m.role, content: m.content.trim().slice(0, 800) }))
      : [];

    const data = await ollamaPost(RAG_CHAT_OLLAMA, "/api/chat", {
      model: RAG_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: question.trim() },
      ],
      stream: false,
      options: { temperature: 0.3, num_ctx: 2048, num_predict: 300 },
    });

    res.json({ answer: data.message?.content?.trim() || "I could not generate an answer. Try again." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get("/", (_req, res) => res.json({ ok: true, service: "edunex-ai" }));
app.get("/health", health);
app.get("/api/health", health);
app.get("/api/courses", listCourses);
app.get("/api/ai/health", health);
app.get("/api/ai/courses", listCourses);
app.post("/api/chat", chat);
app.post("/api/ai/chat", chat);
app.post("/api/course-chat", courseChat);

async function start() {
  if (!MONGO_URI) throw new Error("Set MONGO_URI, MONGODB_URI, ATLAS_URI, MONGO_URL, or DATABASE_URL.");
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(MONGO_DB);
  await ensureVectorIndexes();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI API running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(error => {
  console.error(error.message);
  process.exit(1);
});
