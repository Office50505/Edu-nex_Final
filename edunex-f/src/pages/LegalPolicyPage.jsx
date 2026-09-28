import { useEffect } from "react";
import { CheckList, InfoGrid, LegalLayout, LegalSection, PlainList, BusinessAddress } from "../components/legal/LegalLayout.jsx";
import { POLICY_LAST_UPDATED, SUPPORT_EMAIL, businessInfo, setPageMeta, subscriptionOffer } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";

const learningServices = [
  "Online courses and video lessons",
  "AI-assisted learning tools and mentor/chatbot functionality",
  "Educational resources and downloadable educational content",
  "Certificates, learning progress tracking, wishlists, search and course discovery",
];

const privacyCollected = [
  "Name, phone number, age, gender, selected avatar and any profile photograph you choose to upload",
  "Course progress, lesson/watch activity, downloaded lesson/content information and certificates",
  "Wishlist information, search activity and course discovery activity",
  "AI chatbot prompts, up to 12 recent chat messages and relevant course/lesson context when you use Nex AI",
  "Device/app information, authentication session data, IP address, security logs and push notification tokens",
  "Payment transaction identifiers and billing/subscription records",
];

const privacyNotCollected = [
  "Skillomate does not require precise GPS location, contacts, microphone recordings or camera access for the core learning service.",
  "Profile photographs are optional and are selected from the system photo picker; the app does not request broad photo-library access.",
  "Full card or bank credentials are entered with the relevant payment provider or app store and are not stored by Skillomate.",
];

const privacyUses = [
  "Create accounts and authenticate users with phone number and OTP.",
  "Provide courses, video lessons, downloads, progress tracking, certificates, wishlists and search.",
  "Operate AI learning functionality, generate responses and provide course-aware support.",
  "Manage subscriptions, payment reconciliation, support requests and notifications.",
  "Prevent fraud, improve platform reliability, maintain security and comply with legal obligations.",
];

const providerCards = [
  { icon: "key", title: "OTP authentication", copy: "Phone number OTP authentication may use MSG91 to send and verify one-time passwords." },
  { icon: "receipt", title: "Payments", copy: "Razorpay may process eligible web transactions. Google Play Billing or Apple in-app purchase systems may process eligible mobile purchases." },
  { icon: "dashboard", title: "Infrastructure", copy: "Infrastructure may include Amazon Web Services, Amazon EC2, Amazon S3, Amazon CloudFront and MongoDB, without exposing confidential configuration details." },
  { icon: "sparkles", title: "AI functionality", copy: "When you use Nex AI, AI service providers may process your question, up to 12 recent messages and relevant course/lesson context. Skillomate does not send your profile name in the AI request." },
];

const termsItems = [
  "You must be at least 13 years old to use Skillomate.",
  "You are responsible for accurate account information and for keeping your OTP, password and device access private.",
  "Courses, videos, certificates, downloads and AI tools are provided for educational use only.",
  "Do not redistribute, resell, screen record, scrape, upload or publish Skillomate content without written permission.",
  "Skillomate may suspend or terminate access for misuse, payment issues, security concerns, piracy or violation of these Terms.",
  "Skillomate does not guarantee employment, income, business results, examination results or professional success.",
];

const acceptableUse = [
  "Do not bypass subscription, payment, video protection, account or access controls.",
  "Do not attack, overload, reverse engineer or disrupt the platform.",
  "Do not submit unlawful, abusive, misleading or harmful content through forms, support or AI features.",
  "Do not misrepresent certificates, course completion, AI output, account identity or authorization.",
];

const refundExceptions = [
  "Payment was successfully charged but eligible digital access was not delivered.",
  "A duplicate transaction occurred because of a verified technical or payment issue.",
  "A payment was recorded incorrectly and requires reconciliation.",
];

const deliveryFacts = [
  "Skillomate sells digital educational services only.",
  "No physical products are shipped.",
  "There is no courier delivery, physical shipping charge, shipping tracking or physical delivery timeline.",
  "After successful payment, eligible course or subscription access is normally activated immediately in the user's Skillomate account.",
];

const subscriptionFacts = [
  "The introductory 24-hour trial is ₹1.",
  "After the 24-hour trial, the subscription automatically renews at ₹499 per month until cancelled.",
  "Users authorize recurring billing when approving the payment mandate or subscription.",
  "Users may cancel anytime. Cancellation stops future renewals after it takes effect.",
  "Existing paid access continues until the end of the applicable billing period after cancellation.",
];

const cookieItems = [
  "Authentication and session management",
  "Security and fraud-prevention checks",
  "Remembering preferences such as theme and local learning state",
  "Payment flow continuity",
  "Basic website and app functionality",
];

