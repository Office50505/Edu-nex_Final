import { useEffect } from "react";
import { page as helpPage } from "../generated-pages/help.html.js";
import { EnxIcon } from "../components/EnxIcon.jsx";
import { usePageStyle } from "../hooks/usePageStyle.js";

const cards = [
  {
    icon: "key",
    title: "Login Or Profile",
    copy: <>If your login, OTP, avatar, or profile details do not sync, log out and sign in again. Then open <a href="profile.html">Profile</a>.</>,
  },
  {
    icon: "video",
    title: "Course Videos",
    copy: <>Video access requires an active trial or subscription. Open <a href="courses.html">Courses</a>, then choose View Course.</>,
  },
  {
    icon: "receipt",
    title: "Payments",
    copy: "After payment, continue on web to return to courses. Subscription status can be checked from the Profile page.",
  },
  {
    icon: "heart",
    title: "Wishlist",
    copy: "Tap the heart on a course card to save it. Logged-in accounts sync wishlist data when the backend is available.",
  },
  {
    icon: "sparkles",
    title: "Nex AI",
    copy: "Use Nex AI inside the video player for summaries, study plans, project ideas, and lesson explanations.",
  },
  {
    icon: "mail",
    title: "Contact",
    copy: <>Email support at <a href="mailto:support@skillomate.ai">support@skillomate.ai</a> with your mobile number and issue details.</>,
  },
];

export function HelpPage() {
  usePageStyle("react-page-style-help", `${helpPage.styles}
    .help-card-icon { color: var(--cyan); margin-bottom: 14px; display: inline-flex; font-size: 1.05rem; }
  `);

  useEffect(() => {
    document.title = "Help Center - Skillomate AI";
    document.documentElement.lang = "en";
  }, []);

  return (
    <main className="help-page">
      <div className="help-kicker">Help Center</div>
      <h1>How can we help?</h1>
      <p className="help-intro">Use these help paths for account access, videos, payments, courses, and profile issues.</p>
      <section className="help-grid">
        {cards.map((card) => (
          <article className="help-card" key={card.title}>
            <span className="help-card-icon" aria-hidden="true"><EnxIcon name={card.icon} /></span>
            <h2>{card.title}</h2>
            <p>{card.copy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
