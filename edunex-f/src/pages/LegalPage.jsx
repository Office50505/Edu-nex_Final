import { useEffect } from "react";
import { EnxIcon } from "../components/EnxIcon.jsx";
import { route } from "../lib/routes.js";

const privacyMeta = {
  title: "Privacy Policy - Skillomate AI",
};

const termsMeta = {
  title: "Terms & Conditions - Skillomate AI",
};

const termsTocSections = [
  { id: "account-access", title: "Account Access", icon: "user" },
  { id: "course-access", title: "Course Access", icon: "play" },
  { id: "trials-subscriptions", title: "Trials And Subscriptions", icon: "receipt" },
  { id: "payments-billing", title: "Payments And Billing", icon: "key" },
  { id: "downloads-offline", title: "Downloads And Offline Use", icon: "arrowUp" },
  { id: "certificates", title: "Certificates", icon: "award" },
  { id: "nex-ai", title: "Nex AI Assistance", icon: "sparkles" },
  { id: "acceptable-use", title: "Acceptable Use", icon: "checkCircle" },
  { id: "course-content", title: "Course Content And IP", icon: "bookOpen" },
  { id: "third-party-services", title: "Third-Party Services", icon: "dashboard" },
  { id: "account-deletion", title: "Account Deletion", icon: "logout" },
  { id: "termination-access", title: "Termination And Access", icon: "target" },
  { id: "availability", title: "Availability And Changes", icon: "info" },
  { id: "support", title: "Support", icon: "mail" },
];

const accountTerms = [
  "Create and use your account with accurate account details requested by Skillomate.",
  "Keep your password, OTP, device access, and session private.",
  "Tell Skillomate support if you believe your account has been used without permission.",
  "Do not share account access in a way that bypasses payment, access, or content protections.",
];

const courseAccessCards = [
  {
    icon: "play",
    title: "Course Access",
    copy: "Public course catalogues and previews may be available, while protected lessons require sign-in and a qualifying trial or subscription.",
  },
  {
    icon: "dashboard",
    title: "Progress And Wishlist",
    copy: "Wishlist items, learning progress, course progress, notes, and completion records are connected to the learner account.",
  },
  {
    icon: "bookOpen",
    title: "Course Updates",
    copy: "Course listings, content, videos, notes, external material, and metadata may be edited, updated, or removed through Skillomate administration tools.",
  },
];

const subscriptionCards = [
  {
    icon: "receipt",
    title: "Trial Checkout",
    copy: "The current web checkout supports a small paid trial with recurring-mandate authorization, and access depends on a qualifying captured payment.",
  },
  {
    icon: "target",
    title: "Subscription Access",
    copy: "Paid access normally depends on an unexpired trial or subscription entitlement and, for monthly access, the provider invoice period.",
  },
  {
    icon: "info",
    title: "Repeat Trials",
    copy: "Trial eligibility checks use account billing history, so repeat trial requests may be rejected for accounts with previous trial activity.",
  },
];

const paymentCards = [
  {
    icon: "receipt",
    title: "Payment Providers",
    copy: "Razorpay is integrated for checkout, subscription creation, signature verification, webhook reconciliation, and cancellation handling.",
  },
  {
    icon: "phone",
    title: "Mobile Payments",
    copy: "Android and iOS subscription controls use the web payment flow rather than native app-store checkout.",
  },
  {
    icon: "key",
    title: "Payment Entry",
    copy: "Payment-instrument entry is handled through the provider interface. Skillomate records payment identifiers and subscription state for access and support.",
  },
];

const downloadItems = [
  "Authorized mobile offline video downloads are for personal learning inside the Skillomate experience.",
  "Download requests require authentication and qualifying access when requested from the server.",
  "Users can remove downloaded files from the device where the app supports removal.",
  "Logging out does not by itself prove that downloaded files are deleted from the device.",
  "Authorized offline use does not permit redistributing, reselling, recording, scraping, or uploading Skillomate content elsewhere.",
];

const certificateItems = [
  "Skillomate course-completion certificates are generated from stored completion progress.",
  "Relevant progress logic treats a video as completed after sufficient watched progress, and a certificate is generated when course completion reaches 100%.",
  "Certificate records may include an identifier, learner details, course title, and issue date.",
  "Mobile certificate PDF export and sharing are supported.",
  "Certificates are Skillomate course-completion records, not government, university, professional-body, or employer-recognition credentials unless Skillomate separately states that for a specific course.",
];

