import { useEffect, useState } from "react";
import { page as aboutPage } from "../generated-pages/about.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

export function AboutPage() {
  const [imageFallback, setImageFallback] = useState(false);

  usePageStyle("react-page-style-about", aboutPage.styles);

  useEffect(() => {
    document.title = aboutPage.title;
    document.documentElement.lang = aboutPage.lang || "en";

    const cleanup = runLegacyPage(aboutPage);
    return () => cleanup?.();
  }, []);

  return (
    <div className="react-page-root" data-page="about.html">
      <main className="about-page">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow">About EduNex</div>
              <h1 className="hero-title">Learning should lead <span>somewhere.</span></h1>
              <p className="hero-copy">EduNex was built to make practical, career-relevant skills easier to learn through short expert-led lessons, structured learning paths and real-world application.</p>
              <div className="hero-tagline"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Learn with AI. Earn with AI.</div>
            </div>
            <figure className={`hero-image${imageFallback ? " is-fallback" : ""}`} aria-label="EduNex learners studying together">
              <img className="hero-photo-main" src="assets/about-hero.png" alt="EduNex learners studying together" onError={() => setImageFallback(true)} />
              <div className="hero-photo-row hero-photo-fallback">
                <img src="assets/male2.jpeg" alt="EduNex learner" />
                <img src="assets/female2.jpeg" alt="EduNex learner" />
                <img src="assets/male3.jpeg" alt="EduNex learner" />
              </div>
            </figure>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <div className="section-kicker">Our Mission</div>
              <h2 className="section-title">Practical education for<br />the opportunities of today.</h2>
              <p className="section-copy">Traditional learning often takes too long to adapt to fast-changing industries. EduNex focuses on skills people can actually use, from AI and content creation to freelancing, business, marketing and technology.</p>
            </div>
            <div className="mission-grid">
              <div className="mission-item">
                <div className="icon-box"><i className="fa-solid fa-bolt" aria-hidden="true"></i></div>
                <h3>Practical first</h3>
                <p>Learn skills you can use immediately.</p>
              </div>
              <div className="mission-item">
                <div className="icon-box"><i className="fa-regular fa-circle-play" aria-hidden="true"></i></div>
                <h3>Short and focused</h3>
                <p>Learn through concise vertical lessons.</p>
              </div>
              <div className="mission-item">
                <div className="icon-box"><i className="fa-regular fa-user" aria-hidden="true"></i></div>
                <h3>Expert-led</h3>
                <p>Courses taught by people with real experience.</p>
              </div>
              <div className="mission-item">
                <div className="icon-box"><i className="fa-solid fa-bullseye" aria-hidden="true"></i></div>
                <h3>Outcome-driven</h3>
                <p>Build skills, projects and confidence.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="container">
            <div className="section-head">
              <div className="section-kicker">Why EduNex Is Different</div>
              <h2 className="section-title">Designed for real learning and real progress.</h2>
            </div>
            <div className="paper-grid">
              <div className="paper-card">
                <div className="icon-box"><i className="fa-solid fa-mobile-screen-button" aria-hidden="true"></i></div>
                <h3>Short Lessons</h3>
                <p>Bite-sized vertical lessons that respect your time and keep you focused.</p>
              </div>
              <div className="paper-card">
                <div className="icon-box"><i className="fa-regular fa-map" aria-hidden="true"></i></div>
                <h3>Learning Paths</h3>
                <p>Structured paths that guide you from basics to advanced skills.</p>
              </div>
              <div className="paper-card">
                <div className="icon-box"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></div>
                <h3>Nex AI Support</h3>
                <p>Get explanations, summaries, quizzes and course guidance powered by AI.</p>
              </div>
              <div className="paper-card">
                <div className="icon-box"><i className="fa-regular fa-id-badge" aria-hidden="true"></i></div>
                <h3>Certificates &amp; Progress</h3>
                <p>Track your progress and earn certificates to showcase new skills.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <div className="section-kicker">The EduNex Learning Journey</div>
              <h2 className="section-title">Your journey from learning to opportunity.</h2>
            </div>
            <div className="journey">
              <div className="journey-step">
                <div className="icon-box"><i className="fa-regular fa-compass" aria-hidden="true"></i></div>
                <h3>Discover</h3>
                <p>Choose a course or learning path that matches your goals.</p>
              </div>
              <div className="journey-step">
                <div className="icon-box"><i className="fa-regular fa-book-open" aria-hidden="true"></i></div>
                <h3>Learn</h3>
                <p>Watch short vertical expert-led lessons at your pace.</p>
              </div>
              <div className="journey-step">
                <div className="icon-box"><i className="fa-solid fa-code" aria-hidden="true"></i></div>
                <h3>Practice</h3>
                <p>Apply concepts through tasks and real-world projects.</p>
              </div>
              <div className="journey-step">
                <div className="icon-box"><i className="fa-solid fa-award" aria-hidden="true"></i></div>
                <h3>Complete</h3>
                <p>Track progress, clear assessments and earn certificates.</p>
              </div>
              <div className="journey-step">
                <div className="icon-box"><i className="fa-solid fa-arrow-up" aria-hidden="true"></i></div>
                <h3>Earn</h3>
                <p>Use your skills in work, freelancing, content or business.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container philosophy">
            <figure className="book-stack">
              <img src="assets/about-philosophy.png" alt="Practical learning notebook and certificate" />
            </figure>
            <div>
              <div className="section-kicker">Our Philosophy</div>
              <h2 className="section-title">We believe education should be useful before it is impressive.</h2>
            </div>
            <p className="philosophy-copy">Every EduNex course is designed around one question: "What should the learner be able to do after finishing this?" That principle guides our lessons, learning paths, assessments and AI support.</p>
          </div>
        </section>

        <section className="container final-cta">
          <div>
            <h2>Your next skill could<br />change what comes next.</h2>
            <p>Start exploring practical courses designed for real-world progress.</p>
          </div>
          <div className="cta-actions">
            <a href="courses.html" className="primary-btn"><i className="fa-solid fa-bolt" aria-hidden="true"></i> Explore Courses</a>
            <a href="payment.html" className="secondary-btn">Start ₹1 Trial</a>
          </div>
        </section>
      </main>
    </div>
  );
}
