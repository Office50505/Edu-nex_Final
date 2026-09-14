import { useEffect } from "react";
import { BusinessAddress, CheckList, InfoGrid, LegalLayout, LegalSection } from "../components/legal/LegalLayout.jsx";
import { setPageMeta } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";
import { EnxIcon } from "../components/EnxIcon.jsx";

const focusAreas = [
  { icon: "bookOpen", title: "Structured courses", copy: "Organized learning paths, lessons and resources designed for practical skill-building." },
  { icon: "video", title: "Video learning", copy: "Digital lessons users can access through their Skillomate account where eligible." },
  { icon: "sparkles", title: "AI-assisted tools", copy: "AI learning support for explanations, practice ideas and course guidance." },
  { icon: "award", title: "Progress and certificates", copy: "Learning progress tracking and certificates for eligible course completion." },
];

export function AboutPage() {
  useEffect(() => {
    setPageMeta({
      title: "About Skillomate",
      description: "Skillomate is a digital learning platform operated by Smartcart in Indore, Madhya Pradesh, India.",
      canonicalPath: "/about",
    });
  }, []);

  return (
    <LegalLayout
      title="About Skillomate"
      description="Skillomate is a digital learning platform focused on helping people learn practical, modern skills through courses, video learning and AI-assisted tools."
      updated={false}
      actions={<a className="legal-button" href={route("courses.html")}>Explore courses <EnxIcon name="arrowRight" /></a>}
      sections={[
        { id: "platform", title: "The platform" },
        { id: "learning", title: "How Skillomate helps learners" },
        { id: "business", title: "Business information" },
      ]}
    >
      <LegalSection id="platform" title="The platform">
        <p>Skillomate provides digital educational services including structured courses, video lessons, AI-assisted learning tools, practical lessons, learning progress, certificates and downloadable educational resources.</p>
        <InfoGrid items={focusAreas} />
      </LegalSection>
      <LegalSection id="learning" title="How Skillomate helps learners">
        <CheckList items={[
          "Discover relevant courses and learning resources.",
          "Watch lessons and track progress through a Skillomate account.",
          "Use AI-assisted tools for learning support and explanations.",
          "Access certificates and downloads where available for eligible courses.",
        ]} />
        <p>Skillomate is an educational platform. It does not promise guaranteed employment, earnings, business income, examination results or professional success.</p>
      </LegalSection>
      <LegalSection id="business" title="Business information">
        <p>Skillomate is operated by Smartcart, a sole proprietorship based in Indore, Madhya Pradesh, India.</p>
        <BusinessAddress />
      </LegalSection>
    </LegalLayout>
  );
}