const aiTerms = [
  "Nex AI can provide course explanations, examples, troubleshooting, practice questions, and platform guidance.",
  "AI responses may be inaccurate or incomplete, and learners should verify important academic, career, financial, or technical decisions independently.",
  "Nex AI may depend on configured AI providers, course context, conversation context, and fallback behavior.",
  "Skillomate does not guarantee learning outcomes, employment, income, financial results, or error-free AI output.",
];

const acceptableUseItems = [
  "Do not bypass or attempt to bypass payments, account access, video protection, or subscription controls.",
  "Do not attack, abuse, overload, disrupt, or reverse engineer the platform.",
  "Do not redistribute, resell, record, scrape, upload, or republish Skillomate content elsewhere without written permission.",
  "Do not submit harmful, illegal, abusive, or misleading content through forms, AI tools, or support channels.",
  "Do not use downloads, certificates, notes, or AI responses in a way that misrepresents your access, progress, identity, or authorization.",
];

const contentTerms = [
  "Skillomate videos, notes, course materials, platform designs, certificates, and related learning assets are provided for personal learning.",
  "Screen-capture prevention and access checks may be used on protected learning surfaces.",
  "Bunny and YouTube playback or embed surfaces may be used for course media.",
  "Authorized offline downloads are allowed only through Skillomate-supported app features.",
];

const providerCards = [
  { icon: "dashboard", title: "Storage And Hosting", copy: "MongoDB application storage and Netlify-configured web hosting support the Skillomate experience." },
  { icon: "phone", title: "Verification", copy: "MSG91 is integrated for OTP delivery and verification in account flows." },
  { icon: "receipt", title: "Payments", copy: "Razorpay is integrated for active payment flows; PhonePe remains configurable or reachable in retained payment code." },
  { icon: "sparkles", title: "AI Services", copy: "Configured AI routing supports Nex AI, with provider availability affecting AI assistance." },
  { icon: "play", title: "Media", copy: "Bunny video/CDN, YouTube, and Google Drive image links may support learning media and assets." },
  { icon: "phone", title: "Mobile Platform", copy: "Expo/mobile platform services and operating-system print or share features may support app behavior." },
];

const deletionTerms = [
  "Profile exposes Delete Account on web and mobile.",
  "Self-service deletion requires password verification and an exact typed DELETE confirmation.",
  "Deletion can be blocked by active or unresolved payment mandates.",
  "Deletion removes the user account and many linked Skillomate records, including progress, certificates, saved tutor threads, local billing records, support requests, and related account-linked data.",
  "External payment, AI, SMS, media, hosting, or platform provider records are not automatically deleted by the Skillomate account-deletion action.",
  "Current-device storage is cleared where possible during mobile deletion, including downloaded files on that device.",
];

const terminationTerms = [
  "Inactive accounts are rejected by authentication checks.",
  "Logout, logout-all, password reset, session expiry, account deletion, or invalid session state can end authenticated access.",
  "Protected lesson access can stop when the account lacks a qualifying trial or subscription entitlement.",
  "Administrative account deletion can remove user access.",
  "Local downloaded copies are a separate limitation and are not reliably revoked remotely by every access-state change.",
];

const availabilityTerms = [
  "Skillomate depends on third-party services for hosting, storage, verification, payments, AI assistance, media, and mobile platform features.",
  "Course content and metadata can be edited, added, or removed through administration tools.",
  "Skillomate does not currently publish an uninterrupted-availability promise or service-level guarantee in these Terms.",
];

const dataCategories = [
  {
    icon: "user",
    title: "Account Information",
    copy: "Full name, mobile number, optional email, age, gender, avatar selection, account status, and login activity.",
  },
  {
    icon: "key",
    title: "Authentication Data",
    copy: "Password credentials, session information, login activity, and device details used to help protect account access.",
  },
  {
    icon: "bookOpen",
    title: "Learning Data",
    copy: "Course activity, video progress, completion status, wishlist activity, certificates, and learning/download activity.",
  },
  {
    icon: "sparkles",
    title: "Nex AI Data",
    copy: "Questions, conversation context, page context, and course-related information used to provide AI learning assistance.",
  },
  {
    icon: "receipt",
    title: "Payment Records",
    copy: "Subscription, order, payment status, billing dates, refund status, and limited payment method details handled through payment providers.",
  },
  {
    icon: "dashboard",
    title: "Device And Technical Data",
    copy: "Basic technical information such as device type, app or browser context, timestamps, preferences, and session-related information.",
  },
  {
    icon: "award",
    title: "Files And Exports",
    copy: "Avatar choices, offline learning files, certificate exports, and course media connected to learning features.",
  },
  {
    icon: "mail",
    title: "Support And Communications",
    copy: "Support messages, names or contact details supplied by the learner, and verification messages used for account access.",
  },
];

