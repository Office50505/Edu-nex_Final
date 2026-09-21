import { DeletionRequests } from "./DeletionRequests";
import { csvEscape } from "./adminExport.js";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDate, formatDateTime, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";
import { useViewportLock } from "../../hooks/useViewportLock.js";

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

const emptyCreateLearner = {
  fullName: "",
  mobileNumber: "",
  email: "",
  password: "",
  courseId: "",
  courseAccessType: "permanent",
  courseAccessDays: "7",
  isMobileVerified: true,
  isEmailVerified: false,
};

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

function formatMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : "";
  return local ? `+91,${local.slice(0, 5)}-${local.slice(5)}` : (value || "No mobile");
}

function formatMoney(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
}

function purchaseTypeLabel(value) {
  return String(value || "purchase").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function presenceLabel(user) {
  return user.presence?.isOnline ? "Online" : "Offline";
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

function courseReferenceId(value) {
  return String(value?._id || value?.course?._id || value?.course || value || "");
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

function PurchasedCourseList({ user, courses }) {
  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const entitlementById = new Map((user.courseEntitlements || []).map((item) => [String(item.course?._id || item.course), item]));
  const rows = (user.purchasedCourses || []).map((value) => {
    const id = String(value?._id || value);
    const entitlement = entitlementById.get(id);
    const accessType = entitlement?.accessType || "permanent";
    const expired = Boolean(entitlement?.expiresAt && new Date(entitlement.expiresAt) <= new Date());
    return { id, course: courseById.get(id), accessType, expired, expiresAt: entitlement?.expiresAt || null };
  });
  if (!rows.length) return <div className="empty-state">No purchased courses assigned.</div>;
  return <div className="purchased-course-list">{rows.map((item) => <div className="purchased-course-card" key={item.id}>
    <div><strong>{item.course?.title || "Course unavailable"}</strong><span>{item.course?.category?.name || item.course?.category || "Published course"}</span></div>
    <div><span className={`badge ${item.expired ? "bad" : "good"}`}>{item.expired ? "expired" : item.accessType}</span><span>{item.accessType === "permanent" ? "No expiry" : `Ends ${formatDate(item.expiresAt)}`}</span></div>
  </div>)}</div>;
}

function PurchaseHistoryPanel({ state }) {
  if (!state) return null;
  const records = [
    ...(state.orders || []).map((order) => ({
      id: `order-${order._id}`,
      date: order.paidAt || order.createdAt,
      title: purchaseTypeLabel(order.orderType),
      detail: `${order.gateway || "payment"}${order.phonePePaymentInstrument ? ` · ${order.phonePePaymentInstrument}` : ""}`,
      status: order.status || "pending",
      amount: formatMoney(order.totalAmount),
    })),
    ...(state.courseChanges || []).map((item) => ({
      id: `course-${item._id}`,
      date: item.createdAt,
      title: item.nextState?.courseTitle || "Course access",
      detail: `${item.action === "course_granted" ? "Granted" : "Revoked"} by admin${item.nextState?.accessType ? ` · ${purchaseTypeLabel(item.nextState.accessType)}` : ""}`,
      status: item.action === "course_granted" ? "granted" : "revoked",
      amount: "Admin assigned",
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return <section className="purchase-history-panel" aria-label={`Purchase history for ${state.user?.fullName || "learner"}`}>
      <div className="crm-detail-head"><strong>Purchase history</strong><span>{records.length} records</span></div>
      {state.loading ? <div className="empty-state">Loading purchase history…</div> : null}
      {state.error ? <div className="admin-alert bad">{state.error}</div> : null}
      {!state.loading && !state.error && !records.length ? <div className="empty-state">No payment or course purchase history found.</div> : null}
      {!state.loading && !state.error && records.length ? <div className="purchase-history-list">{records.map((record) => <article key={record.id}>
        <div><strong>{record.title}</strong><span>{record.detail}</span></div>
        <div><span className={`badge ${["paid", "granted"].includes(record.status) ? "good" : record.status === "pending" ? "warn" : "bad"}`}>{record.status}</span><strong>{record.amount}</strong><span>{formatDateTime(record.date)}</span></div>
      </article>)}</div> : null}
    </section>;
}

function LearnerDetailDrawer({ user, courses, tab, setTab, onClose, ipLocation }) {
  if (!user) return null;
  const progress = user.progressCourses || [];
  const watch = user.watchSummary || {};
  const tabs = ["Overview", "Course progress", "Orders/payments", "Certificates", "Activity"];
  return (
    <aside className="learner-detail-drawer" aria-label="Learner detail">
      <div className="drawer-head">
        <div className="crm-contact-cell">
          <div className="crm-avatar" aria-hidden="true">{initials(user)}</div>
          <div><strong>{user.fullName || "Learner"}</strong><span>{user.email || "No email"}</span><span>{formatMobile(user.mobileNumber)}</span></div>
        </div>
        <button className="toolbar-button" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="drawer-tabs" role="tablist">
        {tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} key={item} type="button" onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "Overview" ? (
        <div className="crm-detail-grid">
          <DetailStat label="User ID" value={user._id || "No ID"} /><DetailStat label="Presence" value={user.presence?.isOnline ? "Online now" : `Offline · ${formatDateTime(user.presence?.lastSeenAt || user.lastActiveAt)}`} /><DetailStat label="Lifecycle" value={lifecycleLabel(user)} /><DetailStat label="Subscription" value={user.subscriptionStatus || "none"} /><DetailStat label="Verified" value={isVerified(user) ? "Yes" : "Pending"} /><DetailStat label="Joined" value={formatDateTime(user.createdAt)} /><DetailStat label="Last active" value={formatDate(user.presence?.lastSeenAt || user.lastActiveAt || watch.lastWatchedAt)} /><DetailStat label="Last IP address" value={user.networkSummary?.ipAddress || "Not recorded"} /><DetailStat label="Approx. location" value={ipLocation?.location || "Open to locate"} /><DetailStat label="IP recorded" value={user.networkSummary?.recordedAt ? formatDateTime(user.networkSummary.recordedAt) : "Not recorded"} /><DetailStat label="Watch time" value={formatWatchDuration(watchMinutes(user))} /><DetailStat label="Average completion" value={`${formatNumber(progressAverage(user))}%`} />
        </div>
      ) : null}
      {tab === "Course progress" ? <><PurchasedCourseList user={user} courses={courses} /><div className="drawer-section-label">Learning progress</div><div className="progress-list">{progress.length ? progress.map((course) => <ProgressRow course={course} key={`${user._id}-drawer-${course.courseId}`} />) : <div className="empty-state">Course purchased. Learning has not started yet.</div>}</div></> : null}
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
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [accountStatus, setAccountStatus] = useState("all");
  const [presenceStatus, setPresenceStatus] = useState("all");
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
  const [createLearner, setCreateLearner] = useState(emptyCreateLearner);
  const [creatingLearner, setCreatingLearner] = useState(false);
  const [createdLearnerId, setCreatedLearnerId] = useState("");
  const [courseDialog, setCourseDialog] = useState(null);
  useViewportLock(Boolean(courseDialog));
  const [purchaseHistories, setPurchaseHistories] = useState({});
  const [purchaseOpenIds, setPurchaseOpenIds] = useState(new Set());
  const deferredQuery = useDeferredValue(query);

  async function loadUsers({ silent = false } = {}) {
    if (!requireAdmin()) return;
    if (!silent) {
      setLoading(true);
      setMessage("");
    }
    try {
      const [rows, courseRows] = await Promise.all([
        adminJson("/api/admin/user-management", {}, "Unable to load users."),
        adminJson("/api/admin/courses?summary=1", {}, "Unable to load courses."),
      ]);
      setUsers(Array.isArray(rows) ? rows : []);
      setCourses(Array.isArray(courseRows) ? courseRows.filter((course) => course.status === "published") : []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load users.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "User Management | Skillomate";
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q");
    if (initialQuery) setQuery(initialQuery);
    loadUsers();
    const presenceRefresh = window.setInterval(() => loadUsers({ silent: true }), 30000);
    return () => window.clearInterval(presenceRefresh);
  }, []);

  const filteredUsers = useMemo(() => {
    const rows = users.filter((user) => {
      const matchesStatus = status === "all" || user.subscriptionStatus === status;
      const matchesAccount = accountStatus === "all" || (accountStatus === "active" ? user.isActive : !user.isActive);
      const matchesPresence = presenceStatus === "all" || (presenceStatus === "online" ? user.presence?.isOnline : !user.presence?.isOnline);
      return matchesStatus && matchesAccount && matchesPresence && matchesSearch(user, deferredQuery) && matchesSegment(user, segment);
    });

    return rows.sort((a, b) => {
      if (sort === "watch") return watchMinutes(b) - watchMinutes(a);
      if (sort === "progress") return progressAverage(b) - progressAverage(a);
      if (sort === "courses") return totalCourses(b) - totalCourses(a);
      if (sort === "name") return String(a.fullName || a.email || "").localeCompare(String(b.fullName || b.email || ""));
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [users, deferredQuery, status, accountStatus, presenceStatus, sort, segment]);

  useEffect(() => { setPage(1); }, [deferredQuery, status, accountStatus, presenceStatus, sort, segment]);

  function updateCreateLearner(field, value) {
    setCreateLearner((current) => ({ ...current, [field]: value }));
  }

  async function submitCreateLearner(event) {
    event.preventDefault();
    setCreatingLearner(true);
    setCreatedLearnerId("");
    setMessage("");
    try {
      const data = await adminJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(createLearner),
      }, "Unable to create learner ID.");
      setCreatedLearnerId(String(data.user?._id || ""));
      setMessageType("success");
      setMessage(data.message || "Learner ID created successfully.");
      setCreateLearner(emptyCreateLearner);
      await loadUsers();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to create learner ID.");
    } finally {
      setCreatingLearner(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * 25, currentPage * 25);

  const summary = useMemo(() => {
    const totalProgressCourses = filteredUsers.reduce((sum, user) => sum + totalCourses(user), 0);
    const totalWatchMinutes = filteredUsers.reduce((sum, user) => sum + watchMinutes(user), 0);
    const activeUsers = filteredUsers.filter((user) => user.isActive).length;
    const onlineUsers = filteredUsers.filter((user) => user.presence?.isOnline).length;
    const subscribedUsers = filteredUsers.filter((user) => ["active", "subscribed"].includes(user.subscriptionStatus)).length;
    const complete = filteredUsers.reduce((sum, user) => sum + completedCourses(user), 0);
    const usersWithAge = filteredUsers.filter((user) => user.age != null && Number(user.age) > 0 && Number.isFinite(Number(user.age)));
    const averageAge = usersWithAge.length ? Math.round(usersWithAge.reduce((sum, user) => sum + Number(user.age || 0), 0) / usersWithAge.length) : null;
    return [
      ["Users", formatNumber(filteredUsers.length)],
      ["Enabled Accounts", formatNumber(activeUsers)],
      ["Online Now", formatNumber(onlineUsers)],
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
    setSelectedUser((user) => user && String(user._id) === String(userId) ? { ...user, ...patch } : user);
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

  function openCourseDialog(user, action) {
    if (updatingId) return;
    if (!courses.length) {
      const text = "No published courses are available to assign. Publish a course first, then try again.";
      setMessageType("error");
      setMessage(text);
      window.alert(text);
      return;
    }
    const entitlements = new Map((user.courseEntitlements || []).map((item) => [courseReferenceId(item), item]));
    const owned = new Set((user.purchasedCourses || []).map(courseReferenceId).filter((id) => {
      const entitlement = entitlements.get(id);
      if (!entitlement) return true;
      return entitlement.accessType === "permanent" || (entitlement.expiresAt && new Date(entitlement.expiresAt) > new Date());
    }));
    const choices = courses.filter((course) => action === "grant" ? !owned.has(String(course._id)) : owned.has(String(course._id)));
    if (!choices.length) {
      const text = action === "grant"
        ? "This learner already owns every published course. The existing assignment is still active."
        : "This learner has no purchased courses to remove.";
      setMessageType("error");
      setMessage(text);
      window.alert(text);
      return;
    }
    setCourseDialog({ user, action, choices, courseId: String(choices[0]._id), accessType: "permanent", accessDays: "7", reason: action === "grant" ? "Course purchased/assigned by admin" : "Course access removed by admin" });
  }

  async function submitCourseAccess(event) {
    event.preventDefault();
    if (!courseDialog || updatingId) return;
    const { user, action, courseId, accessType, accessDays, reason } = courseDialog;
    const course = courseDialog.choices.find((item) => String(item._id) === String(courseId));
    if (!course || !reason.trim()) return;
    setUpdatingId(user._id);
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/courses`, {
        method: "PATCH", body: JSON.stringify({ action, courseId: course._id, accessType, accessDays: Number(accessDays), reason: reason.trim() }),
      }, "Unable to update course ownership.");
      mergeUser(user._id, data.user || {});
      setActionHistory((current) => ({ ...current, [user._id]: undefined }));
      setPurchaseOpenIds((current) => {
        const next = new Set(current);
        next.delete(String(user._id));
        return next;
      });
      setPurchaseHistories((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, String(user._id))) return current;
        const next = { ...current };
        delete next[String(user._id)];
        return next;
      });
      const successMessage = data.message || `${course.title} course access updated.`;
      setMessageType("success"); setMessage(successMessage);
      setCourseDialog(null);
      window.alert(successMessage);
    } catch (error) {
      const errorMessage = error.message || "Unable to update course ownership.";
      setMessageType("error"); setMessage(errorMessage);
      window.alert(errorMessage);
    } finally { setUpdatingId(null); }
  }

  function openDrawer(user) {
    setSelectedUser(user);
    setDrawerTab("Overview");
    if (!ipLocations[user._id]) loadIpLocation(user._id);
  }

  async function togglePurchaseHistory(user) {
    const userId = String(user._id);
    const opening = !purchaseOpenIds.has(userId);
    setPurchaseOpenIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
    if (!opening || purchaseHistories[userId]) return;
    setPurchaseHistories((current) => ({ ...current, [userId]: { user, loading: true, error: "", orders: [], courseChanges: [] } }));
    try {
      const data = await adminJson(`/api/admin/users/${encodeURIComponent(user._id)}/purchase-history`, {}, "Unable to load purchase history.");
      setPurchaseHistories((current) => ({ ...current, [userId]: { user: data.user || user, loading: false, error: "", orders: data.orders || [], courseChanges: data.courseChanges || [] } }));
    } catch (error) {
      setPurchaseHistories((current) => ({ ...current, [userId]: { user, loading: false, error: error.message || "Unable to load purchase history.", orders: [], courseChanges: [] } }));
    }
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
      <details className="create-learner-panel">
        <summary><span>Create learner ID</span><small>Add a learner manually and set initial access.</small></summary>
        <form className="create-learner-form" onSubmit={submitCreateLearner}>
          <label><span>Full name</span><input value={createLearner.fullName} onChange={(event) => updateCreateLearner("fullName", event.target.value)} minLength="2" maxLength="120" required autoComplete="off" /></label>
          <label><span>Mobile number</span><input type="tel" value={createLearner.mobileNumber} onChange={(event) => updateCreateLearner("mobileNumber", event.target.value)} placeholder="9876543210" minLength="10" maxLength="18" required autoComplete="off" /></label>
          <label><span>Email (optional)</span><input type="email" value={createLearner.email} onChange={(event) => updateCreateLearner("email", event.target.value)} maxLength="254" autoComplete="off" /></label>
          <label><span>Temporary password</span><input type="password" value={createLearner.password} onChange={(event) => updateCreateLearner("password", event.target.value)} minLength="8" maxLength="72" required autoComplete="new-password" /></label>
          <label><span>Purchased course (optional)</span><select value={createLearner.courseId} onChange={(event) => updateCreateLearner("courseId", event.target.value)}><option value="">No course yet</option>{courses.map((course) => <option value={course._id} key={course._id}>{course.title}</option>)}</select></label>
          {createLearner.courseId ? <label><span>Course access</span><select value={createLearner.courseAccessType} onChange={(event) => updateCreateLearner("courseAccessType", event.target.value)}><option value="trial">Trial</option><option value="yearly">Yearly (365 days)</option><option value="permanent">Permanent</option></select></label> : null}
          {createLearner.courseId && createLearner.courseAccessType === "trial" ? <label><span>Trial days</span><input type="number" min="1" max="365" value={createLearner.courseAccessDays} onChange={(event) => updateCreateLearner("courseAccessDays", event.target.value)} required /></label> : null}
          <label className="create-learner-check"><input type="checkbox" checked={createLearner.isMobileVerified} onChange={(event) => updateCreateLearner("isMobileVerified", event.target.checked)} /><span>Mobile verified</span></label>
          <label className="create-learner-check"><input type="checkbox" checked={createLearner.isEmailVerified} disabled={!createLearner.email} onChange={(event) => updateCreateLearner("isEmailVerified", event.target.checked)} /><span>Email verified</span></label>
          <div className="create-learner-actions"><button className="toolbar-button primary" type="submit" disabled={creatingLearner}>{creatingLearner ? "Creating…" : "Create learner ID"}</button>{createdLearnerId ? <output>Created ID: <strong>{createdLearnerId}</strong></output> : null}</div>
        </form>
      </details>
      <DeletionRequests />

      <form className="controls-panel" onSubmit={(event) => event.preventDefault()}>
        <div><label htmlFor="searchInput">Search</label><input id="searchInput" type="search" placeholder="Name, email, phone number, course" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div><label htmlFor="statusFilter">Subscription status</label><select id="statusFilter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All subscriptions</option><option value="active">Active subscription</option><option value="subscribed">Subscribed</option><option value="1rs trial">₹1 trial</option><option value="trial">Trial</option><option value="none">No subscription</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select></div>
        <div><label htmlFor="accountFilter">Account access</label><select id="accountFilter" value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}><option value="all">All accounts</option><option value="active">Active accounts</option><option value="banned">Banned accounts</option></select></div>
        <div><label htmlFor="presenceFilter">User online status</label><select id="presenceFilter" value={presenceStatus} onChange={(event) => setPresenceStatus(event.target.value)}><option value="all">All users</option><option value="online">Online users</option><option value="offline">Offline users</option></select></div>
        <div><label htmlFor="sortFilter">Sort</label><select id="sortFilter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="watch">Highest watch time</option><option value="progress">Highest progress</option><option value="courses">Most courses</option><option value="name">Name A-Z</option></select></div>
        <button className="toolbar-button" type="button" onClick={() => { setQuery(""); setStatus("all"); setAccountStatus("all"); setPresenceStatus("all"); setSort("newest"); setSegment("all"); }}>Clear</button>
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
          const isPurchaseOpen = purchaseOpenIds.has(String(user._id));
          const progress = user.progressCourses || [];
          const summaryData = user.progressSummary || {};
          const watch = user.watchSummary || {};
          return (
            <article className={`user-card${isOpen ? " is-open" : ""}`} key={user._id}>
              <div className="user-row">
                <div className="crm-contact-cell"><div className="crm-avatar" aria-hidden="true">{initials(user)}</div><div><strong>{user.fullName || "Learner"}</strong><span className={`presence-status ${user.presence?.isOnline ? "is-online" : "is-offline"}`}><i aria-hidden="true" />{presenceLabel(user)}</span><span>ID {user._id || "No ID"}</span></div></div>
                <div><strong>{user.deletedAt ? "In Trash" : user.isActive === false ? "Banned account" : lifecycleLabel(user)}</strong><span><span className={`badge ${user.deletedAt || user.isActive === false ? "bad" : statusBadgeClass(statusValue)}`}>{user.deletedAt ? "trashed" : user.isActive === false ? "banned" : statusValue}</span></span><span>{user.deletedAt ? `Deleted ${formatDate(user.deletedAt)}` : isVerified(user) ? "Verified account" : "Verification pending"}</span></div>
                <div><strong>{formatMobile(user.mobileNumber)}</strong><span>{user.email || "No email"}</span></div>
                <div className="crm-engagement-cell"><strong>{engagementLabel(user)}</strong><div className="mini-stats"><span className="pill">{formatNumber(summaryData.totalCourses)} courses</span><span className="pill">{formatNumber(summaryData.completedCourses)} done</span><span className="pill">{formatWatchDuration(watchMinutes(user))}</span></div></div>
                <div className="crm-engagement-cell"><strong>{formatNumber(average)}% completion</strong><div className="progress-meter" aria-hidden="true"><div className="progress-fill" style={{ width: `${average}%` }} /></div><span>Joined {formatDateTime(user.createdAt)} · Last {formatDate(user.lastActiveAt || watch.lastWatchedAt)}</span></div>
                <div className="row-actions"><button className="action-button" type="button" onClick={() => openDrawer(user)}>View</button><button className="action-button" type="button" aria-expanded={isOpen} onClick={() => toggleOpen(user._id)}>{isOpen ? "Close" : "Manage"}</button><button className="action-button" type="button" aria-expanded={isPurchaseOpen} onClick={() => togglePurchaseHistory(user)}>{isPurchaseOpen ? "Close history" : "Purchase history"}</button>{user.deletedAt ? <><button className="action-button primary" type="button" disabled={Boolean(updatingId) || Boolean(deletingId)} onClick={() => restoreUser(user)}>{updatingId === user._id ? "Restoring…" : "Restore"}</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => deletePermanently(user)}>{deletingId === user._id ? "Deleting…" : "Delete permanently"}</button></> : <><button className={`action-button ${user.isActive === false ? "success" : "danger"}`} type="button" disabled={Boolean(updatingId)} onClick={() => changeAccountAccess(user)}>{updatingId === user._id ? "Updating…" : user.isActive === false ? "Unban" : "Ban"}</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => moveToTrash(user)}>{deletingId === user._id ? "Moving…" : "Move to Trash"}</button></>}</div>
              </div>
              {isOpen ? (
                <div className="progress-panel">
                  <div className="crm-detail-grid">
                    <DetailStat label="Gender" value={formatGender(user.gender)} /><DetailStat label="Age" value={formatAge(user.age)} /><DetailStat label="Courses started" value={formatNumber(summaryData.totalCourses)} /><DetailStat label="Completed courses" value={formatNumber(summaryData.completedCourses)} /><DetailStat label="Average progress" value={`${formatNumber(summaryData.averageProgress)}%`} /><DetailStat label="Watch time" value={formatWatchDuration(watchMinutes(user))} /><DetailStat label="Watched videos" value={formatNumber(watch.watchedVideos)} /><DetailStat label="Last watched" value={formatDate(watch.lastWatchedAt)} /><DetailStat label="Last login" value={formatDateTime(user.lastLoginAt)} /><DetailStat label="Last IP address" value={user.networkSummary?.ipAddress || "Not recorded"} /><DetailStat label="Approx. location" value={ipLocations[user._id]?.location || "Open to locate"} /><DetailStat label="IP recorded" value={user.networkSummary?.recordedAt ? formatDateTime(user.networkSummary.recordedAt) : "Not recorded"} /><DetailStat label="Login platform" value={user.networkSummary?.platform || "Not recorded"} /><DetailStat label="Login count" value={formatNumber(user.loginCount)} /><DetailStat label="Subscription ends" value={formatDate(user.subscriptionExpiry)} /><DetailStat label="User ID" value={user._id || "No ID"} />
                  </div>
                  {user.banReason ? <div className="admin-alert bad"><strong>Ban reason</strong><span>{user.banReason}</span></div> : null}
                  <div className="user-management-actions">
                    <div><strong>Purchased courses</strong><span>{formatNumber(user.purchasedCourses?.length || 0)} courses owned. Course changes are recorded in the audit history.</span></div>
                    {user.deletedAt ? <><button className="action-button primary" type="button" disabled={Boolean(updatingId) || Boolean(deletingId)} onClick={() => restoreUser(user)}>Restore user</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => deletePermanently(user)}>{deletingId === user._id ? "Deleting…" : "Delete permanently"}</button></> : <><button className="action-button primary" type="button" disabled={Boolean(updatingId)} onClick={() => openCourseDialog(user, "grant")}>Add purchased course</button><button className="action-button danger" type="button" disabled={Boolean(updatingId)} onClick={() => openCourseDialog(user, "revoke")}>Remove course</button><button className="action-button danger" type="button" disabled={Boolean(deletingId) || Boolean(updatingId)} onClick={() => moveToTrash(user)}>{deletingId === user._id ? "Moving…" : "Move to Trash"}</button></>}
                  </div>
                  <div className="crm-detail-section"><div className="crm-detail-head"><strong>Purchased course details</strong><span>{formatNumber(user.purchasedCourses?.length || 0)} assigned</span></div><PurchasedCourseList user={user} courses={courses} /></div>
                  <div className="crm-detail-section"><div className="crm-detail-head"><strong>Course progress</strong><span>{formatNumber(progress.length)} records</span></div><div className="progress-list">{progress.length ? progress.map((course) => <ProgressRow course={course} key={`${user._id}-${course.courseId}`} />) : <div className="empty-state">No course progress yet.</div>}</div></div>
                  <div className="crm-detail-section"><div className="crm-detail-head"><strong>Admin action history</strong><span>Latest 25 actions</span></div><div className="admin-action-list">{actionHistory[user._id] === undefined ? <span>Open again to refresh history.</span> : actionHistory[user._id]?.length ? actionHistory[user._id].map((item) => <div key={item._id}><strong>{String(item.action || "").replaceAll("_", " ")}</strong><span>{item.reason || "No reason"} · {formatDate(item.createdAt)}</span></div>) : <span>No admin actions recorded.</span>}</div></div>
                </div>
              ) : null}
              {isPurchaseOpen ? <PurchaseHistoryPanel state={purchaseHistories[String(user._id)] || { user, loading: true, orders: [], courseChanges: [] }} /> : null}
            </article>
          );
        })}
      </section>
      <nav className="crm-results-bar" aria-label="Learner pages">
        <button className="toolbar-button" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span aria-live="polite">Page {currentPage} of {pageCount} · 25 learners per page</span>
        <button className="toolbar-button" disabled={currentPage >= pageCount || loading} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>
      <LearnerDetailDrawer user={selectedUser} courses={courses} tab={drawerTab} setTab={setDrawerTab} onClose={() => setSelectedUser(null)} ipLocation={selectedUser ? ipLocations[selectedUser._id] : null} />

      {courseDialog ? <div className="course-access-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !updatingId) setCourseDialog(null); }}>
        <form className="course-access-dialog" role="dialog" aria-modal="true" aria-labelledby="course-access-title" onSubmit={submitCourseAccess}>
          <div className="course-access-dialog-head"><div><span>Course ownership</span><h2 id="course-access-title">{courseDialog.action === "grant" ? "Add purchased course" : "Remove purchased course"}</h2></div><button type="button" aria-label="Close" disabled={Boolean(updatingId)} onClick={() => setCourseDialog(null)}>×</button></div>
          <p>Choose a course for <strong>{courseDialog.user.fullName || formatMobile(courseDialog.user.mobileNumber) || "this learner"}</strong>.</p>
          <label><span>Course</span><select autoFocus value={courseDialog.courseId} onChange={(event) => setCourseDialog((current) => ({ ...current, courseId: event.target.value }))}>{courseDialog.choices.map((course) => <option value={course._id} key={course._id}>{course.title}</option>)}</select></label>
          {courseDialog.action === "grant" ? <label><span>Access duration</span><select value={courseDialog.accessType} onChange={(event) => setCourseDialog((current) => ({ ...current, accessType: event.target.value }))}><option value="trial">Trial</option><option value="yearly">Yearly (365 days)</option><option value="permanent">Permanent</option></select></label> : null}
          {courseDialog.action === "grant" && courseDialog.accessType === "trial" ? <label><span>Trial days</span><input type="number" min="1" max="365" required value={courseDialog.accessDays} onChange={(event) => setCourseDialog((current) => ({ ...current, accessDays: event.target.value }))} /></label> : null}
          <label><span>Audit reason</span><textarea rows="3" maxLength="500" required value={courseDialog.reason} onChange={(event) => setCourseDialog((current) => ({ ...current, reason: event.target.value }))} /></label>
          <div className="course-access-dialog-actions"><button className="toolbar-button" type="button" disabled={Boolean(updatingId)} onClick={() => setCourseDialog(null)}>Cancel</button><button className={`action-button ${courseDialog.action === "grant" ? "primary" : "danger"}`} type="submit" disabled={Boolean(updatingId) || !courseDialog.reason.trim()}>{updatingId ? "Saving…" : courseDialog.action === "grant" ? "Add course" : "Remove course"}</button></div>
        </form>
      </div> : null}

    </AdminShell>
  );
}
