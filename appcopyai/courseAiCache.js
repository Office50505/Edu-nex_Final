// Ephemeral, session-scoped lesson chats. Never persisted to device storage.
const entries = new Map();
const TTL = 30 * 60 * 1000;
const MAX_CHATS = 20;
function chatKey(userId, sessionId, courseId, videoId) {
  return JSON.stringify([userId, sessionId, courseId, videoId]);
}
function readChat(key, initial = [], now = Date.now()) {
  for (const [id, entry] of entries) {
    if (now - entry.updatedAt >= TTL) entries.delete(id);
  }
  let entry = entries.get(key);
  if (!entry) entry = { messages: [...initial], pending: false, updatedAt: now };
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_CHATS) entries.delete(entries.keys().next().value);
  return entry;
}
function updateChat(key, entry, messages, pending) {
  // Ignore replies for expired or evicted conversations.
  if (entries.get(key) !== entry) return false;
  entry.messages = messages.slice(-40);
  entry.pending = pending;
  entry.updatedAt = Date.now();
  return true;
}
module.exports = { chatKey, readChat, updateChat };