const useItems = [
  "Create, verify, authenticate, and secure learner accounts.",
  "Provide course access, video playback, dashboards, progress tracking, wishlists, certificates, and recommendations.",
  "Process trials, subscriptions, payments, refunds, and billing support.",
  "Send and verify account security codes.",
  "Answer Nex AI questions using relevant learning and conversation context.",
  "Maintain learning analytics, aggregate course statistics, support records, and abuse/security protections.",
  "Remember session state, preferences, downloads, and local learning cache.",
  "Comply with legal, security, payment, and platform operation requirements.",
];

const permissionCards = [
  {
    icon: "phone",
    title: "Internet",
    copy: "Network access is used for account, course, media, verification, AI, and payment features.",
  },
  {
    icon: "dashboard",
    title: "Storage",
    copy: "Storage access may support downloads, cached learning material, and files the learner chooses to save or export.",
  },
  {
    icon: "info",
    title: "App Display",
    copy: "Display-related permissions may support app presentation and learning controls where available.",
  },
  {
    icon: "checkCircle",
    title: "Vibration",
    copy: "Vibration may be used for simple device feedback where supported.",
  },
  {
    icon: "award",
    title: "Screen Capture Protection",
    copy: "Protected learning content may use screen-capture controls to help safeguard course material.",
  },
  {
    icon: "receipt",
    title: "Print And Share",
    copy: "Certificate export can use device print or share options when the learner chooses to export or share a certificate.",
  },
];

const sharingGroups = [
  {
    icon: "dashboard",
    title: "Storage And Databases",
    copy: "Skillomate uses secure storage systems to operate accounts, learning progress, billing, support, notifications, and analytics.",
  },
  {
    icon: "sparkles",
    title: "AI Services",
    copy: "AI service providers may process questions, conversation context, course context, and related learning information to provide Nex AI responses.",
  },
  {
    icon: "phone",
    title: "Verification Delivery",
    copy: "Verification providers may process mobile numbers and verification codes for account sign-in and security flows.",
  },
  {
    icon: "receipt",
    title: "Payments",
    copy: "Payment providers may process payment, subscription, refund, amount, and checkout information needed to complete transactions.",
  },
  {
    icon: "play",
    title: "Video And Media",
    copy: "Media and content delivery providers may process course media, thumbnails, playback, downloads, and related learning assets.",
  },
  {
    icon: "code",
    title: "Web Assets And Tooling",
    copy: "Web asset, caching, app-build, device sharing, and notification services may help operate the Skillomate experience.",
  },
];

const storageItems = [
  "Account, session, learning, certificate, wishlist, support, analytics, order, subscription, and billing records may be stored in Skillomate systems.",
  "Browser storage may store authentication state, profile details, learning cache, and preferences.",
  "Mobile storage may store account/session data, offline learning metadata, downloads, and exported files.",
  "Temporary caches may be used to keep the app responsive and reduce repeated loading.",
  "AI-related course context may be stored or indexed to support course-aware answers.",
  "Some records may also be kept by service providers that support hosting, payments, AI, messaging, media, or support features.",
];

const securityItems = [
  "Password protection and secure account authentication controls.",
  "Session protection and access-control checks.",
  "Verification protections that help prevent repeated or unauthorized use.",
  "Payment verification and reconciliation controls.",
  "Security headers, request limits, and production safety checks.",
  "Administrative access checks for restricted areas.",
];

const retentionRows = [
  ["Verification and account-security data", "Kept only as long as needed for the relevant security flow."],
  ["Account and profile data", "Kept while the account is active or as needed for support, safety, and legal reasons."],
  ["Learning progress and certificates", "Kept to provide dashboards, progress tracking, certificates, and course history."],
  ["Payment and subscription records", "Kept as needed for billing, refunds, dispute handling, and legal or tax requirements."],
  ["Support messages", "Kept as needed to respond to requests and maintain service records."],
  ["AI and learning-assistance data", "Kept as needed to provide and improve learning assistance, unless deletion applies."],
];

const deletionCovered = [
  "Profile and account information.",
  "Active account sessions.",
  "Learning progress, saved items, certificates, subscriptions, support requests, and other records linked to the account.",
  "Current-device storage is cleared where possible, including downloaded learning files on the current device.",
];

const deletionNotCovered = [
  "Records that must be retained for legal, billing, security, backup, or dispute-resolution reasons.",
  "Information that is not linked to the account, aggregate statistics, publisher content records, and exported or shared certificate files.",
  "Browser state on another device and records held by service providers.",
  "Deletion requests may require additional support where self-service deletion cannot cover a specific record.",
];

