import { DeletionRequests } from "./DeletionRequests";
import { csvEscape } from "./adminExport.js";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDate, formatDateTime, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";

const segments = [
  ["all", "All learners"],
  ["paying", "Paying"],
  ["trial", "Trials"],
  ["needs_attention", "Needs attention"],
  ["engaged", "Engaged"],
  ["completed_certificate", "Completed certificate"],
  ["low_progress", "Low progress"],
  ["banned", "Banned"],
  ["trash", "Trash"],
];

function statusBadgeClass(status) {
  if (["active", "subscribed"].includes(status)) return "good";
  if (["1rs trial", "trial"].includes(status)) return "warn";
  if (["cancelled", "expired"].includes(status)) return "bad";
  return "";
}

function progressAverage(user) {
  return Number(user.progressSummary?.averageProgress || 0);
}

function totalCourses(user) {
  return Number(user.progressSummary?.totalCourses || 0);
}

function completedCourses(user) {
  return Number(user.progressSummary?.completedCourses || 0);
}

function watchMinutes(user) {
  return Number(user.watchSummary?.watchedMinutes || 0);
}

function isVerified(user) {
  return Boolean(user.isMobileVerified && user.isEmailVerified);
}

function lifecycleLabel(user) {
  const status = user.subscriptionStatus || "none";
  if (["active", "subscribed"].includes(status)) return "Customer";
  if (["1rs trial", "trial"].includes(status)) return "Trial learner";
  if (["cancelled", "expired"].includes(status)) return "Retention";
  return "Lead";
}

function engagementLabel(user) {
  if (progressAverage(user) >= 75 || completedCourses(user) > 0) return "Highly engaged";
  if (progressAverage(user) >= 35 || totalCourses(user) >= 2) return "Active learner";
  if (totalCourses(user) > 0) return "Started learning";
  return "No activity";
}

