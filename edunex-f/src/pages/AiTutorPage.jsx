import { useEffect, useMemo, useRef, useState } from "react";
import { page as aiTutorPage } from "../generated-pages/ai-tutor.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const STARTER_MESSAGES = [
  {
    role: "ai",
    html: (
      <>
        <p>Hi Learner. Based on your progress in <strong>Master the AI Economy</strong>, you're 68% through Module 2 on AI Content Creation. You're doing great.</p>
        <p style={{ marginTop: 8 }}>Want to continue where you left off, or is there something specific you'd like help with today?</p>
      </>
    ),
    time: "10:32 AM",
  },
  {
    role: "user",
    html: <p>How do I start earning with AI this week?</p>,
    time: "10:33 AM",
  },
  {
    role: "ai",
    html: (
      <>
        <p>Great question! Here are 3 ways you can start earning with AI <strong>this week</strong> — based on your current skill level:</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "var(--accent)" }}>1. AI Content Writing (Fastest)</strong><br />Create a Fiverr/Upwork profile offering AI-assisted blog posts or product descriptions. You can charge $25–$75/article. Module 2 covers exactly how to do this.</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "var(--accent-green)" }}>2. Social Media AI Content Packages</strong><br />Offer to manage a local business's social media using AI tools. Package for $300–$500/month. This is beginner-friendly.</p>
        <p style={{ marginTop: 10 }}><strong style={{ color: "#A78BFA" }}>3. ChatGPT Consulting</strong><br />Many businesses don't know how to use ChatGPT. You can charge $50/hour to show them how. Your current knowledge is enough to start.</p>
        <p style={{ marginTop: 10 }}>Which of these sounds most interesting to you? I can walk you through the exact steps.</p>
      </>
    ),
    time: "10:33 AM",
  },
  {
    role: "user",
    html: <p>The Fiverr content writing sounds great. Can you help me set up my profile?</p>,
    time: "10:35 AM",
  },
  {
    role: "ai",
    html: (
      <>
        <p>Absolutely! Here's your Fiverr AI Content Writing profile setup checklist:</p>
        <p style={{ marginTop: 10 }}>✅ <strong>Profile Title:</strong> "AI-Powered Blog Writer | SEO Articles in 24hrs"</p>
        <p style={{ marginTop: 6 }}>✅ <strong>Gig Description:</strong> Emphasise speed, quality, and SEO optimization. I can write your full description — just say the word!</p>
        <p style={{ marginTop: 6 }}>✅ <strong>Pricing:</strong> Start with $25 for 500 words (competitive but profitable). Move to $50+ after 5 reviews.</p>
        <p style={{ marginTop: 6 }}>✅ <strong>Portfolio:</strong> Create 2-3 sample articles today using ChatGPT. I'll give you the prompts.</p>
        <p style={{ marginTop: 6 }}>✅ <strong>Tags:</strong> blog writing, AI content, SEO articles, copywriting, content creation</p>
        <p style={{ marginTop: 10 }}>Want me to write your full Fiverr gig description right now? 💪</p>
      </>
    ),
    time: "10:35 AM",
  },
];

const TOPICS = ["AI Income", "Freelancing", "Automation", "Content", "Prompting"];
const QUICK_PROMPTS = [
  "How do I start earning with AI?",
  "Best AI tools for beginners?",
  "How to find AI freelance clients?",
  "Explain prompt engineering",
];
const FOOTER_PROMPTS = ["Write my Fiverr description", "Give me portfolio article prompts", "How to get first reviews?", "What should I charge?"];

