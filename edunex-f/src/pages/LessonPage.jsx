import { useEffect, useMemo, useRef, useState } from "react";
import { page as lessonPage } from "../generated-pages/lesson.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3ESkillomate%3C/text%3E%3C/svg%3E";

const initialMessages = [
  {
    id: "ai-1",
    type: "ai",
    time: "NEX AI  ·  12:44",
    body: (
      <>
        Skillomate Mentor is currently detailing <strong>ReLU (Rectified Linear Unit)</strong>. It's the most common activation function in deep learning today.
      </>
    ),
  },
  {
    id: "user-1",
    type: "user",
    time: "YOU  ·  12:45",
    body: "Why is it better than Sigmoid for deep networks?",
  },
  {
    id: "ai-2",
    type: "ai",
    time: "NEX AI  ·  JUST NOW",
    body: (
      <>
        Unlike Sigmoid, ReLU doesn't saturate in the positive direction. This prevents the <strong>vanishing gradient problem</strong>, allowing deep networks to learn much faster.
        <div className="code-block">{`f(x) = max(0, x)
f'(x) = 1 if x > 0 else 0`}</div>
      </>
    ),
  },
];

function ChatMessage({ message }) {
  if (message.type === "user") {
    return (
      <div className="msg-user">
        <div className="msg-user-bubble">{message.body}</div>
        <div className="msg-time-user">{message.time}</div>
      </div>
    );
  }

  return (
    <div className="msg-ai">
      <div className="msg-ai-text">{message.body}</div>
      <div className="msg-time-ai">{message.time}</div>
    </div>
  );
}

