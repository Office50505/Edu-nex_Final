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
const RAG_EMBED = process.env.RAG_EMBED || process.env.OLLAMA_EMBED || "nomic-embed-text";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY || "";
const FAL_OPENROUTER_MODEL = process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || "google/gemini-2.5-flash";
const FAL_OPENROUTER_URL = process.env.FAL_OPENROUTER_URL || "https://fal.run/openrouter/router/openai/v1/chat/completions";
const RAG_CHAT_PROVIDER = String(process.env.RAG_CHAT_PROVIDER || (FAL_API_KEY ? "fal" : "ollama")).toLowerCase();
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
const DEFAULT_TOP_K = 5;
const DEFAULT_NUM_CANDIDATES = 100;
const MAX_CONTEXT_CHARS = 5200;
const MIN_RELEVANCE_SCORE = 0.35;
const REFUSAL_MESSAGE = "This is not covered in the current course materials.";
const GREETING_MESSAGE = [
  "Hey, I am ready.",
  "Ask me anything from the AI Influencer course, like face consistency, reference photos, prompts, voice, reels, or monetization.",
].join(" ");

let db;

const SOURCE_TYPE_PRIORITY = {
  chat_training: 0,
  notes_prompts: 1,
  master_script: 2,
};

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

function extractChatText(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data.output === "string") return data.output;
  if (typeof data.text === "string") return data.text;
  if (typeof data.response === "string") return data.response;
  if (typeof data.answer === "string") return data.answer;
  if (typeof data.content === "string") return data.content;
  if (Array.isArray(data.output)) return data.output.map(extractChatText).filter(Boolean).join("\n");

  const choice = data.choices?.[0];
  if (typeof choice?.text === "string") return choice.text;
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.map(part => part?.text || "").filter(Boolean).join("\n");
  }

  if (typeof data.message?.content === "string") return data.message.content;
  if (Array.isArray(data.message?.content)) {
    return data.message.content.map(part => part?.text || "").filter(Boolean).join("\n");
  }

  return "";
}

async function callFalOpenRouter(messages, { maxTokens = 450 } = {}) {
  if (!FAL_API_KEY) {
    throw new Error("Fal API is not configured. Set FAL_KEY or FAL_API_KEY.");
  }

  const response = await axios.post(
    FAL_OPENROUTER_URL,
    {
      model: FAL_OPENROUTER_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    },
  );

  return extractChatText(response.data);
}

