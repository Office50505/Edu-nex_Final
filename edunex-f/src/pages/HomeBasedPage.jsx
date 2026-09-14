import { useEffect, useMemo } from "react";
import { page as homeBasedPage } from "../generated-pages/home-based.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

const mentorImage = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3ESkillomate%3C/text%3E%3C/svg%3E";

const futureProof = [
  ["fa-pen-nib", "AI Content Creation", "Master ChatGPT, Claude, and Midjourney to produce professional content 10× faster. Freelance, create courses, or run your own content agency.", [["$50–$150/hr", "badge-teal"], ["Freelance", "badge-gray"]], "var(--accent)", "rgba(197,139,42,.12)"],
  ["fa-cogs", "AI Automation Services", "Build no-code and low-code AI automations for businesses. Help companies save thousands of hours and charge premium rates for your expertise.", [["$2K–$10K/project", "badge-green"], ["Consulting", "badge-gray"]], "var(--accent-green)", "rgba(34,197,94,.12)"],
  ["fa-chalkboard-teacher", "AI Teaching & Coaching", "Once you've mastered AI skills, teach others. Create online courses, run workshops, or do 1-on-1 coaching for top-dollar hourly rates.", [["$100–$300/hr", "badge-purple"], ["Coaching", "badge-gray"]], "#A78BFA", "rgba(123,92,240,.15)"],
  ["fa-store", "AI Product Business", "Build and sell AI-powered digital products: templates, tools, agents, and SaaS micro-apps. Create once, sell forever with passive income.", [["Passive Income", "badge-gray"], ["Scalable", "badge-green"]], "#FB923C", "rgba(251,146,60,.12)"],
  ["fa-video", "AI Video & Media", "Use AI video tools to produce YouTube channels, social media content, and branded videos for clients — without filming a single frame yourself.", [["YouTube", "badge-gray"], ["Social Media", "badge-teal"]], "#FB7185", "rgba(244,63,94,.12)"],
  ["fa-network-wired", "AI Consulting Agency", "Package your skills into an agency that helps businesses adopt AI. This is one of the fastest-growing and most lucrative service categories today.", [["$5K–$20K/mo", "badge-teal"], ["Agency", "badge-gray"]], "var(--accent)", "rgba(197,139,42,.12)"],
];

const mentors = [
  ["Skillomate Learner", "AI Income Strategist", "10+ years in AI product development. Built 3 AI startups and now teaches students how to replicate his success from home.", ["fa-twitter", "fa-linkedin", "fa-youtube"], "Skillomate Learner"],
  ["Skillomate Mentor", "AI Content Expert", "Former Google engineer turned AI content consultant. Earning $15K/month from AI-powered content businesses she built from scratch.", ["fa-twitter", "fa-linkedin", "fa-instagram"], "Skillomate Mentor"],
  ["Skillomate Mentor", "AI Automation Specialist", "Built and sold two AI automation agencies. Now shares exactly how to replicate his $200K/year formula with students worldwide.", ["fa-twitter", "fa-linkedin", "fa-youtube"], "Skillomate Mentor"],
  ["Skillomate Mentor", "AI Freelance Coach", "Top-rated AI freelancer on Upwork with $500K+ in earnings. Teaches her proven system for landing premium AI clients consistently.", ["fa-twitter", "fa-linkedin", "fa-instagram"], "Skillomate Mentor"],
];

function DisabledSocial({ icon }) {
  const label = icon.replace("fa-", "").replace(/^\w/, (letter) => letter.toUpperCase());
  return (
    <span className="social-btn" role="link" aria-label={label} aria-disabled="true" tabIndex={-1}>
      <i className={`fab ${icon}`} aria-hidden="true"></i>
    </span>
  );
}