export function LessonPage() {
  const [aiOpen, setAiOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const chatInputRef = useRef(null);
  const askAiRef = useRef(null);
  const messagesRef = useRef(null);

  usePageStyle("react-page-style-lesson", lessonPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...lessonPage,
    scripts: lessonPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = lessonPage.title;
    document.documentElement.lang = lessonPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    if (!aiOpen) return undefined;
    const timer = window.setTimeout(() => chatInputRef.current?.focus(), 350);
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setAiOpen(false);
        window.setTimeout(() => askAiRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [aiOpen]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const closeAiPanel = () => {
    setAiOpen(false);
    window.setTimeout(() => askAiRef.current?.focus(), 0);
  };

  const seekFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    setProgress(Math.round(next));
  };

  const seekFromKeyboard = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setProgress((current) => {
      if (event.key === "Home") return 0;
      if (event.key === "End") return 100;
      return Math.max(0, Math.min(100, current + (event.key === "ArrowRight" ? 5 : -5)));
    });
  };

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    const stamp = Date.now();
    setMessages((current) => [
      ...current,
      { id: `user-${stamp}`, type: "user", time: "YOU  ·  JUST NOW", body: text },
    ]);
    setChatInput("");
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `ai-${stamp}`,
          type: "ai",
          time: "NEX AI  ·  JUST NOW",
          body: "Great question! This is a key concept in modern deep learning. Let me pull the relevant section from the current lesson for you.",
        },
      ]);
    }, 900);
  };

  const useQuickAction = (label) => {
    setChatInput(label.charAt(0) + label.slice(1).toLowerCase());
    chatInputRef.current?.focus();
  };

  return (
    <div className="react-page-root" data-page="lesson.html">
      <div className="lesson-outer">
        <div className="back-bar">
          <a href="dashboard.html" className="back-btn">
            <i className="fas fa-arrow-left" aria-hidden="true"></i> Dashboard
          </a>
          <span className="back-bar-title">Neural Network Fundamentals</span>
          <div className="back-bar-prog">
            <span>Module 4 of 12</span>
            <span className="prog-pill">68% Complete</span>
          </div>
        </div>

        <div className={`lesson-layout${aiOpen ? " ai-open" : ""}`}>
          <div className="player-col">
            <div className="video-card">
              <img className="video-img" src={PLACEHOLDER_IMAGE} alt="Deep Dive: Neural Network Architectures" />

              <div className="vid-top-btns">
                <button className="vid-ctrl-btn" type="button" aria-label="Save lesson"><i className="fas fa-bookmark" aria-hidden="true"></i></button>
                <button className="vid-ctrl-btn" type="button" aria-label="Share lesson"><i className="fas fa-share-alt" aria-hidden="true"></i></button>
                <button className="vid-ctrl-btn" type="button" aria-label="Toggle captions"><i className="fas fa-closed-captioning" aria-hidden="true"></i></button>
              </div>

              <div className="vid-bottom-overlay">
                <div className="vid-meta-row">
                  <span className="module-badge">MODULE 4</span>
                  <span className="vid-dot"></span>
                  <span className="vid-timestamp">12:45 / 45:00</span>
                </div>
                <h1 className="vid-title">Deep Dive: Neural Network Architectures</h1>
                <p className="vid-subtitle">Explaining backpropagation and ReLU activation layers with Skillomate Mentor.</p>
                <div className="vid-controls">
                  <button
                    className="vid-play-btn"
                    type="button"
                    aria-label={playing ? "Pause lesson" : "Play lesson"}
                    onClick={() => setPlaying((value) => !value)}
                  >
                    <i className={`fas ${playing ? "fa-pause" : "fa-play"}`} style={{ marginLeft: playing ? 0 : 2 }} aria-hidden="true"></i>
                  </button>
                  <div
                    className="vid-scrubber"
                    role="slider"
                    tabIndex={0}
                    aria-label="Lesson progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={progress}
                    onClick={seekFromPointer}
                    onKeyDown={seekFromKeyboard}
                  >
                    <div className="vid-scrubber-fill" style={{ width: `${progress}%` }}>
                      <div className="vid-scrubber-thumb"></div>
                    </div>
                  </div>
                  <button
                    className="ask-ai-btn"
                    type="button"
                    ref={askAiRef}
                    aria-controls="aiPanel"
                    aria-expanded={aiOpen}
                    onClick={() => setAiOpen((value) => !value)}
                  >
                    <i className="fas fa-bolt" aria-hidden="true"></i> Ask AI
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="content-col">
            <div className="cc-card">
              <h2 className="cc-heading">Course Content</h2>
              <div className="cc-list">
                <div className="cc-item cc-done">
                  <div className="cc-num">01</div>
                  <div className="cc-info">
                    <h3 className="cc-title">Intro to ML</h3>
                    <div className="cc-meta-row"><span>08:22</span><span>·</span><span className="cc-status-done">Completed</span></div>
                  </div>
                </div>
                <div className="cc-item cc-active" aria-current="step">
                  <div className="cc-num">02</div>
                  <img className="cc-thumb" src={PLACEHOLDER_IMAGE} alt="" />
                  <div className="cc-info">
                    <h3 className="cc-title">Neural Architectures</h3>
                    <div className="cc-meta-row"><span>45:00</span><span>·</span><span className="cc-status-active">In Progress</span></div>
                  </div>
                </div>
                <div className="cc-item cc-locked">
                  <div className="cc-num">03</div>
                  <div className="cc-info">
                    <h3 className="cc-title">Deep Learning Labs</h3>
                    <div className="cc-meta-row"><span>12:15</span><span>·</span><span className="cc-status-locked"><i className="fas fa-lock" style={{ fontSize: ".6rem" }} aria-hidden="true"></i> Locked</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`ai-panel${aiOpen ? " open" : ""}`} id="aiPanel" role="dialog" aria-modal="false" aria-labelledby="aiPanelTitle" aria-hidden={!aiOpen}>
            <div className="ai-chat-card">
              <div className="chat-header">
                <div className="chat-ai-icon"><i className="fas fa-bolt" aria-hidden="true"></i></div>
                <div className="chat-header-text">
                  <h2 className="chat-title" id="aiPanelTitle">Nex AI Tutor</h2>
                  <div className="chat-synced"><div className="synced-dot"></div>SYNCED TO LESSON</div>
                </div>
                <button className="chat-close" type="button" aria-label="Close Nex AI tutor" onClick={closeAiPanel}><i className="fas fa-times" aria-hidden="true"></i></button>
              </div>

              <div className="chat-messages" ref={messagesRef}>
                {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
              </div>

              <div className="chat-input-section">
                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type a message..."
                    aria-label="Message Nex AI tutor"
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") sendMessage();
                    }}
                  />
                  <button className="chat-send" type="button" aria-label="Send message" onClick={sendMessage}>
                    <i className="fas fa-paper-plane" style={{ fontSize: ".72rem", transform: "rotate(45deg)" }} aria-hidden="true"></i>
                  </button>
                </div>
                <div className="quick-actions">
                  {["SUMMARY", "EXPLAIN FORMULA", "FLASHCARDS"].map((label) => (
                    <button className="qa-chip" type="button" key={label} onClick={() => useQuickAction(label)}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
