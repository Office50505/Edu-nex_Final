import { useEffect } from "react";
import { route } from "../lib/routes.js";

function RedirectPage({ destination, title, message }) {
  const href = route(destination);

  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main className="enx-page-loading" aria-live="polite" aria-busy="true">
      <section className="enx-page-loading-card">
        <h1>{title}</h1>
        <p>{message}</p>
        <a href={href}>Continue</a>
      </section>
    </main>
  );
}

export function SignupRedirectPage() {
  return (
    <RedirectPage
      destination="signup.html"
      title="Continue to signup"
      message="Taking you to the secure Skillomate account setup."
    />
  );
}

export function LessonRedirectPage() {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get("courseId");
  const video = params.get("video");
  const destination = courseId
    ? `videos.html?courseId=${encodeURIComponent(courseId)}${video !== null ? `&video=${encodeURIComponent(video)}` : ""}`
    : "courses.html";

  return (
    <RedirectPage
      destination={destination}
      title="Opening your course"
      message="Taking you to the Skillomate course player."
    />
  );
}

export function MarketingWebRedirectPage() {
  return (
    <RedirectPage
      destination="/static-pages/skillomate-ai-influencer-courseweb/index.html#paywall"
      title="Opening Skillomate offer"
      message="Taking you to the Skillomate marketing checkout."
    />
  );
}
