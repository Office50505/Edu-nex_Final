/* ===================================================
   EduNex — Animation Engine  v1.0
   =================================================== */
(function () {
  'use strict';

  /* ────────────────────────────────────────────────
     1. SCROLL PROGRESS BAR
  ──────────────────────────────────────────────── */
  const bar = document.createElement('div');
  bar.id = 'enx-scroll-bar';
  document.body.prepend(bar);

  window.addEventListener('scroll', function () {
    const scrolled = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    bar.style.width = Math.min(scrolled * 100, 100) + '%';
  }, { passive: true });

  /* ────────────────────────────────────────────────
     2. INTERSECTION OBSERVER — SCROLL REVEALS
  ──────────────────────────────────────────────── */
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -55px 0px' });

  function watchReveal(el) { revealObserver.observe(el); }
  document.querySelectorAll('.reveal').forEach(watchReveal);

  /* ────────────────────────────────────────────────
     3. AUTO-STAGGER GRID CHILDREN
  ──────────────────────────────────────────────── */
  var staggerSelectors = [
    '.courses-grid',
    '.categories-grid',
    '.steps-grid',
    '.promo-grid',
    '.teacher-grid',
    '.footer-grid',
    '.cat-grid',
    '.category-section .courses-grid'
  ];

  staggerSelectors.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (grid) {
      Array.from(grid.children).forEach(function (child, i) {
        if (child.classList.contains('reveal')) return;
        child.classList.add('reveal', 'from-bottom');
        child.style.transitionDelay = (i * 0.09) + 's';
        watchReveal(child);
      });
    });
  });

  /* ────────────────────────────────────────────────
     4. SECTION HEADING REVEALS
  ──────────────────────────────────────────────── */
  document.querySelectorAll(
    '.section-title-center, .section-header h2, .section-header-left h2, ' +
    '.courses-header h2, .category-header h2, .promo-title, .footer-col h4'
  ).forEach(function (el) {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal', 'from-bottom');
    watchReveal(el);
  });

  document.querySelectorAll(
    '.section-header p, .section-header-left p, .section-header-center p'
  ).forEach(function (el) {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal', 'from-bottom', 'd2');
    watchReveal(el);
  });

  /* ────────────────────────────────────────────────
     5. COUNTER ANIMATION
  ──────────────────────────────────────────────── */
  function animateCount(el) {
    var raw     = el.dataset.count;
    var suffix  = el.dataset.suffix || '';
    var target  = parseFloat(raw);
    var isFloat = raw.indexOf('.') !== -1;
    var dur     = 2000;
    var t0      = performance.now();

    (function tick(now) {
      var pct    = Math.min((now - t0) / dur, 1);
      var eased  = 1 - Math.pow(1 - pct, 3);
      var cur    = eased * target;
      el.textContent = (isFloat ? cur.toFixed(1) : Math.floor(cur).toLocaleString()) + suffix;
      if (pct < 1) requestAnimationFrame(tick);
    })(t0);
  }

  var counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = '1';
        animateCount(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(function (el) {
    counterObserver.observe(el);
  });

  /* ────────────────────────────────────────────────
     6. BUTTON RIPPLE EFFECT
  ──────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-cyan, .btn-trial, .btn-ripple, .filter-tab, .cert-tab');
    if (!btn) return;
    var rect   = btn.getBoundingClientRect();
    var wave   = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.left = (e.clientX - rect.left) + 'px';
    wave.style.top  = (e.clientY - rect.top)  + 'px';
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(wave);
    wave.addEventListener('animationend', function () { wave.remove(); });
  });

  /* ────────────────────────────────────────────────
     7. CARD HOVER TILT
  ──────────────────────────────────────────────── */
  if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.course-card, .cat-card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width  - 0.5;
        var y = (e.clientY - rect.top)  / rect.height - 0.5;
        card.style.transform = 'perspective(700px) rotateY(' + (x * 7) + 'deg) rotateX(' + (-y * 7) + 'deg) scale(1.025)';
        card.style.boxShadow = '0 20px 48px rgba(197,139,42,.18)';
        card.style.borderColor = 'rgba(197,139,42,.35)';
        card.style.zIndex = '2';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.borderColor = '';
        card.style.zIndex = '';
      });
    });
  }

  /* ────────────────────────────────────────────────
     8. HERO PARALLAX + FLOAT (combined)
  ──────────────────────────────────────────────── */
  var heroRight = document.querySelector('.hero-right');
  if (heroRight && window.matchMedia('(pointer: fine)').matches) {
    var txTarget = 0, tyTarget = 0, txCur = 0, tyCur = 0, phase = 0;

    document.addEventListener('mousemove', function (e) {
      txTarget = (e.clientX / window.innerWidth  - 0.5) * 20;
      tyTarget = (e.clientY / window.innerHeight - 0.5) * 11;
    }, { passive: true });

    (function animHero() {
      phase += 0.018;
      txCur += (txTarget - txCur) * 0.06;
      tyCur += (tyTarget - tyCur) * 0.06;
      var floatY = Math.sin(phase) * 9;
      heroRight.style.transform = 'translate(' + txCur + 'px,' + (tyCur + floatY) + 'px)';
      requestAnimationFrame(animHero);
    })();
  }

  /* ────────────────────────────────────────────────
     9. NAVBAR SMART HIDE ON SCROLL
  ──────────────────────────────────────────────── */
  var navbar = document.querySelector('.navbar');
  if (navbar) {
    var lastY = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > lastY && y > 180) {
        navbar.style.transform = 'translateY(-110%)';
      } else {
        navbar.style.transform = 'translateY(0)';
      }
      lastY = y;
    }, { passive: true });
  }

  /* ────────────────────────────────────────────────
     10. PROGRESS BAR ANIMATION (dashboard/profile)
  ──────────────────────────────────────────────── */
  var progressObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var b = entry.target;
        var target = b.dataset.width || b.style.width || '0%';
        b.style.width = '0%';
        requestAnimationFrame(function () {
          b.style.transition = 'width 1.3s cubic-bezier(.4,0,.2,1) .15s';
          b.style.width = target;
        });
        progressObserver.unobserve(b);
      }
    });
  }, { threshold: 0.4 });

  document.querySelectorAll('.progress-fill, .ep-progress-fill').forEach(function (b) {
    b.dataset.width = b.style.width || '0%';
    progressObserver.observe(b);
  });

  /* ────────────────────────────────────────────────
     11. PARTICLE SYSTEM (hero only)
  ──────────────────────────────────────────────── */
  var heroSection = document.querySelector('.hero-section');
  if (heroSection) {
    var canvas = document.createElement('canvas');
    canvas.id = 'enx-particles';
    heroSection.prepend(canvas);

    var ctx  = canvas.getContext('2d');
    var COUNT = window.innerWidth < 768 ? 22 : 55;
    var w, h, parts = [];

    function sizeCanvas() {
      w = canvas.width  = heroSection.offsetWidth;
      h = canvas.height = heroSection.offsetHeight;
    }
    sizeCanvas();

    var ro = new ResizeObserver(sizeCanvas);
    ro.observe(heroSection);

    var CYAN = '0,229,255';

    function mkParticle() {
      return {
        x : Math.random() * w,
        y : Math.random() * h,
        r : Math.random() * 1.4 + 0.4,
        vx: (Math.random() - 0.5) * 0.38,
        vy: (Math.random() - 0.5) * 0.38,
        a : Math.random() * 0.45 + 0.08,
        da: (Math.random() - 0.5) * 0.004
      };
    }

    for (var i = 0; i < COUNT; i++) parts.push(mkParticle());

    function drawParticles() {
      ctx.clearRect(0, 0, w, h);

      /* connections */
      for (var a = 0; a < parts.length; a++) {
        for (var b = a + 1; b < parts.length; b++) {
          var dx = parts[a].x - parts[b].x;
          var dy = parts[a].y - parts[b].y;
          var d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(parts[a].x, parts[a].y);
            ctx.lineTo(parts[b].x, parts[b].y);
            ctx.strokeStyle = 'rgba(' + CYAN + ',' + (0.10 * (1 - d / 110)) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      /* dots */
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy;
        p.a += p.da;
        if (p.a > 0.55 || p.a < 0.06) p.da *= -1;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          Object.assign(p, mkParticle());
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + CYAN + ',' + p.a + ')';
        ctx.fill();
      });

      requestAnimationFrame(drawParticles);
    }
    drawParticles();
  }

  /* ────────────────────────────────────────────────
     12. SMOOTH ACTIVE NAV LINK HIGHLIGHT
  ──────────────────────────────────────────────── */
  var sections = document.querySelectorAll('section[id]');
  if (sections.length) {
    var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
          });
        }
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    sections.forEach(function (s) { sectionObserver.observe(s); });
  }

  /* ────────────────────────────────────────────────
     13. SEARCH BAR FOCUS GLOW (courses page)
  ──────────────────────────────────────────────── */
  var searchInput = document.querySelector('.search-input, .course-search-input');
  if (searchInput) {
    var searchWrap = searchInput.closest('.search-bar, .search-wrap') || searchInput.parentElement;
    searchInput.addEventListener('focus', function () {
      searchWrap.style.boxShadow = '0 0 0 2px rgba(197,139,42,.4), 0 0 24px rgba(197,139,42,.15)';
      searchWrap.style.transition = 'box-shadow .3s ease';
    });
    searchInput.addEventListener('blur', function () {
      searchWrap.style.boxShadow = '';
    });
  }

  /* ────────────────────────────────────────────────
     14. FILTER PILL ACTIVE INDICATOR SLIDE
  ──────────────────────────────────────────────── */
  document.querySelectorAll('.filter-bar, .course-filter-bar').forEach(function (bar) {
    bar.addEventListener('click', function (e) {
      var tab = e.target.closest('.filter-tab');
      if (!tab) return;
      bar.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
    });
  });

  /* done */
})();