const rightsItems = [
  "View account details from Profile.",
  "Edit supported profile fields including name, email, gender, age, and avatar.",
  "Delete an account from Profile using password verification and confirmation.",
  "Clear the current Nex AI conversation in the web AI Tutor with New Chat.",
  "Remove wishlist items and mobile downloads.",
  "Export certificates through the certificate flow.",
  "Contact support through the Help page or visible support email links.",
];

const rightsGaps = [
  "Use the available account controls to view, update, or remove supported account information.",
  "Contact support for privacy requests that are not available directly in the app.",
  "Some requests may require verification before Skillomate can act on them.",
];

const unresolvedItems = [
  "Contact support for privacy questions, access requests, correction requests, deletion requests, or concerns about data handling.",
  "Skillomate may need to verify your identity before responding to certain privacy requests.",
  "Some records may be retained where required for legal, billing, security, or fraud-prevention reasons.",
];

const privacySections = [
  { id: "introduction", title: "Introduction", icon: "info" },
  { id: "information-we-collect", title: "Information We Collect", icon: "user" },
  { id: "how-we-use-information", title: "How We Use Information", icon: "checkCircle" },
  { id: "nex-ai", title: "Nex AI", icon: "sparkles" },
  { id: "payments-subscriptions", title: "Payments And Subscriptions", icon: "receipt" },
  { id: "device-permissions", title: "Device Permissions", icon: "phone" },
  { id: "cookies-storage", title: "Cookies And Local Storage", icon: "key" },
  { id: "information-sharing", title: "Information Sharing", icon: "dashboard" },
  { id: "third-party-providers", title: "Third-Party Providers", icon: "code" },
  { id: "data-storage", title: "Data Storage", icon: "bookOpen" },
  { id: "security", title: "Security", icon: "award" },
  { id: "retention", title: "Retention", icon: "target" },
  { id: "account-deletion", title: "Account And Data Deletion", icon: "logout" },
  { id: "privacy-rights", title: "Privacy Rights And Controls", icon: "heart" },
  { id: "children-privacy", title: "Children's Privacy And Age", icon: "user" },
  { id: "communications", title: "Communications", icon: "mail" },
  { id: "policy-updates", title: "Policy Updates", icon: "info" },
  { id: "contact-us", title: "Contact Us", icon: "mail" },
];

function SectionNumber({ index }) {
  return <span className="privacy-section-number">{String(index + 1).padStart(2, "0")}</span>;
}

function InfoCard({ item }) {
  return (
    <article className="privacy-info-card">
      <span className="privacy-card-icon" aria-hidden="true"><EnxIcon name={item.icon} /></span>
      <div>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
      </div>
    </article>
  );
}

function CheckList({ items }) {
  return (
    <ul className="privacy-check-list">
      {items.map((item) => (
        <li key={item}><span aria-hidden="true"><EnxIcon name="checkCircle" /></span>{item}</li>
      ))}
    </ul>
  );
}

function PlainList({ items }) {
  return (
    <ul className="privacy-plain-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function PrivacySection({ id, title, index, children }) {
  return (
    <section className="privacy-policy-section" id={id}>
      <SectionNumber index={index} />
      <div className="privacy-section-body">
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function PrivacySidebar() {
  return (
    <aside className="privacy-sidebar" aria-label="Privacy policy table of contents">
      <nav className="privacy-toc">
        <p>On This Page</p>
        {privacySections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            <EnxIcon name={section.icon} />
            <span>{section.title}</span>
          </a>
        ))}
      </nav>
      <div className="privacy-help-card">
        <span aria-hidden="true"><EnxIcon name="mail" /></span>
        <h2>Need Help?</h2>
        <p>For privacy related questions, use the current support channel shown in the app.</p>
        <a href={route("help.html")}>Visit Help Page <EnxIcon name="arrowRight" /></a>
      </div>
    </aside>
  );
}

function MobileToc() {
  return (
    <details className="privacy-mobile-toc">
      <summary>Privacy Policy Sections</summary>
      <div>
        {privacySections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>{section.title}</a>
        ))}
      </div>
    </details>
  );
}

