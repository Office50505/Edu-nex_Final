import { useEffect, useState } from "react";
import { LegalLayout, LegalSection, PlainList } from "../components/legal/LegalLayout.jsx";
import { POLICY_LAST_UPDATED, SUPPORT_EMAIL, setPageMeta } from "../lib/siteMeta.js";

const retainedReasons = [
  "Legal obligations",
  "Tax/accounting obligations",
  "Payment records",
  "Fraud prevention",
  "Security",
  "Dispute resolution",
  "Compliance obligations",
];

export default function DeleteAccountPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setPageMeta({
      title: "Account & Data Deletion | Skillomate",
      description: "How Skillomate users can request account and data deletion from the app or by contacting support.",
      canonicalPath: "/account-deletion",
    });
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.get("fullName"),
          mobileNumber: data.get("mobileNumber"),
          email: data.get("email"),
          reason: data.get("reason"),
          confirm: data.get("confirm") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to submit your request.");
      setSent(true);
      event.currentTarget.reset();
    } catch (e) {
      setError(e.message || "Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LegalLayout
      title="Account & Data Deletion"
      description="Users can request account and data deletion through Skillomate support."
      sections={[
        { id: "external", title: "External request" },
        { id: "timeline", title: "Deletion timeline" },
        { id: "request-form", title: "Request form" },
      ]}
    >
      <LegalSection id="external" title="External request">
        <p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the request form below. We may need to verify account ownership before processing the request.</p>
      </LegalSection>
      <LegalSection id="timeline" title="Deletion timeline and retained records">
        <p>When an account-deletion request is confirmed, account access may be disabled and associated personal information should be deleted or anonymized within up to 30 days, except information that must legitimately be retained for limited purposes.</p>
        <PlainList items={retainedReasons} />
        <p>Course activity, wishlist/search information and similar personal account data should be deleted or anonymized as part of the deletion process unless legitimate retention is required. Retained records are limited to what is necessary for those purposes.</p>
        <p>Last updated: {POLICY_LAST_UPDATED}</p>
      </LegalSection>
      <LegalSection id="request-form" title="Request deletion without signing in">
        {sent ? (
          <div className="legal-callout" role="status">
            <strong>Request received.</strong>
            <p>Your account has not been deleted yet. Our team will contact you at the email provided to verify account ownership before processing deletion. Submitting this request does not by itself cancel an active subscription or payment mandate.</p>
          </div>
        ) : (
          <form className="legal-form" onSubmit={submit}>
            <label>Account name<input name="fullName" autoComplete="name" required maxLength={120} /></label>
            <label>Registered mobile number<input name="mobileNumber" type="tel" autoComplete="tel" required maxLength={20} /></label>
            <label>Contact email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label>Additional details <span>(optional)</span><textarea name="reason" rows={4} maxLength={1000} /></label>
            <p>Do not include passwords, OTPs, card details or UPI PINs.</p>
            <label className="legal-form-check"><input type="checkbox" name="confirm" required /> I am requesting deletion of my own Skillomate account and understand that deletion is permanent once completed.</label>
            {error ? <p role="alert">{error}</p> : null}
            <button className="legal-button" disabled={busy} type="submit">{busy ? "Submitting..." : "Request deletion"}</button>
          </form>
        )}
      </LegalSection>
    </LegalLayout>
  );
}
