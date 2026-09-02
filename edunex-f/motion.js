(function () {
  const root = document.documentElement;
  const body = document.body;

  const injectAuthNavStyles = () => {
    if (document.getElementById('edunex-auth-nav-styles')) return;

    const style = document.createElement('style');
    style.id = 'edunex-auth-nav-styles';
    style.textContent = `
      .auth-user-chip {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 7px 8px 7px 14px;
        border-radius: 999px;
        background: rgba(53,156,87,.09);
        border: 1px solid rgba(53,156,87,.16);
        color: #256b3e;
        text-decoration: none;
        font-family: "Manrope", ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        font-weight: 800;
        white-space: nowrap;
        transition: transform .2s ease, background .2s ease, border-color .2s ease;
      }
      .auth-user-chip:hover {
        transform: translateY(-1px);
        background: rgba(53,156,87,.13);
        border-color: rgba(53,156,87,.26);
      }
      .auth-user-chip .auth-user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #359c57, #256b3e);
        color: #fff;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0;
        overflow: hidden;
      }
      .auth-user-chip .auth-user-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .auth-user-mobile-link {
        display: flex !important;
        align-items: center;
        gap: 10px;
      }
      @media (max-width: 420px) {
        .auth-user-chip .auth-user-greeting { display: none; }
        .auth-user-chip { padding: 6px; min-height: 40px; }
      }
    `;
    document.head.appendChild(style);
  };

  const readAuthState = () => {
    const token = localStorage.getItem('edunexAccessToken') || sessionStorage.getItem('edunexAccessToken');
    if (!token) return null;

    const rawUser = localStorage.getItem('edunexUser') || sessionStorage.getItem('edunexUser');
    let user = {};
    try {
      user = rawUser ? JSON.parse(rawUser) : {};
    } catch (_) {
      user = {};
    }

    const displayName = user.fullName || user.name || user.email || user.mobileNumber || 'Learner';
    const firstName = String(displayName).trim().split(/\s+/)[0] || 'Learner';
    const initials = String(displayName)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'E';

    return {
      firstName,
      initials,
      photoUrl: user.photoUrl || user.photoURL || user.avatarUrl || ''
    };
  };

  const buildAuthChip = (auth) => {
    const chip = document.createElement('a');
    chip.className = 'auth-user-chip';
    chip.href = '/courses.html';
    chip.setAttribute('aria-label', `Signed in as ${auth.firstName}`);

    const greeting = document.createElement('span');
    greeting.className = 'auth-user-greeting';
    greeting.textContent = `Hi, ${auth.firstName}`;

    const avatar = document.createElement('span');
    avatar.className = 'auth-user-avatar';

    if (auth.photoUrl) {
      const img = document.createElement('img');
      img.src = auth.photoUrl;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = auth.initials;
    }

    chip.append(greeting, avatar);
    return chip;
  };

  const enhanceAuthNav = () => {
    const auth = readAuthState();
    const placeholderAvatars = document.querySelectorAll('.nav-avatar');

    if (!auth) {
      placeholderAvatars.forEach((avatar) => {
        avatar.style.display = 'none';
      });
      return;
    }

    injectAuthNavStyles();

    document.querySelectorAll('.nav-avatar').forEach((avatar) => {
      avatar.remove();
    });

    const desktopLoginLinks = Array.from(document.querySelectorAll('nav a.btn-login[href*="/login.html"], nav .nav-actions a[href*="/login.html"]'));
    desktopLoginLinks.forEach((link) => {
      link.replaceWith(buildAuthChip(auth));
    });

    const mobileLoginLinks = Array.from(document.querySelectorAll('.mobile-menu a[href*="/login.html"], .mobile-nav a[href*="/login.html"]'));
    mobileLoginLinks.forEach((link) => {
      link.href = '/courses.html';
      link.classList.add('auth-user-mobile-link');
      link.textContent = `Hi, ${auth.firstName}`;
    });
  };

  enhanceAuthNav();

  if (!body || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    body?.classList.add('motion-ready');
    return;
  }

  body.classList.add('motion-ready');
  root.style.setProperty('--motion-primary-rgb', '53,156,87');

  const nav = document.querySelector('nav, .nav');
  const syncNav = () => {
    if (!nav) return;
    nav.classList.toggle('motion-scrolled', window.scrollY > 12);
  };
  syncNav();
  window.addEventListener('scroll', syncNav, { passive: true });

  const revealSelector = [
    '.hero-left',
    '.hero-right',
    '.stats-card',
    '.feature-card',
    '.section-header',
    '.rec-card',
    '.bs-content',
    '.bs-visual',
    '.course-card',
    '.cat-card',
    '.review-card',
    '.cta-inner',
    '.app-inner',
    '.app-dl-card',
    '.about-text',
    '.about-illustration',
    '.contact-form',
    '.help-card',
    '.contact-inner',
    '.course-hero',
    '.course-summary',
    '.course-preview-card',
    '.course-outcomes',
    '.related-card',
    '.login-card',
    '.signup-card',
    '.payment-card',
    '.admin-card'
  ].join(',');

  const revealItems = Array.from(document.querySelectorAll(revealSelector));
  revealItems.forEach((el, index) => {
    if (!el.classList.contains('reveal') && !el.classList.contains('reveal-left') && !el.classList.contains('reveal-right')) {
      el.classList.add('motion-reveal');
    }
    el.style.setProperty('--motion-delay', `${Math.min(index % 6, 5) * 95}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible', 'visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

  revealItems.forEach((el) => observer.observe(el));

  const tiltSelector = [
    '.feature-card',
    '.rec-card',
    '.course-card',
    '.cat-card',
    '.review-card',
    '.app-dl-card',
    '.related-card',
    '.help-card',
    '.login-card',
    '.signup-card'
  ].join(',');

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canHover) {
    document.querySelectorAll(tiltSelector).forEach((card) => {
      card.classList.add('motion-tilt');
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.removeProperty('--tilt-x');
        card.style.removeProperty('--tilt-y');
      });
    });
  }

  const animateNumber = (el) => {
    if (el.dataset.motionCounted === 'true') return;
    const original = el.textContent.trim();
    const match = original.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (!match) return;

    el.dataset.motionCounted = 'true';
    el.classList.add('motion-counting');

    const prefix = match[1];
    const numberText = match[2];
    const suffix = match[3];
    const target = Number(numberText.replace(/,/g, ''));
    if (!Number.isFinite(target)) return;

    const decimals = numberText.includes('.') ? numberText.split('.')[1].length : 0;
    const duration = 2200;
    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      const formatted = decimals
        ? current.toFixed(decimals)
        : Math.round(current).toLocaleString('en-IN');

      el.textContent = `${prefix}${formatted}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = original;
        el.classList.remove('motion-counting');
      }
    };

    requestAnimationFrame(tick);
  };

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateNumber(entry.target);
      statObserver.unobserve(entry.target);
    });
  }, { threshold: 0.7 });

  document.querySelectorAll('.stat-number').forEach((el) => statObserver.observe(el));
})();