function PrivacyHero() {
  return (
    <section className="privacy-hero" aria-labelledby="privacy-policy-title">
      <div className="privacy-breadcrumb" aria-label="Breadcrumb">
        <a href={route("index.html")}>Home</a>
        <span aria-hidden="true">/</span>
        <span>Privacy Policy</span>
      </div>
      <div className="privacy-hero-grid">
        <div className="privacy-hero-copy">
          <p className="privacy-kicker">Skillomate Legal</p>
          <h1 id="privacy-policy-title">Privacy <span>&amp; Policy</span></h1>
          <p>
            This policy explains how Skillomate handles account, learning, AI, payment, device, storage, and support data.
          </p>
        </div>
        <div className="privacy-hero-art" aria-hidden="true">
          <div className="privacy-orbit privacy-orbit-one"></div>
          <div className="privacy-orbit privacy-orbit-two"></div>
          <div className="privacy-shield">
            <EnxIcon name="key" />
          </div>
          <div className="privacy-hero-art-copy">
            <strong>Learn Securely</strong>
            <span>Grow Fearlessly</span>
            <small>Your data. Your trust. Our responsibility.</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = privacyMeta.title;
    document.documentElement.lang = "en";
    document.body.classList.add("has-privacy-policy-page");
    return () => {
      document.body.classList.remove("has-privacy-policy-page");
    };
  }, []);

  return (
    <main className="react-page-root privacy-policy-page" data-page="privacy.html">
      <PrivacyHero />
      <MobileToc />
      <div className="privacy-policy-shell">
        <PrivacySidebar />
        <article className="privacy-policy-content">
          <PrivacySection id="introduction" title="Introduction" index={0}>
            <p>
              Skillomate, also branded on the web as Skillomate AI, provides accounts, courses, videos, dashboards,
              certificates, Nex AI, payments, support services, and related features. This Privacy Policy explains how
              those services collect, use, store, and share information.
            </p>
            <p>
              Skillomate aims to limit personal information to what is needed to provide learning, account, support,
              payment, security, and AI-assistance features.
            </p>
          </PrivacySection>

          <PrivacySection id="information-we-collect" title="Information We Collect" index={1}>
            <p>Skillomate processes the following categories of information.</p>
            <div className="privacy-card-grid">
              {dataCategories.map((item) => <InfoCard item={item} key={item.title} />)}
            </div>
            <div className="privacy-note-card">
              <EnxIcon name="info" />
              <p>
                Skillomate does not ask learners to provide sensitive device identifiers, contacts, or precise location as
                part of the ordinary learning experience described here.
              </p>
            </div>
          </PrivacySection>

          <PrivacySection id="how-we-use-information" title="How We Use Information" index={2}>
            <p>Skillomate uses information for product, account, learning, payment, support, and security purposes.</p>
            <CheckList items={useItems} />
          </PrivacySection>

          <PrivacySection id="nex-ai" title="Nex AI" index={3}>
            <p>
              Nex AI uses your questions and relevant learning context to provide study help, course explanations, and
              learning assistance. AI responses may depend on the course, lesson, or page you are using.
            </p>
            <div className="privacy-split-cards">
              <InfoCard item={{ icon: "sparkles", title: "AI Conversations", copy: "AI conversations may use your current question, recent conversation context, and relevant course material to generate a response." }} />
              <InfoCard item={{ icon: "bookOpen", title: "Course Context", copy: "When AI help is used inside a course or lesson, relevant course details may be used to make the answer more useful." }} />
            </div>
            <div className="privacy-note-card">
              <EnxIcon name="info" />
              <p>
                Do not submit highly sensitive personal information into Nex AI unless it is necessary for your learning request.
              </p>
            </div>
          </PrivacySection>

          <PrivacySection id="payments-subscriptions" title="Payments And Subscriptions" index={4}>
            <p>
              Skillomate uses external payment providers for checkout and subscription handling. Payment information is
              processed through those providers rather than through ordinary Skillomate learning forms.
            </p>
            <div className="privacy-card-grid privacy-card-grid--three">
              <InfoCard item={{ icon: "receipt", title: "Billing Records", copy: "Skillomate may keep transaction, subscription, refund, and billing status records needed to provide paid access and support." }} />
              <InfoCard item={{ icon: "user", title: "Checkout Details", copy: "Name, mobile number, and email may be shared with payment providers to help complete checkout where available." }} />
              <InfoCard item={{ icon: "info", title: "Payment Credentials", copy: "Skillomate does not ask for highly sensitive payment credentials inside ordinary account or learning forms." }} />
            </div>
          </PrivacySection>

          <PrivacySection id="device-permissions" title="Device Permissions" index={5}>
            <p>The following permissions and device behaviors may support Skillomate features.</p>
            <div className="privacy-card-grid privacy-card-grid--three">
              {permissionCards.map((item) => <InfoCard item={item} key={item.title} />)}
            </div>
            <div className="privacy-note-card">
              <EnxIcon name="info" />
              <p>
                Device permissions are used only where needed for the feature being used. You can manage app permissions
                through your device settings.
              </p>
            </div>
          </PrivacySection>

          <PrivacySection id="cookies-storage" title="Cookies And Local Storage" index={6}>
            <p>
              Skillomate may use browser or device storage for authentication, profile information, learning cache,
              downloads, and preferences.
            </p>
            <p>
              Some third-party services may use their own cookies or similar technologies when their services are loaded.
            </p>
          </PrivacySection>

          <PrivacySection id="information-sharing" title="Information Sharing" index={7}>
            <p>
              Skillomate shares data with service providers that help operate account, learning, payment, media, AI,
              and support features.
              Skillomate does not publish personal information publicly as part of normal learning features.
            </p>
            <div className="privacy-provider-grid">
              {sharingGroups.map((item) => <InfoCard item={item} key={item.title} />)}
            </div>
          </PrivacySection>

          <PrivacySection id="third-party-providers" title="Third-Party Providers" index={8}>
            <p>Skillomate may work with the following categories of service providers.</p>
            <div className="privacy-provider-list">
              <div><strong>Hosting and storage:</strong> Services that host the app, store records, cache data, and deliver content.</div>
              <div><strong>AI and learning support:</strong> Services that help provide course-aware AI assistance and learning features.</div>
              <div><strong>Payments and verification:</strong> Services that help process checkout, subscriptions, refunds, and account verification messages.</div>
              <div><strong>Media and web assets:</strong> Services that help deliver videos, images, fonts, files, and other learning assets.</div>
            </div>
          </PrivacySection>

          <PrivacySection id="data-storage" title="Data Storage" index={9}>
            <PlainList items={storageItems} />
          </PrivacySection>

          <PrivacySection id="security" title="Security" index={10}>
            <p>Skillomate uses technical and organizational safeguards designed to protect learner information.</p>
            <CheckList items={securityItems} />
            <div className="privacy-note-card">
              <EnxIcon name="info" />
              <p>
                No online service can guarantee absolute security. Learners should keep account credentials private and
                contact support if they believe their account has been accessed without permission.
              </p>
            </div>
          </PrivacySection>

          <PrivacySection id="retention" title="Retention" index={11}>
            <p>Skillomate keeps information for as long as needed for the purposes described in this policy.</p>
            <div className="privacy-retention-table">
              {retentionRows.map(([label, value]) => (
                <div className="privacy-retention-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </PrivacySection>

          <PrivacySection id="account-deletion" title="Account And Data Deletion" index={12}>
            <p>
              Learners can request or perform account deletion from Profile where available. Skillomate may require
              password verification or other confirmation before deleting account data.
            </p>
            <div className="privacy-deletion-grid">
              <div>
                <h3>Covered By Self-Service Deletion</h3>
                <PlainList items={deletionCovered} />
              </div>
              <div>
                <h3>Things To Note</h3>
                <PlainList items={deletionNotCovered} />
              </div>
            </div>
          </PrivacySection>

          <PrivacySection id="privacy-rights" title="Privacy Rights And Controls" index={13}>
            <p>Skillomate provides account controls and support channels for privacy-related requests.</p>
            <CheckList items={rightsItems} />
            <div className="privacy-note-card">
              <EnxIcon name="info" />
              <p>{rightsGaps.join(" ")}</p>
            </div>
          </PrivacySection>

          <PrivacySection id="children-privacy" title="Children's Privacy And Age" index={14}>
            <p>
              Skillomate is intended for learners who can use the service lawfully. Age and guardian-consent requirements
              may depend on the learner's location and the way the account is used.
            </p>
          </PrivacySection>

          <PrivacySection id="communications" title="Communications" index={15}>
            <p>
              Skillomate may send verification messages, account notices, course access updates, support replies, and
              important service communications. Marketing or promotional communication should only be sent where permitted.
            </p>
          </PrivacySection>

          <PrivacySection id="policy-updates" title="Policy Updates" index={16}>
            <p>
              Skillomate may update this Privacy Policy from time to time. Updated versions will be posted on this page
              with the latest available policy information.
            </p>
          </PrivacySection>

          <PrivacySection id="contact-us" title="Contact Us" index={17}>
            <p>
              For privacy questions or requests, contact Skillomate through the Help page or the support contact shown in
              the app.
            </p>
            <div className="privacy-final-card">
              <h3>Privacy Requests</h3>
              <PlainList items={unresolvedItems} />
            </div>
          </PrivacySection>
        </article>
      </div>
    </main>
  );
}

function TermsCard({ item }) {
  return (
    <article className="terms-info-card">
      <span className="terms-card-icon" aria-hidden="true"><EnxIcon name={item.icon} /></span>
      <div>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
      </div>
    </article>
  );
}

function TermsList({ items, variant = "plain" }) {
  return (
    <ul className={variant === "check" ? "terms-check-list" : "terms-plain-list"}>
      {items.map((item) => (
        <li key={item}>
          {variant === "check" ? <span aria-hidden="true"><EnxIcon name="checkCircle" /></span> : null}
          <p>{item}</p>
        </li>
      ))}
    </ul>
  );
}

function TermsSection({ id, title, index, children, feature }) {
  return (
    <section className="terms-policy-section" id={id}>
      <div className="terms-section-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="terms-section-main">
        <h2>{title}</h2>
        <div className={feature ? "terms-section-with-feature" : undefined}>
          <div>{children}</div>
          {feature ? <TermsCard item={feature} /> : null}
        </div>
      </div>
    </section>
  );
}

function TermsSidebar() {
  return (
    <aside className="terms-sidebar" aria-label="Terms and conditions table of contents">
      <nav className="terms-toc">
        <p>Terms Guide</p>
        {termsTocSections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            <EnxIcon name={section.icon} />
            <span>{section.title}</span>
          </a>
        ))}
      </nav>
      <div className="terms-help-card">
        <span aria-hidden="true"><EnxIcon name="mail" /></span>
        <h2>Need Help?</h2>
        <p>For account, access, payment, or Terms questions, use Skillomate support.</p>
        <a href={route("help.html")}>Visit Help Page <EnxIcon name="arrowRight" /></a>
      </div>
    </aside>
  );
}