async function generateChatAnswer(messages, options = {}) {
  if (RAG_CHAT_PROVIDER === "fal" || RAG_CHAT_PROVIDER === "openrouter") {
    return callFalOpenRouter(messages, options);
  }

  const data = await ollamaPost(RAG_CHAT_OLLAMA, "/api/chat", {
    model: RAG_MODEL,
    messages,
    stream: false,
    options: {
      temperature: 0.2,
      num_ctx: 4096,
      num_predict: options.maxTokens || 180,
    },
  });

  return extractChatText(data);
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

function getLexicalPatterns(query) {
  const q = String(query || "").toLowerCase();
  const patterns = [];

  if (/(face|chehra|identity|same|change|badal|consistent|consistency)/i.test(q)) {
    patterns.push("identity lock", "exact same face", "same facial features", "face har video", "reference photo");
  }

  if (/(voice|awaaz|audio|bol|sound)/i.test(q)) {
    patterns.push("voice consistency", "reference line", "same voice", "awaaz");
  }

  if (/(product|ad|ugc|brand)/i.test(q)) {
    patterns.push("product exactly same", "UGC", "same character", "holding this product");
  }

  return [...new Set(patterns)];
}

function isGreetingOnly(message) {
  return /^(hi|hey|hello|yo|hii|heyy|namaste|sup)[!. ]*$/i.test(String(message || "").trim());
}

function isQuizRequest(message) {
  return /\b(quiz|test me|practice question|mcq|questions?)\b/i.test(String(message || ""));
}

function snippetAroundPatterns(text, patterns, maxChars = 900) {
  const body = String(text || "");
  const lower = body.toLowerCase();
  let hit = -1;

  for (const pattern of patterns) {
    const index = lower.indexOf(pattern.toLowerCase());
    if (index !== -1 && (hit === -1 || index < hit)) hit = index;
  }

  if (hit === -1 || body.length <= maxChars) return body.slice(0, maxChars);

  const start = Math.max(0, hit - Math.floor(maxChars * 0.35));
  const end = Math.min(body.length, start + maxChars);
  return body.slice(start, end);
}

async function searchLexicalCourse(query, courseId, limit = 3) {
  const patterns = getLexicalPatterns(query);
  if (!patterns.length) return [];

  const filter = {
    $or: patterns.map(pattern => ({ text: { $regex: pattern, $options: "i" } })),
  };
  if (courseId) filter.course_id = courseId;

  const rows = await db.collection(RAG_VECTOR_COLLECTION)
    .find(filter, {
      projection: {
        text: 1,
        source: 1,
        course_id: 1,
        source_type: 1,
        chunk: 1,
      },
    })
    .limit(12)
    .toArray();

  return rows
    .sort((a, b) => {
      const aPriority = SOURCE_TYPE_PRIORITY[a.source_type] ?? 9;
      const bPriority = SOURCE_TYPE_PRIORITY[b.source_type] ?? 9;
      return aPriority - bPriority || Number(a.chunk || 0) - Number(b.chunk || 0);
    })
    .slice(0, limit)
    .map(row => ({
      text: snippetAroundPatterns(row.text, patterns),
      source: row.source || courseId || "course transcript",
      sourceType: row.source_type || "course_material",
      chunk: row.chunk,
      score: 0.99,
    }));
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
  const lexicalMatches = await searchLexicalCourse(query, courseId);
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
        course_name: 1,
        source_type: 1,
        chunk: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]).toArray();

  const vectorMatches = rows.map(row => ({
    text: String(row.text || "").slice(0, 900),
    source: row.source || courseId || "course transcript",
    sourceType: row.source_type || "course_material",
    chunk: row.chunk,
    score: Number(row.score) || 0,
  }));

  const seen = new Set();
  return [...lexicalMatches, ...vectorMatches].filter(match => {
    const key = `${match.source}:${match.chunk}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function strongMatches(matches) {
  return matches.filter(match => match.score >= MIN_RELEVANCE_SCORE);
}

function buildContext(matches) {
  let context = "";
  for (const match of matches) {
    const next = `[${match.source} | ${match.sourceType}]\n${match.text}\n\n`;
    if (context.length + next.length > MAX_CONTEXT_CHARS) break;
    context += next;
  }
  return context.trim();
}

function buildSystemPrompt(context) {
<<<<<<< HEAD
  return `You are AI Studio Coach, the Skillomate AI Influencer course tutor.
Use only the course excerpts below.
Answer in simple Roman Hinglish by default, and match the user's language.
Use English letters only. Do not use Devanagari or Hindi script.
Every sentence must be complete and readable.
Give short practical steps, exact prompt lines, or fixes when the excerpts contain them.
For normal questions use 3-5 concise bullets and never return more than 5 bullets.
For quiz requests, write 3 short quiz questions with A/B/C options and do not reveal answers until asked.
Mention the source once when useful.
=======
  return `You are Skillomate Nex AI, a fast course tutor. Use only the course excerpts below.
Answer in exactly 3 short bullets.
Do not write an intro, heading, recap, or extra section.
Each bullet must be one complete sentence under 18 words.
Mention the lesson source once.
>>>>>>> 997e33eea7b5c5f193080a114f8374e8d90b8191
If the answer is not explicitly in the excerpts, say exactly: "${REFUSAL_MESSAGE}"
Never use outside knowledge, guesses, or general training data.

COURSE EXCERPTS:
${context}`;
}

function getLanguageHint(message) {
  const text = String(message || "").toLowerCase();
  if (/(kya|karu|karo|kaise|mera|meri|mein|hai|nahi|badal|chehra|aap|tum)/.test(text)) {
    return "Language: answer in simple Roman Hinglish using English letters only.";
  }
  return "Language: match the user's language.";
}

function buildUserPrompt(message) {
  return `${message}

${getLanguageHint(message)}
Answer format: if this is a quiz request, give 3 short questions with options; otherwise give 3-5 short practical bullets only. No long intro, no code unless I ask for code.`;
}

function formatCourseName(courseId) {
  return String(courseId || "").replace(/\.txt$/i, "").replaceAll("-", " ");
}

async function listCourses(_req, res) {
  try {
    const rows = await db.collection(RAG_VECTOR_COLLECTION).aggregate([
      { $match: { course_id: { $type: "string", $ne: "" } } },
      {
        $group: {
          _id: "$course_id",
          name: { $first: "$course_name" },
          modules: { $addToSet: "$source" },
          sourceTypes: { $addToSet: "$source_type" },
        }
      },
      { $sort: { _id: 1 } },
    ]).toArray();
    if (rows.length) {
      return res.json(rows.map(row => ({
        id: row._id,
        name: row.name || formatCourseName(row._id),
        modules: (row.modules || []).filter(Boolean).sort(),
        sourceTypes: (row.sourceTypes || []).filter(Boolean).sort(),
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

    const trimmedMessage = message.trim();
    if (isGreetingOnly(trimmedMessage)) {
      return res.json({ answer: GREETING_MESSAGE, sources: [] });
    }

    const searchQuery = isQuizRequest(trimmedMessage)
      ? `${trimmedMessage} AI influencer course basics reference photo prompts voice monetization`
      : trimmedMessage;

    const matches = await searchCourse(searchQuery, courseId);
    const evidence = strongMatches(matches);
    if (!evidence.length) return res.json({ answer: REFUSAL_MESSAGE, sources: [] });

    const answer = await generateChatAnswer(
      [
        { role: "system", content: buildSystemPrompt(buildContext(evidence)) },
        { role: "user", content: buildUserPrompt(trimmedMessage) },
      ],
      { maxTokens: isQuizRequest(trimmedMessage) ? 360 : 220 },
    );

    res.json({
      answer: answer || "I could not generate an answer. Try asking again.",
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
      embeddingProvider: "ollama",
      embeddingStatus: "running",
      embeddingHost: RAG_OLLAMA,
      chatProvider: RAG_CHAT_PROVIDER,
      chatHost: RAG_CHAT_PROVIDER === "fal" || RAG_CHAT_PROVIDER === "openrouter" ? FAL_OPENROUTER_URL : RAG_CHAT_OLLAMA,
      mongodb: "connected",
      vectorCollection: RAG_VECTOR_COLLECTION,
      vectorIndex: RAG_VECTOR_INDEX,
      model: RAG_CHAT_PROVIDER === "fal" || RAG_CHAT_PROVIDER === "openrouter" ? FAL_OPENROUTER_MODEL : RAG_MODEL,
      embedModel: RAG_EMBED,
      hasOllamaApiKey: Boolean(OLLAMA_API_KEY),
      hasFalApiKey: Boolean(FAL_API_KEY),
      chunks,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
      embeddingHost: RAG_OLLAMA,
      chatProvider: RAG_CHAT_PROVIDER,
      chatHost: RAG_CHAT_PROVIDER === "fal" || RAG_CHAT_PROVIDER === "openrouter" ? FAL_OPENROUTER_URL : RAG_CHAT_OLLAMA,
      model: RAG_CHAT_PROVIDER === "fal" || RAG_CHAT_PROVIDER === "openrouter" ? FAL_OPENROUTER_MODEL : RAG_MODEL,
      embedModel: RAG_EMBED,
      hasOllamaApiKey: Boolean(OLLAMA_API_KEY),
      hasFalApiKey: Boolean(FAL_API_KEY),
    });
  }
}

async function courseChat(req, res) {
  try {
    const { question, videoTitle, videoDescription, currentTime, messages = [] } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "question required." });

    const systemPrompt = [
      "You are Skillomate Course AI, a concise tutor inside a short-form course video player.",
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

    const answer = await generateChatAnswer(
      [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: question.trim() },
      ],
      { maxTokens: 360 },
    );

    res.json({ answer: answer?.trim() || "I could not generate an answer. Try again." });
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
