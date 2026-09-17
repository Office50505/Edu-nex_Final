import { useEffect, useMemo, useRef, useState } from "react";
import { page as aiTutorPage } from "../generated-pages/ai-tutor.html.js";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { EnxIcon } from "../components/EnxIcon.jsx";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const QUICK_PROMPTS = ["Explain prompt engineering with an example", "My AI character's face changes between clips", "Help me choose a course", "Quiz me on prompting"];
const NEX_AVATAR_SRC = "/assets/nex-avatar.png";
const NEX_THINKING_AVATAR_SRC = "/assets/nex-avatar-thinking.png";
const DEFAULT_ASSISTANT_NAME = "AI";
const MAX_STORED_SESSIONS = 24;
const MAX_MESSAGES_PER_SESSION = 80;

function normalizeAssistantName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
}

function assistantNameStorageKey(owner) {
  return `edunexAiBotName:${owner || "guest"}`;
}

function assistantSetupStorageKey(owner) {
  return `edunexAiBotSetupComplete:${owner || "guest"}`;
}

function newSessionId() {
  return `nai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createConversationSession() {
  return { id: newSessionId(), title: "New chat", updatedAt: Date.now(), messages: [] };
}

function titleFromMessage(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  return text.length > 42 ? `${text.slice(0, 42).trim()}...` : text;
}

function conversationStorageKey(owner) {
  return `edunexNexAiChats:${owner || "guest"}`;
}

function readStoredSessions(owner) {
  try {
    const parsed = JSON.parse(localStorage.getItem(conversationStorageKey(owner)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((session) => ({
        id: String(session?.id || ""),
        title: String(session?.title || "New chat").slice(0, 80),
        updatedAt: Number(session?.updatedAt || Date.now()),
        messages: Array.isArray(session?.messages)
          ? session.messages
              .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
              .map((message) => ({
                role: message.role,
                content: message.content.slice(0, 4000),
                notice: typeof message.notice === "string" ? message.notice.slice(0, 1000) : "",
                sources: Array.isArray(message.sources) ? message.sources.slice(0, 8) : [],
                createdAt: Number(message.createdAt || Date.now()),
              }))
          : [],
      }))
      .filter((session) => session.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_SESSIONS);
  } catch (_) {
    return [];
  }
}

function writeStoredSessions(owner, sessions) {
  if (!owner) return;
  const stored = sessions
    .filter((session) => Array.isArray(session.messages) && session.messages.length)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, MAX_STORED_SESSIONS);
  try {
    localStorage.setItem(conversationStorageKey(owner), JSON.stringify(stored));
  } catch (_) {}
}

function historyFromMessages(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-12);
}

function dateLabel(value) {
  const delta = Date.now() - Number(value || Date.now());
  if (delta < 60 * 1000) return "Just now";
  if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 60000))} min ago`;
  if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 3600000))} hr ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ReplyText({ text }) {
  return String(text || "").split("\n").map((line, index) => <p key={index} style={{ marginBottom: 6 }}>{line.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</p>);
}

function NexAvatar({ className = "", alt = "", mood = "idle" }) {
  const isThinking = mood === "thinking";
  return <img className={`nex-avatar-image${isThinking ? " is-thinking-expression" : ""} ${className}`.trim()} src={isThinking ? NEX_THINKING_AVATAR_SRC : NEX_AVATAR_SRC} alt={alt} draggable="false" />;
}

export function AiTutorPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [authGate, setAuthGate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Active now");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);
  const [assistantNameDraft, setAssistantNameDraft] = useState("");
  const [nameSetupOpen, setNameSetupOpen] = useState(false);
  const [nameSetupComplete, setNameSetupComplete] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const historyRef = useRef([]);
  const ownerRef = useRef("");
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-ai-tutor", aiTutorPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...aiTutorPage,
    scripts: aiTutorPage.scripts.filter((script) => script.src && script.src !== "js/main.js"),
  }), []);

  useEffect(() => {
    document.title = aiTutorPage.title;
    document.documentElement.lang = aiTutorPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    const syncAuth = () => {
      const api = window.EduNex;
      const user = api?.getUser?.();
      const owner = api?.getAccessToken?.() ? String(user?._id || user?.id || "") : "";
      setAuthGate(!api?.getAccessToken?.());
      if (owner !== ownerRef.current) {
        ownerRef.current = owner;
        generation.current += 1;
        const savedAssistantName = owner ? normalizeAssistantName(localStorage.getItem(assistantNameStorageKey(owner))) : "";
        const savedSetupComplete = Boolean(owner && localStorage.getItem(assistantSetupStorageKey(owner)) === "true");
        const stored = owner ? readStoredSessions(owner) : [];
        const initial = stored[0] || createConversationSession();
        const nextConversations = stored.length ? stored : [initial];
        historyRef.current = historyFromMessages(initial.messages);
        setConversations(nextConversations);
        setActiveConversationId(initial.id);
        setMessages(initial.messages);
        setHistoryOpen(false);
        setStatus("Active now");
        setAssistantName(savedAssistantName || DEFAULT_ASSISTANT_NAME);
        setAssistantNameDraft(savedAssistantName || "");
        setNameSetupComplete(savedSetupComplete);
        setNameSetupOpen(Boolean(owner) && !savedSetupComplete);
      }
    };
    if (runtimeReady) syncAuth();
    window.addEventListener("edunex:auth-changed", syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      generation.current += 1;
      window.removeEventListener("edunex:auth-changed", syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, [runtimeReady]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const setPrompt = (text) => {
    setInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openNameSetup = () => {
    setAssistantNameDraft(assistantName === DEFAULT_ASSISTANT_NAME ? "" : assistantName);
    setNameSetupOpen(true);
  };

  const saveAssistantName = (value = assistantNameDraft) => {
    const nextName = normalizeAssistantName(value) || DEFAULT_ASSISTANT_NAME;
    const owner = ownerRef.current;
    if (owner) {
      localStorage.setItem(assistantNameStorageKey(owner), nextName);
      localStorage.setItem(assistantSetupStorageKey(owner), "true");
    }
    setAssistantName(nextName);
    setAssistantNameDraft(nextName === DEFAULT_ASSISTANT_NAME ? "" : nextName);
    setNameSetupComplete(true);
    setNameSetupOpen(false);
    window.dispatchEvent(new CustomEvent("edunex:ai-name-changed", { detail: { name: nextName, owner } }));
  };

  const newChat = () => {
    generation.current += 1;
    const active = conversations.find((session) => session.id === activeConversationId);
    const next = active && !active.messages.length ? active : createConversationSession();
    if (!active || active.messages.length) {
      setConversations(current => [next, ...current].slice(0, MAX_STORED_SESSIONS));
    }
    setActiveConversationId(next.id);
    historyRef.current = [];
    setMessages([]);
    setInput("");
    setHistoryOpen(false);
    setStatus("Active now");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectConversation = (session) => {
    generation.current += 1;
    setActiveConversationId(session.id);
    setMessages(session.messages);
    historyRef.current = historyFromMessages(session.messages);
    setInput("");
    setHistoryOpen(false);
    setStatus("Active now");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const appendConversationMessage = (sessionId, message) => {
    const record = {
      role: message.role,
      content: String(message.content || "").slice(0, 4000),
      notice: typeof message.notice === "string" ? message.notice.slice(0, 1000) : "",
      sources: Array.isArray(message.sources) ? message.sources.slice(0, 8) : [],
      createdAt: Date.now(),
    };
    setMessages(current => [...current, record].slice(-MAX_MESSAGES_PER_SESSION));
    setConversations(current => {
      const session = current.find((item) => item.id === sessionId) || createConversationSession();
      const updated = {
        ...session,
        id: sessionId,
        title: record.role === "user" && session.title === "New chat" ? titleFromMessage(record.content) : session.title,
        updatedAt: Date.now(),
        messages: [...session.messages, record].slice(-MAX_MESSAGES_PER_SESSION),
      };
      const next = [updated, ...current.filter((item) => item.id !== sessionId)].slice(0, MAX_STORED_SESSIONS);
      writeStoredSessions(ownerRef.current, next);
      return next;
    });
    return record;
  };

  const resizeComposer = (element) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(22, Math.min(element.scrollHeight, 120))}px`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || inFlight.current) return;
    if (!window.EduNex?.getAccessToken?.()) { setAuthGate(true); return; }
    const requestGeneration = generation.current;
    const requestSessionId = activeConversationId || createConversationSession().id;
    const historyBeforeSend = historyRef.current.slice();
    if (!activeConversationId) setActiveConversationId(requestSessionId);
    inFlight.current = true;
    setLoading(true);
    setStatus("Typing…");
    setInput("");
    requestAnimationFrame(() => resizeComposer(inputRef.current));
    appendConversationMessage(requestSessionId, { role: "user", content: text });
    try {
      const courseId = new URLSearchParams(window.location.search).get("courseId");
      const data = await window.EduNex.authRequest("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: historyBeforeSend, courseId: courseId || "", pagePath: window.location.pathname, assistantName }),
      });
      if (requestGeneration !== generation.current) return;
      if (!data?.reply) throw new Error("No answer returned. Please try again.");
      const assistantMessage = { role: "assistant", content: data.reply, sources: data.sources || [], notice: data.notice };
      historyRef.current = [...historyBeforeSend, { role: "user", content: text.slice(0, 2000) }, { role: "assistant", content: data.reply.slice(0, 2000) }].slice(-12);
      appendConversationMessage(requestSessionId, assistantMessage);
      setStatus("Active now");
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      appendConversationMessage(requestSessionId, { role: "assistant", content: `I couldn't answer right now. ${error.message || "Please try again."}` });
      setStatus("Unavailable");
      setInput(text);
      requestAnimationFrame(() => resizeComposer(inputRef.current));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const next = encodeURIComponent(window.location.pathname + window.location.search);
  const visibleConversations = conversations.filter((session) => session.messages.length);
  const learner = window.EduNex?.getUser?.() || {};
  const learnerName = String(learner.fullName || learner.name || "You").trim() || "You";
  const learnerInitial = learnerName.slice(0, 1).toUpperCase();
  const assistantAvatarAlt = assistantName === DEFAULT_ASSISTANT_NAME ? "AI assistant" : `${assistantName} AI assistant`;

  return (
    <div className="react-page-root" data-page="ai-tutor.html">
      <div className="tutor-page">
        <div className="tutor-top-bar">
          <a href="index.html" className="nav-logo" style={{ flexShrink: 0 }} aria-label="Skillomate AI home">
            <BrandLogo />
          </a>
          <div style={{ flex: 1 }}></div>
          <a href="dashboard.html" className="btn btn-ghost btn-sm"><i className="fas fa-th-large" aria-hidden="true"></i> Dashboard</a>
          <a href="courses.html" className="btn btn-ghost btn-sm"><i className="fas fa-play-circle" aria-hidden="true"></i> My Courses</a>
          <img src="data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3ESkillomate%3C/text%3E%3C/svg%3E" className="avatar avatar-sm" alt="" />
        </div>

        <div className="full-tutor">
          <button className={`tutor-history-backdrop${historyOpen ? " is-visible" : ""}`} type="button" aria-label="Close chat history" onClick={() => setHistoryOpen(false)}></button>
          <aside className={`tutor-sidebar${historyOpen ? " is-open" : ""}`} id="nex-chat-history" aria-label="Chat history">
            <div className="tutor-sidebar-head">
              <strong>{assistantName} chats</strong>
              <button className="tutor-icon-button tutor-sidebar-close" type="button" aria-label="Close chat history" onClick={() => setHistoryOpen(false)}><EnxIcon name="close" /></button>
            </div>
            <button onClick={newChat} className="tutor-new-chat" type="button">
              <span>New chat</span><EnxIcon name="plus" />
            </button>
            <div className="tutor-history-label">Previous chats</div>
            <nav className="tutor-history-list" aria-label="Previous chats">
              {visibleConversations.length ? visibleConversations.map((session) => (
                <button
                  className={`tutor-history-item${session.id === activeConversationId ? " is-active" : ""}`}
                  type="button"
                  key={session.id}
                  aria-current={session.id === activeConversationId ? "true" : undefined}
                  onClick={() => selectConversation(session)}
                >
                  <span>{session.title}</span>
                  <small>{dateLabel(session.updatedAt)}</small>
                </button>
              )) : <p className="tutor-history-empty">Your chats will appear here after you send a message.</p>}
            </nav>
          </aside>

          <div className="tutor-chat">
            <div className="chat-header">
              <button className="tutor-icon-button tutor-history-toggle" type="button" aria-label="Open chat history" aria-controls="nex-chat-history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}>
                <EnxIcon name="menu" />
              </button>
              <div className={`tutor-header-avatar${loading ? " is-thinking" : ""}`} aria-hidden="true"><NexAvatar mood={loading ? "thinking" : "idle"} /></div>
              <div className="ai-info">
                <button className="ai-name-button" type="button" onClick={openNameSetup} aria-label={`Customize AI name. Current name: ${assistantName}`}>
                  <span>{assistantName}</span>
                </button>
                <p><span className="online-dot" aria-hidden="true"></span><span role="status">{status}</span></p>
              </div>
              <button className="tutor-icon-button tutor-header-new-chat" type="button" aria-label="Start a new chat" title="New chat" onClick={newChat}>
                <EnxIcon name="plus" />
              </button>
            </div>

            <div className="chat-messages" id="chatMessages" ref={messagesRef} role="log" aria-live="polite" aria-busy={loading}>
              {!messages.length && !loading ? (
                <div className="tutor-empty-state">
                  <div className="tutor-welcome-avatar"><NexAvatar alt={assistantAvatarAlt} /></div>
                  <h2>What can I help you learn?</h2>
                  <p>Ask about your course, a project problem, or practise with a quiz.</p>
                  <div className="tutor-starter-prompts" role="group" aria-label="Suggested questions">
                    {QUICK_PROMPTS.map((prompt) => <button className="quick-prompt" type="button" key={prompt} onClick={() => setPrompt(prompt)}>{prompt}</button>)}
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isLatestReply = !isUser && index === messages.length - 1 && !loading;
                return (
                  <div className={`chat-bubble ${isUser ? "user" : "ai"}`} key={`${message.createdAt || "message"}-${index}`}>
                    {!isUser ? <div className="bub-avatar ai-model-cutout" aria-hidden="true"><NexAvatar className={isLatestReply ? "is-replying" : ""} /></div> : null}
                    <div className="bub-content-wrap">
                      <div className="bub-meta"><strong>{isUser ? "You" : assistantName}</strong><span>{dateLabel(message.createdAt)}</span></div>
                      <div className="bub-content">
                        <ReplyText text={message.content} />
                        {message.notice ? <p role="status">{message.notice}</p> : null}
                        {message.sources?.length ? <div style={{ marginTop: 12, fontSize: ".8rem" }}><strong>References</strong>{message.sources.filter(source => source.url?.startsWith("/course-details.html?")).map(source => <p key={source.id}><a href={source.url}>[{source.id}] {source.title} — {source.section}</a></p>)}</div> : null}
                      </div>
                    </div>
                    {isUser ? <div className="learner-chat-avatar" aria-label={learnerName}>{learner.avatar ? <img src={learner.avatar} alt="" /> : learnerInitial}</div> : null}
                  </div>
                );
              })}
              {loading ? (
                <div className="tutor-thinking" role="status">
                  <span className="bub-avatar ai-model-cutout is-thinking" aria-hidden="true">
                    <span className="ai-thinking-overhead"><span></span><span></span><span></span></span>
                    <NexAvatar mood="thinking" />
                  </span>
                  <span className="tutor-thinking-content">
                    <span className="bub-meta"><strong>{assistantName}</strong><span>typing…</span></span>
                    <span className="tutor-thinking-label" aria-label={`${assistantName} is typing`}>Thinking…</span>
                  </span>
                </div>
              ) : null}
            </div>

            <form className="chat-input-area" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <div className="chat-input-wrap">
                <textarea
                  ref={inputRef}
                  placeholder="Ask about your course or project…"
                  aria-label={`Message ${assistantName}`}
                  maxLength={2000}
                  rows="1"
                  value={input}
                  onChange={(event) => { setInput(event.target.value); resizeComposer(event.target); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                ></textarea>
              </div>
              <button className="send-btn" type="submit" disabled={loading || !input.trim()} title="Send message" aria-label="Send message">
                <EnxIcon name="arrowUp" />
              </button>
              <p className="tutor-disclaimer">{assistantName} can make mistakes. Check important information.</p>
            </form>
          </div>
        </div>
      </div>

      <div className={`ai-name-setup${nameSetupOpen && !authGate ? " is-visible" : ""}`} aria-hidden={!nameSetupOpen || authGate}>
        <section className="ai-name-setup-card" role="dialog" aria-modal="true" aria-labelledby="ai-name-setup-title">
          <div className="ai-name-setup-avatar" aria-hidden="true"><NexAvatar /></div>
          <p className="ai-name-setup-kicker">Your learning companion</p>
          <h2 id="ai-name-setup-title">Name your AI</h2>
          <p>Choose a name that feels personal. You can change it anytime by tapping the name in the chat header.</p>
          <label htmlFor="ai-name-input">AI name</label>
          <input
            id="ai-name-input"
            type="text"
            maxLength="24"
            autoComplete="off"
            value={assistantNameDraft}
            placeholder="Example: Nova"
            onChange={(event) => setAssistantNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveAssistantName();
              }
            }}
          />
          <div className="ai-name-setup-actions">
            {nameSetupComplete ? <button className="btn btn-ghost" type="button" onClick={() => setNameSetupOpen(false)}>Cancel</button> : <button className="btn btn-ghost" type="button" onClick={() => saveAssistantName(DEFAULT_ASSISTANT_NAME)}>Use AI</button>}
            <button className="btn btn-primary" type="button" onClick={() => saveAssistantName()}>Save name</button>
          </div>
        </section>
      </div>

      <div className={`auth-gate${authGate ? " is-visible" : ""}`} id="aiAuthGate">
        <div className="auth-gate-card">
          <h2>Login or sign up to use Nex AI</h2>
          <p>Nex AI is available after you create an Skillomate account or log in.</p>
          <div className="auth-gate-actions">
            <a id="aiGateLogin" className="btn btn-primary" href={`login.html?next=${next}`}>Login</a>
            <a id="aiGateSignup" className="btn btn-ghost" href={`signup.html?next=${next}`}>Sign up</a>
          </div>
        </div>
      </div>
    </div>
  );
}