const policyContent = {
  privacy: {
    title: "Privacy Policy",
    metaTitle: "Privacy Policy | Skillomate",
    description: "How Skillomate collects, uses, stores and protects account, learning, AI, payment and support information.",
    canonicalPath: "/privacy",
    sections: [
      ["operator", "Who operates Skillomate", <><p>Skillomate is operated by Smartcart, a sole proprietorship owned by Insha Noor, based in Indore, Madhya Pradesh, India.</p><BusinessAddress /></>],
      ["information-we-collect", "Information we collect", <><p>Skillomate may collect the following information when you create an account, use courses, choose AI features, make payments, upload a profile photo or contact support.</p><PlainList items={privacyCollected} /><div className="legal-callout"><strong>Location:</strong> Skillomate records IP addresses in security/session logs but does not request precise GPS location or send IP addresses to a geolocation lookup provider.</div></>],
      ["information-users-provide", "Information users provide", <PlainList items={["Account details such as name, phone number, age, gender, avatar selection and optional profile photograph.", "Support messages and deletion/contact requests sent to Skillomate.", "AI prompts or messages submitted through Nex AI."]} />],
      ["automatically-collected", "Automatically collected information", <PlainList items={["Device, browser or app information, IP address and authentication/session records needed for security and service operation.", "Lesson activity, watch activity, downloads, search activity and wishlist activity.", "Push notification tokens and limited technical logs."]} />],
      ["not-collected", "Information not required for standard profiles", <PlainList items={privacyNotCollected} />],
      ["how-we-use", "How we use information", <CheckList items={privacyUses} />],
      ["payments", "Payments", <p>Razorpay may process eligible web transactions. Google Play Billing may process Android purchases where applicable. Apple may process eligible iOS purchases through Apple in-app purchase systems. Skillomate may keep transaction identifiers, subscription status and billing records to provide access, reconcile payments, support users and meet compliance obligations.</p>],
      ["ai-functionality", "AI functionality", <><p>When you use Nex AI, AI service providers may receive your question, up to 12 recent messages and relevant course or lesson context. Your profile name is not included in that model request.</p><p>You can delete AI chat history from AI Data Controls. Chat history may also be stored locally in your browser or app so you can reopen prior chats. Reports about unsafe or incorrect replies retain a response hash and report reason rather than the response text.</p><p>AI responses may be inaccurate or incomplete and should not be treated as professional advice.</p></>],
      ["sharing", "Data sharing and service providers", <><p>Skillomate may share limited information with service providers that help operate authentication, hosting, storage, payments, notifications, media delivery, AI learning functionality and customer support.</p><InfoGrid items={providerCards} /></>],
      ["security", "Data security", <p>We use reasonable administrative, technical and organizational safeguards designed to protect information. No online service can guarantee absolute security, and users should keep OTPs, passwords and account access private.</p>],
      ["retention", "Data retention", <p>Account, profile, learning and local AI history are kept while needed to provide the service and are deleted through the applicable deletion controls. Security and support records are retained only as reasonably needed. Payment and App Store transaction records may be anonymized and retained when required for tax, accounting, reconciliation, fraud prevention, disputes or legal compliance.</p>],
      ["account-deletion", "Account deletion", <p>Users can permanently delete their account from Profile after password confirmation, or contact support. Access and active sessions are revoked first; personal profile, learning, saved AI history, optional profile photograph and related account data are deleted. If a recurring-billing provider is temporarily unavailable, account deletion still completes and cancellation is queued for retry. Limited payment or transaction records may be anonymized and retained for tax, accounting, reconciliation, fraud prevention, disputes or legal obligations.</p>],
      ["children", "Children and minor users", <p>Skillomate is intended for users aged 13 years and above. Users below the age required to consent independently under applicable law should use the service only with appropriate parental or guardian involvement.</p>],
      ["rights", "User rights", <p>Users can access and update supported profile fields, manage wishlists and learning activity through available account features, request deletion and contact support for privacy questions or correction requests. Some requests may require verification.</p>],
      ["notifications", "Notifications", <p>Skillomate may send OTPs, account notices, course access updates, support replies, subscription/payment notices and push notifications where enabled. Device notification settings can be managed through the relevant platform controls.</p>],
      ["third-party", "Third-party services", <p>Payment platforms, app stores, cloud infrastructure, messaging providers and AI/service providers may process information under their own terms and privacy notices when their services are used.</p>],
      ["changes", "Changes to this policy", <p>We may update this Privacy Policy from time to time. The latest version will be posted on this page with the Last updated date.</p>],
      ["contact", "Grievance and privacy contact", <p>For privacy, grievance or data requests, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Support hours are {businessInfo.supportHours}. Typical response: {businessInfo.responseTime}.</p>],
    ],
  },
  terms: {
    title: "Terms & Conditions",
    metaTitle: "Terms & Conditions | Skillomate",
    description: "The terms for using Skillomate accounts, courses, subscriptions, AI-assisted learning tools, downloads and certificates.",
    canonicalPath: "/terms",
    sections: [
      ["acceptance", "Acceptance of terms", <p>By creating an account, browsing courses, purchasing access or using Skillomate, you agree to these Terms & Conditions and related policies.</p>],
      ["eligibility", "Eligibility and accounts", <><p>Skillomate is available to users in India and is intended for users aged 13 years and above. Accounts use phone number and OTP authentication, and users must provide accurate account information.</p><CheckList items={termsItems} /></>],
      ["course-access", "Course and subscription access", <p>Skillomate provides digital access to online courses, video lessons, educational resources, certificates, downloads, progress tracking, wishlists, search and AI-assisted learning tools through the user's Skillomate account.</p>],
      ["subscription-billing", "Subscription billing", <><div className="legal-callout"><strong>{subscriptionOffer.disclosure}</strong></div><p>Subscriptions continue until cancelled. If cancelled, access remains available until the end of the already-paid billing period and cancellation stops future renewals.</p></>],
      ["payments", "Payments", <p>Web payments may be processed through Razorpay. Android purchases may be handled by Google Play Billing where applicable. iOS purchases may be handled through Apple's in-app purchasing system where applicable. Platform-specific subscriptions may need to be managed through the relevant platform account.</p>],
      ["ai", "AI-assisted learning features", <p>AI tools are educational assistance features. AI output may be inaccurate, incomplete or unsuitable for a particular purpose. Users should verify important information independently.</p>],
      ["certificates-downloads", "Certificates and downloads", <p>Certificates are Skillomate course-completion records. Downloadable educational content and offline access, where available, are for personal learning only and do not permit redistribution.</p>],
      ["acceptable-use", "Acceptable use", <CheckList items={acceptableUse} />],
      ["intellectual-property", "Intellectual property", <p>Skillomate content, course materials, videos, text, certificates, branding and platform design are protected by intellectual property rights. Users receive a limited, personal, non-transferable right to access content for learning.</p>],
      ["suspension", "Suspension and termination", <p>Skillomate may suspend or terminate accounts or access where required for security, policy violations, payment issues, suspected fraud, piracy, misuse or legal compliance.</p>],
      ["availability", "Availability and content updates", <p>Skillomate may update courses, features, pricing displays, content and platform functionality. We do not promise uninterrupted availability or that all content will remain available forever.</p>],
      ["no-guarantee", "No guaranteed results", <p>Skillomate courses and AI tools are educational services. We do not promise guaranteed employment, guaranteed earnings, guaranteed business income, guaranteed examination results or guaranteed professional success. Results depend on individual effort and circumstances.</p>],
      ["third-party", "Third-party services", <p>Payments, app stores, hosting, OTP delivery, content delivery, AI functionality and other platform features may depend on third-party services and their terms.</p>],
      ["liability-law", "Liability and governing law", <p>To the fullest extent permitted by applicable law, Skillomate is not liable for indirect, incidental, special or consequential losses. These Terms are governed by the laws of India, subject to applicable consumer protection laws.</p>],
      ["changes-contact", "Changes and contact", <p>We may update these Terms. For questions, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>],
    ],
  },
  refund: {
    title: "Refund & Cancellation Policy",
    metaTitle: "Refund & Cancellation Policy | Skillomate",
    description: "How Skillomate handles subscription cancellation, digital-access refunds and payment-platform refund rules.",
    canonicalPath: "/refund-policy",
    sections: [
      ["overview", "General policy", <p>Skillomate provides digital course and subscription access. Digital course/subscription purchases are generally non-refundable once access has been successfully provided, except where required by applicable law or the policies of the payment platform involved.</p>],
      ["subscription", "Subscription cancellation", <><p>Users can cancel recurring subscriptions at any time. Cancellation prevents future billing after it takes effect. Access remains available until the end of the current paid billing period.</p><div className="legal-callout"><strong>{subscriptionOffer.disclosure}</strong></div></>],
      ["exceptional", "Exceptional cases we may investigate", <><p>Skillomate does not promise automatic refunds. We may investigate exceptional situations after verification, subject to applicable law and payment-provider rules.</p><PlainList items={refundExceptions} /></>],
      ["platforms", "Google Play and Apple purchases", <p>For purchases completed through Google Play or the Apple App Store, cancellation and refund requests may be governed and processed through the applicable platform billing/refund mechanisms.</p>],
      ["web", "Razorpay/web payments", <p>For eligible web payment concerns, contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your account phone number, transaction reference if available and a short description. Do not send card, UPI PIN, OTP or password details.</p>],
    ],
  },
  shipping: {
    title: "Digital Delivery & Shipping Policy",
    metaTitle: "Digital Delivery & Shipping Policy | Skillomate",
    description: "Skillomate sells digital educational services only. This page explains digital access and why physical shipping does not apply.",
    canonicalPath: "/shipping-policy",
    sections: [
      ["digital-only", "Digital services only", <CheckList items={deliveryFacts} />],
      ["activation", "Access activation", <p>After successful payment, eligible course or subscription access should normally become available immediately in the user's Skillomate account. Users must sign in to the correct account to access paid digital services.</p>],
      ["delays", "If access is delayed", <p>If access is delayed because of a technical or payment-verification issue, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Typical support response: {businessInfo.responseTime}.</p>],
      ["no-shipping", "No physical shipping", <p>Because Skillomate does not sell physical products, courier delivery, shipping charges, tracking numbers and physical delivery timelines do not apply.</p>],
    ],
  },
  subscription: {
    title: "Subscription & Billing Policy",
    metaTitle: "Subscription & Billing Policy | Skillomate",
    description: "Clear billing terms for Skillomate's ₹1 24-hour trial and ₹499/month automatic renewal subscription.",
    canonicalPath: "/subscription-policy",
    sections: [
      ["current-offer", "Current subscription offer", <><div className="legal-callout"><strong>{subscriptionOffer.disclosure}</strong></div><CheckList items={subscriptionFacts} /></>],
      ["authorization", "Recurring billing authorization", <p>By approving the mandate or subscription, users authorize recurring billing through the payment method or platform account used for the purchase until cancellation.</p>],
      ["web-android-ios", "Web, Android and iOS billing", <InfoGrid items={[{ icon: "receipt", title: "Web", copy: "Razorpay may process eligible web payments and subscription mandates." }, { icon: "playStore", title: "Android", copy: "Purchases may be handled by Google Play Billing where applicable and may need to be managed through Google Play." }, { icon: "apple", title: "iOS", copy: "Purchases may be handled through Apple's in-app purchasing system where applicable and may need to be managed through Apple account settings." }]} />],
      ["cancellation", "Cancellation", <p>Users may cancel anytime. No future renewal should occur after cancellation takes effect. Existing paid access continues until the end of the applicable billing period.</p>],
      ["support", "Billing support", <p>For billing questions, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Never share OTPs, passwords, full card numbers or UPI PINs with support.</p>],
    ],
  },
  cookies: {
    title: "Cookie Policy",
    metaTitle: "Cookie Policy | Skillomate",
    description: "How Skillomate uses necessary cookies and browser/device storage for authentication, security and core website functionality.",
    canonicalPath: "/cookie-policy",
    sections: [
      ["overview", "Overview", <p>Skillomate may use necessary cookies, local storage, session storage or similar browser/device storage to operate the website and app. Advertising measurement tools such as Meta Pixel may be used on offer pages when enabled by an administrator.</p>],
      ["uses", "Storage we may use", <CheckList items={cookieItems} />],
      ["choices", "Your choices", <p>Users can clear browser storage through browser settings, but doing so may sign the user out or reset preferences. Mobile app storage can be managed through device settings where supported.</p>],
      ["third-party", "Third-party payment and platform flows", <p>Payment providers and app stores may use their own cookies or storage when their hosted payment or account pages are used. Those services are governed by their own notices.</p>],
      ["contact", "Contact", <p>For questions, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>],
    ],
  },
};

function sectionsFor(page) {
  return page.sections.map(([id, title]) => ({ id, title }));
}

export function LegalPolicyPage({ type }) {
  const page = policyContent[type] || policyContent.privacy;

  useEffect(() => {
    setPageMeta({
      title: page.metaTitle,
      description: page.description,
      canonicalPath: page.canonicalPath,
    });
  }, [page]);

  return (
    <LegalLayout title={page.title} description={page.description} sections={sectionsFor(page)}>
      {page.sections.map(([id, title, content]) => <LegalSection key={id} id={id} title={title}>{content}</LegalSection>)}
      <LegalSection id="services-covered" title="Services covered">
        <PlainList items={learningServices} />
        <p>Last updated: {POLICY_LAST_UPDATED}</p>
      </LegalSection>
    </LegalLayout>
  );
}