function TermsMobileToc() {
  return (
    <details className="terms-mobile-toc">
      <summary>Terms Sections</summary>
      <div>
        {termsTocSections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>{section.title}</a>
        ))}
      </div>
    </details>
  );
}

function TermsHero() {
  return (
    <section className="terms-hero" aria-labelledby="terms-policy-title">
      <div className="terms-breadcrumb" aria-label="Breadcrumb">
        <a href={route("index.html")}>Home</a>
        <span aria-hidden="true">/</span>
        <a href={route("privacy.html")}>Legal</a>
        <span aria-hidden="true">/</span>
        <span>Terms &amp; Conditions</span>
      </div>
      <div className="terms-hero-grid">
        <div className="terms-hero-copy">
          <p className="terms-kicker">Skillomate Legal</p>
          <h1 id="terms-policy-title">Terms <span>&amp; Conditions</span></h1>
          <p>
            These terms explain how learners use Skillomate accounts, courses, subscriptions, videos, notes, certificates,
            Nex AI, downloads, and support features.
          </p>
        </div>
        <div className="terms-hero-art" aria-hidden="true"></div>
      </div>
    </section>
  );
}

function TermsPage() {
  useEffect(() => {
    document.title = termsMeta.title;
    document.documentElement.lang = "en";
    document.body.classList.add("has-terms-page");
    return () => {
      document.body.classList.remove("has-terms-page");
    };
  }, []);

  return (
    <main className="react-page-root terms-page" data-page="terms.html">
      <TermsHero />
      <TermsMobileToc />
      <div className="terms-policy-shell">
        <TermsSidebar />
        <article className="terms-policy-content">
          <TermsSection id="account-access" title="Account Access" index={0}>
            <p>
              Skillomate accounts use signup details, password-based login, and OTP verification for supported signup
              and password-reset flows. You are responsible for keeping your account access private.
            </p>
            <div className="terms-callout terms-callout--strong">
              <EnxIcon name="key" />
              <div>
                <h3>Keep Your Account Secure</h3>
                <p>Never share your password or OTP. Contact support if you notice unauthorized account activity.</p>
              </div>
            </div>
            <TermsList items={accountTerms} variant="check" />
          </TermsSection>

          <TermsSection id="course-access" title="Course Access" index={1}>
            <p>
              Skillomate offers public course discovery surfaces and protected learning content. Protected lessons and
              downloads require sign-in and qualifying access where the platform checks entitlement.
            </p>
            <div className="terms-card-grid">
              {courseAccessCards.map((item) => <TermsCard item={item} key={item.title} />)}
            </div>
          </TermsSection>

          <TermsSection
            id="trials-subscriptions"
            title="Trials And Subscriptions"
            index={2}
            feature={{ icon: "receipt", title: "Access Depends On Entitlement", copy: "A failed or unconfirmed payment does not independently create paid access." }}
          >
            <p>
              Course access may require a trial or subscription. Current access logic uses trial expiry, subscription
              status, provider invoice periods, and payment reconciliation to decide whether protected content is available.
            </p>
            <div className="terms-card-grid terms-card-grid--three">
              {subscriptionCards.map((item) => <TermsCard item={item} key={item.title} />)}
            </div>
          </TermsSection>

          <TermsSection
            id="payments-billing"
            title="Payments And Billing"
            index={3}
            feature={{ icon: "info", title: "Refund State And Access", copy: "A fully refunded payment may stop qualifying for the related entitlement; partial refund handling depends on recorded provider state." }}
          >
            <p>
              Skillomate uses third-party payment providers for checkout, subscriptions, payment verification, and later
              reconciliation. The provider interface handles payment-instrument entry.
            </p>
            <div className="terms-card-grid terms-card-grid--three">
              {paymentCards.map((item) => <TermsCard item={item} key={item.title} />)}
            </div>
          </TermsSection>

          <TermsSection id="downloads-offline" title="Downloads And Offline Use" index={4}>
            <p>
              Skillomate mobile supports authorized offline video downloads for personal learning. Offline availability
              is a feature of the app, not permission to copy or distribute course material outside Skillomate.
            </p>
            <TermsList items={downloadItems} />
          </TermsSection>

          <TermsSection id="certificates" title="Certificates" index={5}>
            <p>
              Skillomate certificates are course-completion records generated from stored progress. They help document
              completion inside the Skillomate learning experience.
            </p>
            <TermsList items={certificateItems} />
          </TermsSection>

          <TermsSection id="nex-ai" title="Nex AI Assistance" index={6}>
            <p>
              Nex AI is an educational assistant for Skillomate learning and platform guidance. It can help explain
              concepts, suggest practice, troubleshoot topics, and respond using relevant learning context.
            </p>
            <div className="terms-ai-panel">
              <EnxIcon name="sparkles" />
              <div>
                <h3>AI Answers Need Human Judgment</h3>
                <p>
                  Nex AI may be wrong. Verify important academic, career, financial, and technical decisions independently.
                </p>
              </div>
            </div>
            <TermsList items={aiTerms} variant="check" />
          </TermsSection>

          <TermsSection id="acceptable-use" title="Acceptable Use" index={7}>
            <p>Use Skillomate in a way that respects learners, platform security, payment access, and course content.</p>
            <TermsList items={acceptableUseItems} variant="check" />
          </TermsSection>

          <TermsSection id="course-content" title="Course Content And IP" index={8}>
            <p>
              Skillomate learning materials are provided for personal learning. Authorized in-app downloads are allowed
              only through supported Skillomate features.
            </p>
            <TermsList items={contentTerms} />
          </TermsSection>

          <TermsSection id="third-party-services" title="Third-Party Services" index={9}>
            <p>
              Skillomate features depend on third-party systems for storage, verification, payments, AI, video delivery,
              images, hosting, mobile platform services, and device sharing or printing.
            </p>
            <div className="terms-provider-grid">
              {providerCards.map((item) => <TermsCard item={item} key={item.title} />)}
            </div>
          </TermsSection>

          <TermsSection id="account-deletion" title="Account Deletion" index={10}>
            <p>
              Skillomate provides account deletion from Profile where available. Deletion requires password verification
              and a typed confirmation, and may be blocked by active or unresolved payment mandates.
            </p>
            <div className="terms-deletion-panel">
              <h3>Deletion Scope</h3>
              <TermsList items={deletionTerms} />
            </div>
          </TermsSection>

          <TermsSection id="termination-access" title="Termination And Access" index={11}>
            <p>
              Access can end or be restricted when account, session, entitlement, deletion, or account-active checks fail.
              Local downloaded files may not be remotely removed by every access change.
            </p>
            <TermsList items={terminationTerms} />
          </TermsSection>

          <TermsSection id="availability" title="Availability And Changes" index={12}>
            <p>
              Skillomate depends on app infrastructure, provider availability, content systems, and administrative course
              management. Features and course surfaces can change over time.
            </p>
            <TermsList items={availabilityTerms} />
          </TermsSection>

          <TermsSection id="support" title="Support" index={13}>
            <p>
              For account, course access, payment, deletion, or Terms questions, use the Help page or email Skillomate
              support at <a href="mailto:support@skillomate.in">support@skillomate.in</a>.
            </p>
          </TermsSection>
        </article>
      </div>
    </main>
  );
}

export function LegalPage({ type }) {
  if (type === "terms") return <TermsPage />;
  return <PrivacyPolicyPage />;
}
