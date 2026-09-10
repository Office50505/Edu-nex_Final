import { useEffect, useMemo, useRef, useState } from "react";
import { page as aiTutorPage } from "../generated-pages/ai-tutor.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const QUICK_PROMPTS = ["Explain prompt engineering with an example", "My AI character's face changes between clips", "Help me choose a course", "Quiz me on prompting"];
const FOOTER_PROMPTS = ["Explain that more simply", "Give me a practice exercise", "Quiz me", "Show a practical example"];

function ReplyText({ text }) {
  return String(text || "").split("\n").map((line, index) => <p key={index} style={{ marginBottom: 6 }}>{line.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</p>);
}

export function AiTutorPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [authGate, setAuthGate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
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
        historyRef.current = [];
        setMessages([]);
        setStatus("Ready");
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

  const newChat = () => {
    generation.current += 1;
    historyRef.current = [];
    setMessages([]);
    setInput("");
    setStatus("Ready");
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || inFlight.current) return;
    if (!window.EduNex?.getAccessToken?.()) { setAuthGate(true); return; }
    const requestGeneration = generation.current;
    inFlight.current = true;
    setLoading(true);
    setStatus("Thinking…");
    setInput("");
    setMessages(current => [...current, { role: "user", text, time: "Just now" }]);
    try {
      const courseId = new URLSearchParams(window.location.search).get("courseId");
      const data = await window.EduNex.authRequest("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: historyRef.current, courseId: courseId || "", pagePath: window.location.pathname }),
      });
      if (requestGeneration !== generation.current) return;
      if (!data?.reply) throw new Error("No answer returned. Please try again.");
      historyRef.current = [...historyRef.current, { role: "user", content: text.slice(0, 2000) }, { role: "assistant", content: data.reply.slice(0, 2000) }].slice(-12);
      setMessages(current => [...current, { role: "ai", text: data.reply, sources: data.sources || [], notice: data.notice, time: "Just now" }]);
      setStatus(data.provider === "built-in-course-guide" ? "Basic guide" : "Ready");
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      setMessages(current => [...current, { role: "ai", text: `I couldn't answer right now. ${error.message || "Please try again."}`, error: true, time: "Just now" }]);
      setStatus("Unavailable");
      setInput(text);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const next = encodeURIComponent(window.location.pathname + window.location.search);

  return (
    <div className="react-page-root" data-page="ai-tutor.html">
      <div className="tutor-page">
        <div className="tutor-top-bar">
          <a href="index.html" className="nav-logo" style={{ flexShrink: 0 }}>
            <div className="logo-mark">N</div>
            <span className="logo-name">Skillo<span>mate</span></span>
          </a>
          <div style={{ flex: 1 }}></div>
          <a href="dashboard.html" className="btn btn-ghost btn-sm"><i className="fas fa-th-large" aria-hidden="true"></i> Dashboard</a>
          <a href="courses.html" className="btn btn-ghost btn-sm"><i className="fas fa-play-circle" aria-hidden="true"></i> My Courses</a>
          <img src="data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3ESkillomate%3C/text%3E%3C/svg%3E" className="avatar avatar-sm" alt="" />
        </div>

        <div className="full-tutor">
          <div className="tutor-sidebar">
            <div style={{ marginBottom: 16 }}>
              <button onClick={newChat} className="btn btn-primary" type="button" style={{ width: "100%", justifyContent: "center" }}>
                <i className="fas fa-plus" aria-hidden="true"></i> New Chat
              </button>
            </div>
            <div style={{ padding: 12, color: "var(--text-muted)" }}>
              <strong>This conversation</strong>
              <p style={{ marginTop: 12 }}>{messages.find(message => message.role === "user")?.text || "Start with a question about your course or project."}</p>
              <p style={{ marginTop: 12 }}>Follow up naturally, ask for examples, or try a quiz. New chat clears the conversation.</p>
            </div>
          </div>

          <div className="tutor-chat">
            <div className="chat-header">
              <div className="ai-avatar">N</div>
              <div className="ai-info">
                <h1>NEX — Your AI Learning Tutor</h1>
                <p>Course explanations, practical examples, and guided practice</p>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="online-badge" role="status">{status}</span>
              </div>
            </div>

            <div className="chat-messages" id="chatMessages" ref={messagesRef} role="log" aria-live="polite" aria-busy={loading}>
              <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--accent-green))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "#000", margin: "0 auto 12px" }}>N</div>
                <h2 style={{ marginBottom: 6 }}>Hello, Learner. I'm NEX.</h2>
                <p style={{ fontSize: ".9rem", maxWidth: 480, margin: "0 auto" }}>Ask about a concept, troubleshoot your project, or practise with a quiz. I'll distinguish course references from general examples and tell you when information is missing.</p>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", paddingBottom: 12 }}>
                {QUICK_PROMPTS.map((prompt) => <button className="quick-prompt" type="button" key={prompt} onClick={() => setPrompt(prompt)}>{prompt}</button>)}
              </div>

              {messages.map((message, index) => (
                <div className={`chat-bubble ${message.role === "user" ? "user" : "ai"}`} key={index}>
                  {message.role !== "user" ? <div className="bub-avatar">N</div> : null}
                  <div className="bub-content">
                    <ReplyText text={message.text} />
                    {message.notice ? <p role="status">{message.notice}</p> : null}
                    {message.sources?.length ? <div style={{ marginTop: 12, fontSize: ".8rem" }}><strong>References</strong>{message.sources.filter(source => source.url?.startsWith("/course-details.html?")).map(source => <p key={source.id}><a href={source.url}>[{source.id}] {source.title} — {source.section}</a></p>)}</div> : null}
                    <div className={`bub-time${message.role === "user" ? "" : ""}`}>{message.time}</div>
                  </div>
                  {message.role === "user" ? <div className="bub-avatar">A</div> : null}
                </div>
              ))}
              {loading ? <p role="status" style={{ padding: 16 }}>NEX is thinking…</p> : null}
            </div>

            <div className="quick-prompts">
              {FOOTER_PROMPTS.map((prompt) => <button className="quick-prompt" type="button" key={prompt} onClick={() => setPrompt(prompt)}>{prompt}</button>)}
            </div>

            <div className="chat-input-area">
              <div className="chat-input-wrap">
                <textarea
                  ref={inputRef}
                  placeholder="Ask about your course or project…"
                  aria-label="Message NEX"
                  maxLength={2000}
                  rows="1"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                ></textarea>
              </div>
              <button className="send-btn" type="button" onClick={sendMessage} disabled={loading || !input.trim()} title="Send message" aria-label="Send message">
                <i className="fas fa-paper-plane" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
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