function initials(user) {
  const source = user.fullName || user.email || user.mobileNumber || "Learner";
  const parts = String(source).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "L";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatGender(value) {
  const gender = String(value || "").trim().toLowerCase();
  return gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : "Not provided";
}

function formatAge(value) {
  const age = Number(value);
  return Number.isFinite(age) && age > 0 ? `${formatNumber(age)} years` : "Age not provided";
}

function matchesSegment(user, segment) {
  if (segment === "trash") return Boolean(user.deletedAt);
  if (user.deletedAt) return false;
  const status = user.subscriptionStatus || "none";
  if (segment === "paying") return ["active", "subscribed"].includes(status);
  if (segment === "trial") return ["1rs trial", "trial"].includes(status);
  if (segment === "needs_attention") return !isVerified(user) || ["cancelled", "expired", "none"].includes(status) || totalCourses(user) === 0;
  if (segment === "engaged") return progressAverage(user) >= 35 || completedCourses(user) > 0 || watchMinutes(user) > 0;
  if (segment === "completed_certificate") return completedCourses(user) > 0;
  if (segment === "low_progress") return totalCourses(user) > 0 && progressAverage(user) < 35;
  if (segment === "banned") return Boolean(user.isBanned || user.status === "banned");
  return true;
}

function userSearchText(user) {
  return [
    user.fullName,
    user.email,
    user.mobileNumber,
    user._id,
    user.subscriptionStatus,
    user.gender,
    user.age,
    ...(user.progressCourses || []).map((course) => course.courseTitle),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchesSearch(user, query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return true;
  if (userSearchText(user).includes(cleanQuery)) return true;
  const queryDigits = cleanQuery.replace(/\D/g, "");
  const mobileDigits = String(user.mobileNumber || "").replace(/\D/g, "");
  return queryDigits.length >= 4 && mobileDigits.includes(queryDigits);
}

function DetailStat({ label, value }) {
  return (
    <div className="crm-detail-stat">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function ProgressRow({ course }) {
  const percent = Math.max(0, Math.min(100, Number(course.progressPercent || 0)));
  return (
    <div className="progress-row">
      <div>
        <strong>{course.courseTitle || "Untitled course"}</strong>
        <span>{course.courseId || "No course id"}</span>
      </div>
      <div>
        <strong>{formatNumber(course.completedCount)} / {formatNumber(course.totalVideos)} videos</strong>
        <span>Updated {formatDate(course.updatedAt)}</span>
      </div>
      <div>
        <strong>{formatNumber(percent)}% progress</strong>
        <div className="progress-meter" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

function LearnerDetailDrawer({ user, tab, setTab, onClose, ipLocation }) {
  if (!user) return null;
  const progress = user.progressCourses || [];
  const watch = user.watchSummary || {};
  const tabs = ["Overview", "Course progress", "Orders/payments", "Certificates", "Activity"];
  return (
    <aside className="learner-detail-drawer" aria-label="Learner detail">
      <div className="drawer-head">
        <div className="crm-contact-cell">
          <div className="crm-avatar" aria-hidden="true">{initials(user)}</div>
          <div><strong>{user.fullName || "Learner"}</strong><span>{user.email || "No email"}</span><span>{user.mobileNumber || "No mobile"}</span></div>
        </div>
        <button className="toolbar-button" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="drawer-tabs" role="tablist">
        {tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} key={item} type="button" onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "Overview" ? (
        <div className="crm-detail-grid">
          <DetailStat label="User ID" value={user._id || "No ID"} /><DetailStat label="Lifecycle" value={lifecycleLabel(user)} /><DetailStat label="Subscription" value={user.subscriptionStatus || "none"} /><DetailStat label="Verified" value={isVerified(user) ? "Yes" : "Pending"} /><DetailStat label="Joined" value={formatDateTime(user.createdAt)} /><DetailStat label="Last active" value={formatDate(user.lastActiveAt || watch.lastWatchedAt)} /><DetailStat label="Last IP address" value={user.networkSummary?.ipAddress || "Not recorded"} /><DetailStat label="Approx. location" value={ipLocation?.location || "Open to locate"} /><DetailStat label="IP recorded" value={user.networkSummary?.recordedAt ? formatDateTime(user.networkSummary.recordedAt) : "Not recorded"} /><DetailStat label="Watch time" value={formatWatchDuration(watchMinutes(user))} /><DetailStat label="Average completion" value={`${formatNumber(progressAverage(user))}%`} />
        </div>
      ) : null}
      {tab === "Course progress" ? <div className="progress-list">{progress.length ? progress.map((course) => <ProgressRow course={course} key={`${user._id}-drawer-${course.courseId}`} />) : <div className="empty-state">No course progress yet.</div>}</div> : null}
      {tab === "Orders/payments" ? <div className="empty-state">Backend API not connected for learner order history yet.</div> : null}
      {tab === "Certificates" ? <div className="empty-state">Backend API not connected for learner-specific certificate records yet.</div> : null}
      {tab === "Activity" ? <div className="empty-state">Backend API not connected for learner activity and audit events yet.</div> : null}
      <div className="drawer-actions">
        <button className="toolbar-button" type="button" disabled>Ban / unban</button>
        <button className="toolbar-button" type="button" disabled>Update subscription</button>
        <button className="toolbar-button" type="button" disabled>Resend certificate</button>
        <button className="toolbar-button" type="button" disabled>Export record</button>
      </div>
    </aside>
  );
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [accountStatus, setAccountStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [segment, setSegment] = useState("all");
  const [openIds, setOpenIds] = useState(new Set());
  const [selectedUser, setSelectedUser] = useState(null);
  const [drawerTab, setDrawerTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [updatingId, setUpdatingId] = useState(null);
  const [actionHistory, setActionHistory] = useState({});
  const [ipLocations, setIpLocations] = useState({});
  const deferredQuery = useDeferredValue(query);

  async function loadUsers() {
    if (!requireAdmin()) return;
    setLoading(true);
    setMessage("");
    try {
      const rows = await adminJson("/api/admin/user-management", {}, "Unable to load users.");
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "User Management | Skillomate";
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q");
    if (initialQuery) setQuery(initialQuery);
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const rows = users.filter((user) => {
      const matchesStatus = status === "all" || user.subscriptionStatus === status;
      const matchesAccount = accountStatus === "all" || (accountStatus === "active" ? user.isActive : !user.isActive);
      return matchesStatus && matchesAccount && matchesSearch(user, deferredQuery) && matchesSegment(user, segment);
    });

    return rows.sort((a, b) => {
      if (sort === "watch") return watchMinutes(b) - watchMinutes(a);
      if (sort === "progress") return progressAverage(b) - progressAverage(a);
      if (sort === "courses") return totalCourses(b) - totalCourses(a);
      if (sort === "name") return String(a.fullName || a.email || "").localeCompare(String(b.fullName || b.email || ""));
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [users, deferredQuery, status, accountStatus, sort, segment]);

  useEffect(() => { setPage(1); }, [deferredQuery, status, accountStatus, sort, segment]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * 25, currentPage * 25);

  const summary = useMemo(() => {
    const totalProgressCourses = filteredUsers.reduce((sum, user) => sum + totalCourses(user), 0);
    const totalWatchMinutes = filteredUsers.reduce((sum, user) => sum + watchMinutes(user), 0);
    const activeUsers = filteredUsers.filter((user) => user.isActive).length;
    const subscribedUsers = filteredUsers.filter((user) => ["active", "subscribed"].includes(user.subscriptionStatus)).length;
    const complete = filteredUsers.reduce((sum, user) => sum + completedCourses(user), 0);
    const usersWithAge = filteredUsers.filter((user) => user.age != null && Number(user.age) > 0 && Number.isFinite(Number(user.age)));
    const averageAge = usersWithAge.length ? Math.round(usersWithAge.reduce((sum, user) => sum + Number(user.age || 0), 0) / usersWithAge.length) : null;
    return [
      ["Users", formatNumber(filteredUsers.length)],
      ["Active Users", formatNumber(activeUsers)],
      ["Paid Subscribers", formatNumber(subscribedUsers)],
      ["Watch Time", formatWatchDuration(totalWatchMinutes)],
      ["Average Age", averageAge ? `${formatNumber(averageAge)} years` : "No age"],
      ["Progress Courses", `${formatNumber(totalProgressCourses)} / ${formatNumber(complete)}`],
    ];
  }, [filteredUsers]);

  async function toggleOpen(userId) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    if (!openIds.has(userId) && !actionHistory[userId]) {
      try {
        const history = await adminJson(`/api/admin/users/${encodeURIComponent(userId)}/actions`, {}, "Unable to load action history.");
        setActionHistory((current) => ({ ...current, [userId]: Array.isArray(history) ? history : [] }));
      } catch (_) {
        setActionHistory((current) => ({ ...current, [userId]: [] }));
      }
    }
    if (!openIds.has(userId) && !ipLocations[userId]) loadIpLocation(userId);
  }

  async function loadIpLocation(userId) {
    setIpLocations((current) => ({ ...current, [userId]: { loading: true, location: "Locating…" } }));
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(userId)}/ip-location`, {}, "Unable to locate IP address.");
      setIpLocations((current) => ({ ...current, [userId]: { loading: false, location: data.location || "Unavailable" } }));
    } catch (_) {
      setIpLocations((current) => ({ ...current, [userId]: { loading: false, location: "Unavailable" } }));
    }
  }

  function mergeUser(userId, patch) {
    setUsers((rows) => rows.map((user) => String(user._id) === String(userId) ? { ...user, ...patch } : user));
  }

  async function changeAccountAccess(user) {
    if (updatingId) return;
    const banning = user.isActive !== false;
    const label = user.fullName || user.email || user.mobileNumber || "this user";
    const reason = banning
      ? window.prompt(`Ban ${label}\n\nEnter the reason (required). Press OK to confirm the ban:`, "Banned by admin")
      : "Admin restored account access";
    if (banning && !reason?.trim()) return;
    if (!banning && !window.confirm(`Unban ${label} and restore account access?`)) return;
    setUpdatingId(user._id);
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/access`, {
        method: "PATCH", body: JSON.stringify({ action: banning ? "ban" : "unban", reason: reason.trim() }),
      }, `Unable to ${banning ? "ban" : "unban"} user.`);
      mergeUser(user._id, data.user || {});
      setActionHistory((current) => ({ ...current, [user._id]: undefined }));
      setMessageType("success");
      setMessage(data.message);
      window.alert(data.message);
    } catch (error) {
      setMessageType("error"); setMessage(error.message);
      window.alert(error.message || `Unable to ${banning ? "ban" : "unban"} user.`);
    } finally { setUpdatingId(null); }
  }

  async function changeSubscription(user, action) {
    if (updatingId) return;
    const granting = action === "grant";
    const durationInput = granting ? window.prompt("Subscription duration in days:", "30") : null;
    if (granting && durationInput === null) return;
    const durationDays = Number.parseInt(durationInput, 10);
    if (granting && (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 3650)) {
      setMessageType("error"); setMessage("Duration must be between 1 and 3650 days."); return;
    }
    const reason = window.prompt(`${granting ? "Grant" : "Removal"} reason (required):`);
    if (!reason?.trim()) return;
    const warning = granting ? `Grant ${durationDays} days of subscription access?` : "Remove subscription access immediately? This does not cancel billing at the payment gateway.";
    if (!window.confirm(warning)) return;
    setUpdatingId(user._id);
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/subscription`, {
        method: "PATCH", body: JSON.stringify({ action, durationDays, reason: reason.trim() }),
      }, "Unable to update subscription.");
      mergeUser(user._id, data.user || {});
      setActionHistory((current) => ({ ...current, [user._id]: undefined }));
      setMessageType("success"); setMessage(data.message);
    } catch (error) {
      setMessageType("error"); setMessage(error.message);
    } finally { setUpdatingId(null); }
  }

  function openDrawer(user) {
    setSelectedUser(user);
    setDrawerTab("Overview");
    if (!ipLocations[user._id]) loadIpLocation(user._id);
  }

  async function moveToTrash(user) {
    if (deletingId) return;
    const userName = user.fullName || user.email || user.mobileNumber || "Learner";
    const confirmed = window.confirm(`Move ${userName} to Trash? You can restore this user later.`);
    if (!confirmed) return;
    setDeletingId(user._id);
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}`, { method: "DELETE", body: JSON.stringify({ reason: "Moved to trash from User Management" }) }, "Unable to move user to trash.");
      mergeUser(user._id, data.user || { deletedAt: new Date().toISOString(), isActive: false });
      setSelectedUser(null);
      setMessageType("success");
      setMessage(`${userName} moved to Trash.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to move user to trash.");
    } finally {
      setDeletingId(null);
    }
  }

  async function restoreUser(user) {
    if (updatingId) return;
    const userName = user.fullName || user.email || user.mobileNumber || "Learner";
    if (!window.confirm(`Restore ${userName} from Trash?`)) return;
    setUpdatingId(user._id);
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/restore`, { method: "PATCH" }, "Unable to restore user.");
      mergeUser(user._id, data.user || { deletedAt: null });
      setMessageType("success"); setMessage(`${userName} restored.`);
    } catch (error) {
      setMessageType("error"); setMessage(error.message || "Unable to restore user.");
    } finally { setUpdatingId(null); }
  }

  async function deletePermanently(user) {
    if (deletingId) return;
    const userName = user.fullName || user.email || user.mobileNumber || "Learner";
    if (!window.confirm(`Permanently delete ${userName}? This cannot be undone and all related records will be removed.`)) return;
    setDeletingId(user._id);
    try {
      await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/permanent`, { method: "DELETE" }, "Unable to permanently delete user.");
      setUsers((rows) => rows.filter((item) => String(item._id) !== String(user._id)));
      setSelectedUser(null);
      setMessageType("success"); setMessage(`${userName} permanently deleted.`);
    } catch (error) {
      if (error.code === "BILLING_CANCELLATION_FAILED") {
        const forceDelete = window.confirm(
          `${error.message}\n\nDelete ${userName} anyway? This removes the Skillomate account, but any external payment mandate may remain active and must be cancelled separately.`
        );
        if (!forceDelete) {
          setMessageType("error"); setMessage("Permanent deletion cancelled. The user remains in Trash.");
          return;
        }
        try {
          await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/permanent`, {
            method: "DELETE",
            body: JSON.stringify({ force: true }),
          }, "Unable to permanently delete user.");
          setUsers((rows) => rows.filter((item) => String(item._id) !== String(user._id)));
          setSelectedUser(null);
          setMessageType("success");
          setMessage(`${userName} permanently deleted. Check the payment gateway separately for any active mandate.`);
        } catch (forceError) {
          setMessageType("error"); setMessage(forceError.message || "Unable to permanently delete user.");
        }
      } else {
        setMessageType("error"); setMessage(error.message || "Unable to permanently delete user.");
      }
    } finally { setDeletingId(null); }
  }

  function exportCsv() {
    if (!filteredUsers.length) {
      setMessageType("error");
      setMessage("No visible users to export.");
      return;
    }
    const headers = ["Name", "Email", "Mobile", "Lifecycle", "Subscription", "Verified", "Gender", "Age", "Courses", "Completed", "Average Progress", "Watch Minutes", "Watched Videos"];
    const csvRows = [
      headers.map(csvEscape).join(","),
      ...filteredUsers.map((user) => [
        user.fullName || "Learner",
        user.email || "",
        user.mobileNumber || "",
        lifecycleLabel(user),
        user.subscriptionStatus || "none",
        isVerified(user) ? "yes" : "no",
        formatGender(user.gender),
        Number(user.age || 0) || "",
        totalCourses(user),
        completedCourses(user),
        `${progressAverage(user)}%`,
        watchMinutes(user),
        Number(user.watchSummary?.watchedVideos || 0),
      ].map(csvEscape).join(",")),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `edunex-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell
      activePage="users"
      shellClass="users-shell"
      title="User Management"
      subtitle="CRM-style learner records with subscription status, verification health, engagement, and course progress."
      actions={<button className="toolbar-button" type="button" onClick={loadUsers} disabled={loading}>Refresh</button>}
    >
      <Message text={message} type={messageType} />
      <DeletionRequests />

      <form className="controls-panel" onSubmit={(event) => event.preventDefault()}>
        <div><label htmlFor="searchInput">Search</label><input id="searchInput" type="search" placeholder="Name, email, phone number, course" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div><label htmlFor="statusFilter">Status</label><select id="statusFilter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="subscribed">Subscribed</option><option value="1rs trial">1rs trial</option><option value="trial">Trial</option><option value="none">None</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select></div>
        <div><label htmlFor="accountFilter">Account access</label><select id="accountFilter" value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}><option value="all">All accounts</option><option value="active">Active accounts</option><option value="banned">Banned accounts</option></select></div>
        <div><label htmlFor="sortFilter">Sort</label><select id="sortFilter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="watch">Highest watch time</option><option value="progress">Highest progress</option><option value="courses">Most courses</option><option value="name">Name A-Z</option></select></div>
        <button className="toolbar-button" type="button" onClick={() => { setQuery(""); setStatus("all"); setAccountStatus("all"); setSort("newest"); setSegment("all"); }}>Clear</button>
      </form>

      <div className="crm-segments" aria-label="CRM segments">
        {segments.map(([key, label]) => <button key={key} className={`crm-segment${segment === key ? " is-active" : ""}`} type="button" onClick={() => setSegment(key)}>{label}</button>)}
      </div>

      <section className="summary-grid">
        {summary.map(([label, value]) => <div className="summary-card" key={label}><strong>{label}</strong><span>{value}</span></div>)}
      </section>

      <div className="crm-results-bar">
        <div><strong>Learner pipeline</strong><span>{formatNumber(filteredUsers.length)} shown from {formatNumber(users.length)} total users</span></div>
        <button className="toolbar-button" type="button" onClick={exportCsv} disabled={!filteredUsers.length}>Export CSV</button>
      </div>

      <section className="users-panel" aria-label="Users">
        <div className="users-head"><span>Learner</span><span>Status / subscription</span><span>Phone / email</span><span>Courses / watch time</span><span>Completion / dates</span><span>Actions</span></div>
        {loading ? <div className="loading-state">Loading users...</div> : null}
        {!loading && !filteredUsers.length ? <div className="empty-state">No users found.</div> : null}
        {!loading && visibleUsers.map((user) => {
          const average = Math.max(0, Math.min(100, progressAverage(user)));
          const statusValue = user.subscriptionStatus || "none";
          const isOpen = openIds.has(user._id);
          const progress = user.progressCourses || [];
          const summaryData = user.progressSummary || {};
          const watch = user.watchSummary || {};
          return (
            <article className={`user-card${isOpen ? " is-open" : ""}`} key={user._id}>
              <div className="user-row">
                <div className="crm-contact-cell"><div className="crm-avatar" aria-hidden="true">{initials(user)}</div><div><strong>{user.fullName || "Learner"}</strong><span>ID {user._id || "No ID"}</span></div></div>
                <div><strong>{user.deletedAt ? "In Trash" : user.isActive === false ? "Banned account" : lifecycleLabel(user)}</strong><span><span className={`badge ${user.deletedAt || user.isActive === false ? "bad" : statusBadgeClass(statusValue)}`}>{user.deletedAt ? "trashed" : user.isActive === false ? "banned" : statusValue}</span></span><span>{user.deletedAt ? `Deleted ${formatDate(user.deletedAt)}` : isVerified(user) ? "Verified account" : "Verification pending"}</span></div>
                <div><strong>{user.mobileNumber || "No mobile"}</strong><span>{user.email || "No email"}</span></div>
                <div className="crm-engagement-cell"><strong>{engagementLabel(user)}</strong><div className="mini-stats"><span className="pill">{formatNumber(summaryData.totalCourses)} courses</span><span className="pill">{formatNumber(summaryData.completedCourses)} done</span><span className="pill">{formatWatchDuration(watchMinutes(user))}</span></div></div>
                <div className="crm-engagement-cell"><strong>{formatNumber(average)}% completion</strong><div className="progress-meter" aria-hidden="true"><div className="progress-fill" style={{ width: `${average}%` }} /></div><span>Joined {formatDateTime(user.createdAt)} · Last {formatDate(user.lastActiveAt || watch.lastWatchedAt)}</span></div>
                <div className="row-actions"><button className="action-button" type="button" onClick={() => openDrawer(user)}>View</button><button className="action-button" type="button" aria-expanded={isOpen} onClick={() => toggleOpen(user._id)}>{isOpen ? "Close" : "Manage"}</button>{user.deletedAt ? <><button className="action-button primary" type="button" disabled={Boolean(updatingId) || Boolean(deletingId)} onClick={() => restoreUser(user)}>{updatingId === user._id ? "Restoring…" : "Restore"}</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => deletePermanently(user)}>{deletingId === user._id ? "Deleting…" : "Delete permanently"}</button></> : <><button className={`action-button ${user.isActive === false ? "success" : "danger"}`} type="button" disabled={Boolean(updatingId)} onClick={() => changeAccountAccess(user)}>{updatingId === user._id ? "Updating…" : user.isActive === false ? "Unban" : "Ban"}</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => moveToTrash(user)}>{deletingId === user._id ? "Moving…" : "Move to Trash"}</button></>}</div>
              </div>
              {isOpen ? (
                <div className="progress-panel">
                  <div className="crm-detail-grid">
                    <DetailStat label="Gender" value={formatGender(user.gender)} /><DetailStat label="Age" value={formatAge(user.age)} /><DetailStat label="Courses started" value={formatNumber(summaryData.totalCourses)} /><DetailStat label="Completed courses" value={formatNumber(summaryData.completedCourses)} /><DetailStat label="Average progress" value={`${formatNumber(summaryData.averageProgress)}%`} /><DetailStat label="Watch time" value={formatWatchDuration(watchMinutes(user))} /><DetailStat label="Watched videos" value={formatNumber(watch.watchedVideos)} /><DetailStat label="Last watched" value={formatDate(watch.lastWatchedAt)} /><DetailStat label="Last login" value={formatDateTime(user.lastLoginAt)} /><DetailStat label="Last IP address" value={user.networkSummary?.ipAddress || "Not recorded"} /><DetailStat label="Approx. location" value={ipLocations[user._id]?.location || "Open to locate"} /><DetailStat label="IP recorded" value={user.networkSummary?.recordedAt ? formatDateTime(user.networkSummary.recordedAt) : "Not recorded"} /><DetailStat label="Login platform" value={user.networkSummary?.platform || "Not recorded"} /><DetailStat label="Login count" value={formatNumber(user.loginCount)} /><DetailStat label="Subscription ends" value={formatDate(user.subscriptionExpiry)} /><DetailStat label="User ID" value={user._id || "No ID"} />
                  </div>
                  {user.banReason ? <div className="admin-alert bad"><strong>Ban reason</strong><span>{user.banReason}</span></div> : null}
                  <div className="user-management-actions">
                    <div><strong>Subscription access</strong><span>Manual access changes are recorded. Removing access does not cancel an external payment mandate.</span></div>
                    {user.deletedAt ? <><button className="action-button primary" type="button" disabled={Boolean(updatingId) || Boolean(deletingId)} onClick={() => restoreUser(user)}>Restore user</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => deletePermanently(user)}>{deletingId === user._id ? "Deleting…" : "Delete permanently"}</button></> : <><button className="action-button primary" type="button" disabled={Boolean(updatingId)} onClick={() => changeSubscription(user, "grant")}>Grant subscription</button><button className="action-button danger" type="button" disabled={Boolean(updatingId)} onClick={() => changeSubscription(user, "revoke")}>Remove access</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => moveToTrash(user)}>{deletingId === user._id ? "Moving…" : "Move to Trash"}</button></>}
                  </div>
                  <div className="crm-detail-section"><div className="crm-detail-head"><strong>Course progress</strong><span>{formatNumber(progress.length)} records</span></div><div className="progress-list">{progress.length ? progress.map((course) => <ProgressRow course={course} key={`${user._id}-${course.courseId}`} />) : <div className="empty-state">No course progress yet.</div>}</div></div>
                  <div className="crm-detail-section"><div className="crm-detail-head"><strong>Admin action history</strong><span>Latest 25 actions</span></div><div className="admin-action-list">{actionHistory[user._id] === undefined ? <span>Open again to refresh history.</span> : actionHistory[user._id]?.length ? actionHistory[user._id].map((item) => <div key={item._id}><strong>{String(item.action || "").replaceAll("_", " ")}</strong><span>{item.reason || "No reason"} · {formatDate(item.createdAt)}</span></div>) : <span>No admin actions recorded.</span>}</div></div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
      <nav className="crm-results-bar" aria-label="Learner pages">
        <button className="toolbar-button" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span aria-live="polite">Page {currentPage} of {pageCount} · 25 learners per page</span>
        <button className="toolbar-button" disabled={currentPage >= pageCount || loading} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>
      <LearnerDetailDrawer user={selectedUser} tab={drawerTab} setTab={setDrawerTab} onClose={() => setSelectedUser(null)} ipLocation={selectedUser ? ipLocations[selectedUser._id] : null} />

    </AdminShell>
  );
}