export function HomeBasedPage() {
  usePageStyle("react-page-style-home-based", homeBasedPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...homeBasedPage,
    scripts: homeBasedPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = homeBasedPage.title;
    document.documentElement.lang = homeBasedPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const handleJoinSubmit = (event) => {
    event.preventDefault();
  };

  return (
    <div className="react-page-root" data-page="home-based.html">
      <section className="hero-main">
        <div className="orb orb-teal orb-1"></div>
        <div className="orb orb-green orb-2"></div>
        <div className="hero-main hero-grid grid-bg grid-bg-fade"></div>
        <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 860, paddingTop: 40 }}>
          <div className="hero-eyebrow reveal" style={{ justifyContent: "center" }}>
            <span className="live-dot"></span>
            The AI Income Revolution Is Here
          </div>
          <h1 className="reveal reveal-delay-1">
            Democratizing<br />
            <span className="gradient-text">AI Income</span>
          </h1>
          <p className="hero-sub reveal reveal-delay-2" style={{ margin: "0 auto 40px", textAlign: "center", maxWidth: 620 }}>
            The AI economy is generating billions in new income opportunities every day. Skillomate gives you the skills, tools, and mentorship to claim your share — from anywhere in the world.
          </p>
          <div className="hero-actions reveal reveal-delay-3" style={{ justifyContent: "center" }}>
            <a href="login.html" className="btn btn-primary btn-xl"><i className="fas fa-arrow-up" aria-hidden="true"></i> Start Earning With AI</a>
            <a href="courses.html" className="btn btn-outline btn-lg"><i className="fas fa-play-circle" aria-hidden="true"></i> Explore Courses</a>
          </div>
        </div>
        <div className="container" style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", marginTop: 60 }}>
          <div className="ai-sphere animate-float">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <div className="ring ring-3"></div>
            <div className="core"><i className="fas fa-brain" aria-hidden="true"></i></div>
            <div className="node"></div><div className="node"></div><div className="node"></div><div className="node"></div><div className="node"></div><div className="node"></div>
          </div>
        </div>
      </section>

      <div className="stats-strip reveal">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item"><div className="stat-num" data-target="50" data-suffix="K+">50K+</div><div className="stat-label">Active Earners</div></div>
            <div className="stat-item"><div className="stat-num" data-target="2.5" data-suffix="M+">$2.5M+</div><div className="stat-label">Student Earnings</div></div>
            <div className="stat-item"><div className="stat-num" data-target="92" data-suffix="%">92%</div><div className="stat-label">Students Earning in 90 days</div></div>
            <div className="stat-item"><div className="stat-num" data-target="3200" data-prefix="$" data-suffix="/mo">$3,200/mo</div><div className="stat-label">Avg. Monthly Earnings</div></div>
          </div>
        </div>
      </div>

      <section className="revolution-section section">
        <div className="container">
          <div className="inner">
            <div className="reveal">
              <div className="section-tag"><i className="fas fa-bolt" aria-hidden="true"></i> Why Now</div>
              <h2 style={{ marginTop: 14 }}>Join the <span className="gradient-text">AI Revolution</span></h2>
              <p style={{ margin: "14px 0 8px", fontSize: "1rem" }}>The shift is happening right now. AI is not replacing people — it's replacing people who don't know how to use AI. Position yourself on the right side of history.</p>
              <div className="rev-features">
                {[
                  ["fa-brain", "AI Skills Pay Real Money", "AI prompt engineers, content creators, and automation specialists are earning $50–$200/hour — skills anyone can learn in weeks."],
                  ["fa-home", "Work From Anywhere", "All AI income streams are 100% remote. Build a business from your living room, coffee shop, or beach — with just a laptop."],
                  ["fa-chart-line", "Scalable & Automated", "AI tools let you work smarter, not harder. Automate repetitive tasks and scale your income without scaling your hours."],
                  ["fa-globe", "Global Demand", "Businesses worldwide are desperately seeking AI-skilled professionals. The demand far exceeds the current supply of skilled people."],
                ].map(([icon, title, copy]) => (
                  <div className="rev-feature" key={title}>
                    <div className="feat-icon"><i className={`fas ${icon}`} aria-hidden="true"></i></div>
                    <div><h3>{title}</h3><p style={{ fontSize: ".85rem", margin: 0 }}>{copy}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="join-card reveal reveal-delay-2">
              <div className="section-tag" style={{ marginBottom: 16 }}><i className="fas fa-users" aria-hidden="true"></i> Join Today</div>
              <h3>Start Your <span className="gradient-text">AI Journey</span></h3>
              <p>Create your free account and get instant access to your first module.</p>
              <form onSubmit={handleJoinSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="homeBasedName">Full Name</label>
                  <div className="input-icon-wrap"><i className="fas fa-user" aria-hidden="true"></i><input id="homeBasedName" className="form-input" type="text" placeholder="John Smith" /></div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="homeBasedEmail">Email Address</label>
                  <div className="input-icon-wrap"><i className="fas fa-envelope" aria-hidden="true"></i><input id="homeBasedEmail" className="form-input" type="email" placeholder="john@example.com" /></div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="homeBasedWhatsapp">WhatsApp Number</label>
                  <div className="input-icon-wrap"><i className="fab fa-whatsapp" aria-hidden="true"></i><input id="homeBasedWhatsapp" className="form-input" type="tel" placeholder="+1 (555) 000-0000" /></div>
                </div>
                <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}><i className="fas fa-arrow-up" aria-hidden="true"></i> Join the AI Revolution</button>
              </form>
              <p style={{ fontSize: ".78rem", textAlign: "center", marginTop: 14 }}><i className="fas fa-lock" style={{ color: "var(--accent)" }} aria-hidden="true"></i> &nbsp;Your data is secure. No spam, ever.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header reveal">
            <div className="section-tag"><i className="fas fa-shield-alt" aria-hidden="true"></i> Future-Proof</div>
            <h2>Future Proof <span className="gradient-text">Your Career</span></h2>
            <p>The skills you learn today will be the most valuable assets you own tomorrow</p>
          </div>
          <div className="grid-3">
            {futureProof.map(([icon, title, copy, badges, color, background], index) => (
              <div className={`feature-card reveal reveal-delay-${(index % 3) + 1}`} key={title}>
                <div className="feat-icon-lg" style={{ background, color }}><i className={`fas ${icon}`} aria-hidden="true"></i></div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {badges.map(([label, badgeClass]) => <span className={`badge ${badgeClass}`} key={label}>{label}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="philosophy-section section">
        <div className="container">
          <div className="philosophy-wrap">
            <div className="reveal">
              <div className="section-tag"><i className="fas fa-lightbulb" aria-hidden="true"></i> Our Approach</div>
              <h2 style={{ marginTop: 14 }}>Our AI <span className="gradient-text">Philosophy</span></h2>
              <p style={{ margin: "14px 0 8px", fontSize: "1rem" }}>We believe AI education should be accessible, practical, and useful for real projects. Skillomate focuses on learning support, practice, and steady progress.</p>
              <div className="philosophy-list">
                {[
                  ["01", "Learn by Doing", "Lessons focus on practical exercises and projects that help you apply new concepts."],
                  ["02", "AI-Assisted Learning", "NEX AI can answer questions, explain concepts, and support your course journey."],
                  ["03", "Structured Progress", "Track lessons, course progress, certificates, and saved learning activity in your account."],
                  ["04", "Support When Needed", "Contact Skillomate support for account, access, billing, or technical questions."],
                ].map(([num, title, copy]) => (
                  <div className="philo-item" key={num}>
                    <div className="philo-num">{num}</div>
                    <div><h3>{title}</h3><p style={{ fontSize: ".85rem", margin: 0 }}>{copy}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="philosophy-visual reveal reveal-delay-2">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--accent-green))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: ".85rem" }}>N</div>
                <div>
                  <div style={{ fontSize: ".85rem", fontWeight: 700 }}>NEX AI Tutor</div>
                  <div style={{ fontSize: ".72rem", color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, background: "var(--accent-green)", borderRadius: "50%", display: "inline-block" }}></span> Online</div>
                </div>
              </div>
              <div className="philo-chat-bubble ai"><div className="bubble-label">NEX AI</div><p>Hi! I'm NEX, your personal AI tutor. What would you like to learn today?</p></div>
              <div className="philo-chat-bubble user"><div className="bubble-label">You</div><p>How can I start making money with AI this week?</p></div>
              <div className="philo-chat-bubble ai"><div className="bubble-label">NEX AI</div><p>Great question! The fastest path is AI content writing. You can offer this service on Fiverr or Upwork starting today. Module 3 of our AI Income course covers exactly how to land your first $100 client. Want me to walk you through it?</p></div>
              <div style={{ marginTop: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" placeholder="Ask NEX anything..." aria-label="Ask NEX anything" style={{ flex: 1, background: "none", border: "none", color: "var(--text-primary)", fontSize: ".85rem", outline: "none" }} />
                <button onClick={() => { window.location.href = "ai-tutor.html"; }} className="btn btn-primary btn-sm" type="button" aria-label="Open AI Tutor" style={{ padding: "6px 14px", borderRadius: 8 }}><i className="fas fa-paper-plane" aria-hidden="true"></i></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="mentors">
        <div className="container">
          <div className="section-header reveal">
            <div className="section-tag"><i className="fas fa-user-tie" aria-hidden="true"></i> Mentors</div>
            <h2>Master Course <span className="gradient-text">&amp; Mentors</span></h2>
            <p>Learn from real AI practitioners who've built successful businesses and income streams</p>
          </div>
          <div className="grid-4">
            {mentors.map(([name, role, copy, socials, alt], index) => (
              <div className={`mentor-card reveal reveal-delay-${index + 1}`} key={`${role}-${index}`}>
                <img className="mentor-image" src={mentorImage} alt={alt} />
                <div className="mentor-info">
                  <h3>{name}</h3>
                  <div className="role">{role}</div>
                  <p>{copy}</p>
                  <div className="mentor-socials">{socials.map((icon) => <DisabledSocial icon={icon} key={icon} />)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="orb orb-teal orb-1"></div>
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div className="section-tag" style={{ display: "inline-flex", marginBottom: 20 }}><i className="fas fa-fire" aria-hidden="true"></i> Limited Spots</div>
          <h2 className="reveal">Ready to Master the<br /><span className="gradient-text">AI Economy?</span></h2>
          <p className="reveal reveal-delay-1">The best time to learn AI was 2 years ago. The second best time is right now. Don't wait any longer.</p>
          <div className="cta-badge-row reveal reveal-delay-2">
            <span className="badge badge-teal"><i className="fas fa-check" aria-hidden="true"></i> Digital course access</span>
            <span className="badge badge-green"><i className="fas fa-check" aria-hidden="true"></i> Learn at your pace</span>
            <span className="badge badge-purple"><i className="fas fa-check" aria-hidden="true"></i> Cancel anytime</span>
          </div>
          <div className="reveal reveal-delay-3">
            <a href="login.html" className="btn btn-primary btn-xl">START FIRST MONTH FOR ₹1 <i className="fas fa-arrow-right" aria-hidden="true"></i></a>
          </div>
          <p className="reveal" style={{ marginTop: 14, fontSize: ".82rem", color: "var(--text-muted)" }}>Then ₹499/month until cancelled. Results depend on your effort and circumstances.</p>
        </div>
      </section>
    </div>
  );
}
