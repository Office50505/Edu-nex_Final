import { useEffect, useState } from "react";
import { AdminEditFields, AdminWrite } from "./AdminPermissions.jsx";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDateTime, formatNumber, requireAdmin } from "./adminApi.js";

const EMPTY_FORM = {
  audience: "all",
  type: "announcement",
  title: "",
  body: "",
};

const AUDIENCE_LABELS = {
  all: "All active accounts",
  learners: "Learners only",
  testers: "Test accounts only",
};

const TYPE_LABELS = {
  announcement: "Announcement",
  course_new: "New course",
  course_update: "Course update",
  learning: "Learning reminder",
  subscription: "Subscription update",
  maintenance: "Maintenance",
};

function broadcastStatusClass(status) {
  if (status === "sent") return "good";
  if (status === "failed") return "bad";
  return "warn";
}

export function AdminNotificationsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [audiences, setAudiences] = useState({ all: 0, learners: 0, testers: 0 });
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  async function loadBroadcasts() {
    if (!requireAdmin()) return;
    setLoading(true);
    try {
      const data = await adminJson("/api/admin/notifications/broadcasts?limit=20", {}, "Unable to load notification broadcasts.");
      setAudiences(data.audiences || { all: 0, learners: 0, testers: 0 });
      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load notification broadcasts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Notification Broadcasts | Skillomate";
    loadBroadcasts();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitBroadcast(event) {
    event.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    if (title.length < 3 || body.length < 3) {
      setMessageType("error");
      setMessage("Enter a title and message of at least 3 characters.");
      return;
    }

    const recipientCount = Number(audiences[form.audience] || 0);
    if (!window.confirm(`Send “${title}” to ${formatNumber(recipientCount)} active account${recipientCount === 1 ? "" : "s"}?`)) return;

    setSending(true);
    setMessage("");
    try {
      const data = await adminJson("/api/admin/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({ ...form, title, body }),
      }, "Unable to broadcast the notification.");
      setBroadcasts((current) => [data.broadcast, ...current].filter(Boolean).slice(0, 20));
      setForm(EMPTY_FORM);
      setMessageType("success");
      setMessage(data.message || "Notification broadcast sent.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to broadcast the notification.");
    } finally {
      setSending(false);
    }
  }

  const selectedAudienceCount = Number(audiences[form.audience] || 0);

  return (
    <AdminShell
      activePage="notifications"
      shellClass="notifications-shell"
      title="Notification Broadcasts"
      subtitle="Send in-app announcements and review automatic course notifications."
      actions={<button className="toolbar-button" type="button" onClick={loadBroadcasts} disabled={loading || sending}>Refresh</button>}
    >
      <Message text={message} type={messageType} />

      <section className="summary-grid notification-summary-grid" aria-label="Notification audience summary">
        <div className="summary-card"><strong>All active</strong><span>{formatNumber(audiences.all)}</span><small>Includes learners and testers</small></div>
        <div className="summary-card"><strong>Learners</strong><span>{formatNumber(audiences.learners)}</span><small>Excludes test accounts</small></div>
        <div className="summary-card"><strong>Test accounts</strong><span>{formatNumber(audiences.testers)}</span><small>Safe audience for message checks</small></div>
      </section>

      <div className="notification-workspace-grid">
        <section className="admin-settings-card notification-composer" aria-labelledby="notification-composer-title">
          <div className="admin-settings-card-head">
            <div>
              <span className="admin-settings-eyebrow">Manual broadcast</span>
              <h2 id="notification-composer-title">Compose notification</h2>
              <p>Messages appear in the learner app notification inbox and unread badge on its next refresh.</p>
            </div>
            <span className="admin-status-pill is-live">Live audience</span>
          </div>

          <form className="admin-settings-form notification-form" onSubmit={submitBroadcast}>
            <AdminEditFields disabled={sending}>
              <div className="notification-form-grid">
                <label><span>Audience</span><select value={form.audience} onChange={(event) => updateForm("audience", event.target.value)}><option value="all">All active accounts</option><option value="learners">Learners only</option><option value="testers">Test accounts only</option></select></label>
                <label><span>Notification type</span><select value={form.type} onChange={(event) => updateForm("type", event.target.value)}><option value="announcement">Announcement</option><option value="learning">Learning reminder</option><option value="subscription">Subscription update</option><option value="maintenance">Maintenance</option></select></label>
              </div>
              <label><span>Title</span><input type="text" required minLength="3" maxLength="120" value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="What learners should notice" /></label>
              <label><span>Message</span><textarea required minLength="3" maxLength="500" rows="6" value={form.body} onChange={(event) => updateForm("body", event.target.value)} placeholder="Write a clear, actionable update." /></label>
            </AdminEditFields>
            <div className="notification-compose-footer">
              <span>{formatNumber(selectedAudienceCount)} recipients · {formatNumber(500 - form.body.length)} characters left</span>
              <AdminWrite><button className="toolbar-button primary" type="submit" disabled={sending}>{sending ? "Sending…" : "Send broadcast"}</button></AdminWrite>
            </div>
          </form>
        </section>

        <aside className="admin-settings-card notification-preview" aria-labelledby="notification-preview-title">
          <div className="admin-settings-card-head">
            <div>
              <span className="admin-settings-eyebrow">Learner preview</span>
              <h2 id="notification-preview-title">Notification card</h2>
              <p>Preview of the message learners will see in the app.</p>
            </div>
          </div>
          <div className="notification-preview-card">
            <span className="notification-preview-icon" aria-hidden="true">●</span>
            <div><strong>{form.title.trim() || "Your notification title"}</strong><p>{form.body.trim() || "Your message will appear here before you send it."}</p><small>Now · {TYPE_LABELS[form.type]}</small></div>
          </div>
          <div className="notification-automation-note">
            <strong>Automatic course updates are on</strong>
            <p>Publishing a new course or saving changes to a published course sends an in-app notification to all active accounts. Draft saves stay silent.</p>
          </div>
        </aside>
      </div>

      <section className="admin-settings-card notification-history" aria-labelledby="notification-history-title">
        <div className="admin-settings-card-head">
          <div>
            <span className="admin-settings-eyebrow">Delivery history</span>
            <h2 id="notification-history-title">Recent broadcasts</h2>
            <p>Manual announcements and automatic course events from the latest 20 broadcasts.</p>
          </div>
        </div>
        {loading ? <div className="loading-state">Loading broadcasts…</div> : null}
        {!loading && !broadcasts.length ? <div className="empty-state">No notification broadcasts yet.</div> : null}
        {!loading && broadcasts.length ? <div className="notification-history-list">{broadcasts.map((broadcast) => (
          <article className="notification-history-row" key={broadcast.id}>
            <div><strong>{broadcast.title}</strong><p>{broadcast.body}</p></div>
            <div className="notification-history-meta"><span className={`badge ${broadcastStatusClass(broadcast.status)}`}>{broadcast.status}</span><span>{TYPE_LABELS[broadcast.type] || broadcast.type}</span><span>{AUDIENCE_LABELS[broadcast.audience] || broadcast.audience}</span><span>{formatNumber(broadcast.recipientCount)} recipients</span><span>{formatDateTime(broadcast.createdAt)}</span></div>
          </article>
        ))}</div> : null}
      </section>
    </AdminShell>
  );
}