export function AiTutorPage() {
  const [activeTopic, setActiveTopic] = useState("AI Income");
  const [messages, setMessages] = useState(STARTER_MESSAGES);
  const [input, setInput] = useState("");
  const [authGate, setAuthGate] = useState(false);
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
    if (!runtimeReady) return;
    if (!window.EduNex?.getAccessToken?.()) setAuthGate(true);
  }, [runtimeReady]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const setPrompt = (text) => {
    setInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text, time: "Just now" }]);

    let replyText = "Great question! I'm NEX, your AI learning assistant. Let me help you with that...";
    const courseId = new URLSearchParams(window.location.search).get("courseId");
    if (window.EduNex && courseId) {
      try {
        const existing = messages.map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.text || "",
        })).filter((item) => item.content);
        await window.EduNex.authRequest("/api/ai-tutor", {
          method: "POST",
          body: JSON.stringify({ course: courseId, messages: [...existing, { role: "user", content: text }] }),
        });
        replyText = "Saved this question to your course tutor thread. Your mentor can continue from this context.";
      } catch (error) {
        replyText = error.message || replyText;
      }
    }

    window.setTimeout(() => {
      setMessages((current) => [...current, { role: "ai", text: replyText, time: "Just now" }]);
    }, 500);
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
              <button onClick={() => location.reload()} className="btn btn-primary" type="button" style={{ width: "100%", justifyContent: "center" }}>
                <i className="fas fa-plus" aria-hidden="true"></i> New Chat
              </button>
            </div>
            <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", marginBottom: 10, padding: "0 4px" }}>Recent Chats</div>
            {[
              ["How to start AI freelancing?", "Today · 4 messages"],
              ["Prompt engineering tips", "Yesterday · 12 messages"],
              ["AI automation for clients", "2 days ago · 8 messages"],
              ["ChatGPT vs Claude comparison", "3 days ago · 15 messages"],
              ["Module 2 review — content", "4 days ago · 6 messages"],
              ["Setting up Fiverr profile", "5 days ago · 9 messages"],
            ].map(([title, preview], index) => (
              <div className={`chat-history-item${index === 0 ? " active" : ""}`} key={title}>
                <div className="chi-title">{title}</div>
                <div className="chi-preview">{preview}</div>
              </div>
            ))}
            <div style={{ flex: 1 }}></div>
            <div style={{ padding: "12px 0", borderTop: "1px solid var(--border)", marginTop: 12 }}>
              <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", marginBottom: 10 }}>Topics</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TOPICS.map((topic) => (
                  <button className={`topic-chip${activeTopic === topic ? " active" : ""}`} type="button" key={topic} onClick={() => setActiveTopic(topic)}>{topic}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="tutor-chat">
            <div className="chat-header">
              <div className="ai-avatar">N</div>
              <div className="ai-info">
                <h1>NEX — Your AI Learning Tutor</h1>
                <p>Powered by Skillomate AI · Specialised in AI income strategies</p>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="online-badge">Online</span>
                <button className="btn btn-ghost btn-sm" type="button" aria-label="Tutor settings"><i className="fas fa-sliders-h" aria-hidden="true"></i></button>
              </div>
            </div>

            <div className="chat-messages" id="chatMessages" ref={messagesRef}>
              <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--accent-green))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "#000", margin: "0 auto 12px" }}>N</div>
                <h2 style={{ marginBottom: 6 }}>Hello, Learner. I'm NEX.</h2>
                <p style={{ fontSize: ".9rem", maxWidth: 480, margin: "0 auto" }}>I'm your personal AI learning tutor. I know everything in your Skillomate curriculum and can help you apply it to earn real income. Ask me anything!</p>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", paddingBottom: 12 }}>
                {QUICK_PROMPTS.map((prompt) => <button className="quick-prompt" type="button" key={prompt} onClick={() => setPrompt(prompt)}>{prompt}</button>)}
              </div>

              {messages.map((message, index) => (
                <div className={`chat-bubble ${message.role === "user" ? "user" : "ai"}`} key={index}>
                  {message.role !== "user" ? <div className="bub-avatar">N</div> : null}
                  <div className="bub-content">
                    {message.html || <p>{message.text}</p>}
                    <div className={`bub-time${message.role === "user" ? "" : ""}`}>{message.time}</div>
                  </div>
                  {message.role === "user" ? <div className="bub-avatar">A</div> : null}
                </div>
              ))}
            </div>

            <div className="quick-prompts">
              {FOOTER_PROMPTS.map((prompt) => <button className="quick-prompt" type="button" key={prompt} onClick={() => setPrompt(prompt)}>{prompt}</button>)}
            </div>

            <div className="chat-input-area">
              <div className="chat-input-wrap">
                <div className="input-actions">
                  <button className="input-btn" type="button" title="Attach file" aria-label="Attach file"><i className="fas fa-paperclip" aria-hidden="true"></i></button>
                  <button className="input-btn" type="button" title="Voice message" aria-label="Voice message"><i className="fas fa-microphone" aria-hidden="true"></i></button>
                </div>
                <textarea
                  ref={inputRef}
                  placeholder="Ask NEX anything about AI, your courses, or earning with AI..."
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
              <button className="send-btn" type="button" onClick={sendMessage} title="Send message" aria-label="Send message">
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
