import { Fragment, useEffect } from "react";
import { page as privacyPage } from "../generated-pages/privacy.html.js";
import { page as termsPage } from "../generated-pages/terms.html.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

const legalPages = {
  privacy: {
    title: privacyPage.title,
    styleId: "react-page-style-privacy",
    styles: privacyPage.styles,
    kicker: "Skillomate Privacy",
    heading: "Privacy Policy",
    intro: "This page summarizes the data Skillomate uses to run accounts, courses, payments, progress, and support.",
    sections: [
      ["Information We Use", "Skillomate may use your name, mobile number, email, avatar, age range, gender selection, course progress, wishlist, payment status, and support messages to operate your learning account."],
      ["Learning And Payment Data", "We use course progress and subscription status to unlock lessons, show dashboards, resume videos, and display subscription history. Payment processing may be handled by external payment providers."],
      ["AI Interactions", "Questions sent to Nex AI may be used to provide study guidance and improve the learning experience. Do not enter sensitive personal information into AI chat."],
      ["Storage", "The browser stores login/session data so you remain signed in. You can log out from the navbar or profile page to clear local access tokens."],
    ],
    bullets: [
      "You can update supported profile fields from the profile edit page.",
      "You can remove saved wishlist courses from the wishlist page.",
      "You can contact support for account or access questions.",
    ],
    closing: <>Need help? Visit <a href="help.html">Help &amp; Support</a>.</>,
  },
  terms: {
    title: termsPage.title,
    styleId: "react-page-style-terms",
    styles: termsPage.styles,
    kicker: "Skillomate Legal",
    heading: "Terms & Conditions",
    intro: "These terms explain how learners use Skillomate courses, subscriptions, videos, notes, AI tools, and account features.",
    sections: [
      ["Account Access", "You are responsible for the mobile number, email, password, and profile information used on your Skillomate account. Keep your login private and tell support if you notice unauthorized access."],
      ["Trials And Subscriptions", "Course access may require a valid trial or subscription. Trial pricing, renewal windows, and access rules are shown on the payment page before checkout."],
      ["Course Content", "Videos, notes, course material, and platform designs are provided for personal learning. Do not redistribute, resell, record, scrape, or upload Skillomate content elsewhere without written permission."],
      ["AI Assistance", "Nex AI is a learning assistant. It can help explain concepts and plan study, but it may be wrong. Verify important academic, career, financial, or technical decisions independently."],
    ],
    acceptableUseHeading: "Acceptable Use",
    bullets: [
      "Do not attempt to bypass payments, account access, or video protection.",
      "Do not abuse, attack, overload, or reverse engineer the platform.",
      "Do not upload harmful, illegal, or misleading content through forms or support channels.",
    ],
    support: <>For account, access, or payment issues, visit the <a href="help.html">Help page</a>.</>,
  },
};

export function LegalPage({ type }) {
  const content = legalPages[type];
  usePageStyle(content.styleId, content.styles);

  useEffect(() => {
    document.title = content.title;
    document.documentElement.lang = "en";
  }, [content.title]);

  return (
    <main className="legal-page">
      <div className="legal-kicker">{content.kicker}</div>
      <h1>{content.heading}</h1>
      <p className="legal-intro">{content.intro}</p>
      <section className="legal-card">
        {content.sections.map(([heading, copy]) => (
          <Fragment key={heading}>
            <h2>{heading}</h2>
            <p>{copy}</p>
          </Fragment>
        ))}
        {type === "terms" ? <h2>{content.acceptableUseHeading}</h2> : <h2>Your Choices</h2>}
        <ul>
          {content.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>
        {type === "terms" ? (
          <>
            <h2>Support</h2>
            <p>{content.support}</p>
          </>
        ) : (
          <p>{content.closing}</p>
        )}
      </section>
    </main>
  );
}
