import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/+$/, "");
const apiUrl = (path) => `${API}${path}`;
const SUGGESTIONS = [
  "What is prompt engineering?",
  "Explain ChatGPT basics",
  "Give me a quick quiz",
];

function formatCourseName(course) {
  return course.id.replace(/\.txt$/i, "").replaceAll("-", " ");
}

function ChatBot({ initialCourseId, initialCourseName }) {
  const [courseId, setCourseId] = useState(initialCourseId);
  const [courseName, setCourseName] = useState(initialCourseName);
  const [courses, setCourses] = useState([]);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Ready when you are. Ask about ChatGPT, prompt engineering, and concepts from this lesson.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState("checking");
  const bottom = useRef(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then((res) => res.json())
      .then((data) => setStatus(data.ok ? "online" : "limited"))
      .catch(() => setStatus("offline"));
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/courses"))
      .then((res) => res.json())
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
  }, []);

  const selectCourse = (course) => {
    setCourseId(course.id);
    setCourseName(formatCourseName(course));
    setCoursesOpen(false);
    setMessages([
      {
        role: "assistant",
        content: `Ready when you are. Ask about ${formatCourseName(course)}.`,
      },
    ]);
    setStreaming("");
  };

  const send = async (value = input) => {
    if (!value.trim() || loading) return;
    const question = value.trim();
    const nextMessages = [...messages, { role: "user", content: question }];

    setInput("");
    setMessages(nextMessages);
    setLoading(true);
    setStreaming("");

    let full = "";

    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          courseId,
          history: messages.slice(-3),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      full = data.answer || "I could not generate an answer. Try asking again.";
    } catch (error) {
      console.error("AI chat error", error);
      full = "I could not reach the local AI service. Check that the API, Ollama, and MongoDB Atlas are reachable.";
    }

    setStreaming("");
    setMessages((prev) => [...prev, { role: "assistant", content: full }]);
    setLoading(false);
  };

  return (
    <main className="app-shell">
      <section className="course-panel" aria-label="Course summary">
        <div>
          <p className="eyebrow">Local Course AI</p>
          <h1>{courseName}</h1>
          <p className="summary">
            Fast answers from your indexed transcript, scoped to this lesson.
          </p>
        </div>

        <div className="stat-grid">
          <div>
            <span>Mode</span>
            <strong>RAG</strong>
          </div>
          <button
            type="button"
            className="stat-card course-stat"
            aria-expanded={coursesOpen}
            onClick={() => setCoursesOpen((open) => !open)}
          >
            <span>Course</span>
            <strong>{courseId}</strong>
          </button>
          <div>
            <span>Status</span>
            <strong>{status}</strong>
          </div>
        </div>

        {coursesOpen && (
          <div className="course-list" aria-label="Courses">
            {courses.map((course) => (
              <button
                type="button"
                className={course.id === courseId ? "active" : ""}
                key={course.id}
                onClick={() => selectCourse(course)}
              >
                <strong>{formatCourseName(course)}</strong>
                <span>{course.modules.length} module{course.modules.length === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="chat-panel" aria-label="AI chat">
        <header className="chat-header">
          <div>
            <span className="status-dot" data-status={status} />
            <span>{status === "online" ? "Ready" : "Local services"}</span>
          </div>
          <p>Answers use the course transcript</p>
        </header>

        <div className="messages">
          {messages.map((message, index) => (
            <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="avatar">{message.role === "user" ? "You" : "AI"}</div>
              <div className="bubble">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </article>
          ))}

          {streaming && (
            <article className="message assistant">
              <div className="avatar">AI</div>
              <div className="bubble">
                <ReactMarkdown>{`${streaming}▌`}</ReactMarkdown>
              </div>
            </article>
          )}

          {loading && !streaming && (
            <article className="message assistant">
              <div className="avatar">AI</div>
              <div className="bubble subtle">Searching the lesson...</div>
            </article>
          )}
          <div ref={bottom} />
        </div>

        <div className="suggestions" aria-label="Suggested prompts">
          {SUGGESTIONS.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => send(suggestion)} disabled={loading}>
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            placeholder="Ask a course question..."
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? "..." : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  return <ChatBot initialCourseId="AI Full Course.txt" initialCourseName="AI Full Course" />;
}
