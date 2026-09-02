/* EduNex — Main JavaScript */

/* ===== Navbar scroll ===== */
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });
}

/* ===== Mobile nav ===== */
const hamburger = document.querySelector('.nav-hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open);
    hamburger.querySelectorAll('span')[0].style.transform = open ? 'rotate(45deg) translate(5px,5px)' : '';
    hamburger.querySelectorAll('span')[1].style.opacity = open ? '0' : '1';
    hamburger.querySelectorAll('span')[2].style.transform = open ? 'rotate(-45deg) translate(5px,-5px)' : '';
  });
  document.addEventListener('click', e => {
    if (!navbar.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
    }
  });
}

/* ===== Scroll reveal ===== */
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach(el => observer.observe(el));
}

/* ===== Counter animation ===== */
function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const duration = 1800;
  const start = performance.now();
  const update = now => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val = target % 1 === 0 ? Math.floor(ease * target) : (ease * target).toFixed(1);
    el.textContent = prefix + val + suffix;
    if (p < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const counters = document.querySelectorAll('[data-target]');
if (counters.length) {
  const cObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.animated) {
        e.target.dataset.animated = '1';
        animateCounter(e.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(el => cObs.observe(el));
}

/* ===== Auth tabs ===== */
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    authForms.forEach(f => f.classList.add('hidden'));
    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.target);
    if (target) target.classList.remove('hidden');
  });
});

/* ===== OTP inputs ===== */
const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, i) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    if (input.value && i < otpInputs.length - 1) otpInputs[i + 1].focus();
    if (input.value) input.classList.add('filled');
    else input.classList.remove('filled');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !input.value && i > 0) otpInputs[i - 1].focus();
  });
  input.addEventListener('paste', e => {
    const data = e.clipboardData.getData('text').replace(/\D/g, '');
    data.split('').forEach((d, j) => {
      if (otpInputs[i + j]) { otpInputs[i + j].value = d; otpInputs[i + j].classList.add('filled'); }
    });
    e.preventDefault();
  });
});

/* ===== Password toggle ===== */
document.querySelectorAll('.toggle-password').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.input-icon-wrap').querySelector('input');
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      input.type = 'password';
      btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
    window.EduNex?.refreshIcons?.(btn);
  });
});

/* ===== Chat textarea auto-resize ===== */
const chatTextarea = document.querySelector('.chat-input-wrap textarea');
if (chatTextarea) {
  chatTextarea.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  chatTextarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

/* ===== Send chat message ===== */
async function sendMessage() {
  const textarea = document.querySelector('.chat-input-wrap textarea');
  if (!textarea || !textarea.value.trim()) return;
  const messages = document.querySelector('.chat-messages');
  if (!messages) return;
  const text = textarea.value.trim();
  textarea.value = '';
  textarea.style.height = 'auto';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble user';
  bubble.innerHTML = `
    <div class="bub-content">
      <p>${text.replace(/</g, '&lt;')}</p>
      <div class="bub-time">Just now</div>
    </div>
    <div class="bub-avatar">Y</div>`;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;

  let replyText = "Great question! I'm NEX, your AI learning assistant. Let me help you with that...";
  const courseId = new URLSearchParams(window.location.search).get('courseId');
  if (window.EduNex && courseId) {
    try {
      const existing = Array.from(messages.querySelectorAll('.chat-bubble')).map(node => ({
        role: node.classList.contains('user') ? 'user' : 'assistant',
        content: node.querySelector('p')?.textContent || ''
      })).filter(item => item.content);
      await EduNex.authRequest('/api/ai-tutor', {
        method: 'POST',
        body: JSON.stringify({
          course: courseId,
          messages: existing
        })
      });
      replyText = 'Saved this question to your course tutor thread. Your mentor can continue from this context.';
    } catch (error) {
      replyText = error.message || replyText;
    }
  }

  setTimeout(() => {
    const reply = document.createElement('div');
    reply.className = 'chat-bubble ai';
    reply.innerHTML = `
      <div class="bub-avatar">N</div>
      <div class="bub-content">
        <p>${replyText.replace(/</g, '&lt;')}</p>
        <div class="bub-time">Just now</div>
      </div>`;
    messages.appendChild(reply);
    messages.scrollTop = messages.scrollHeight;
  }, 500);
}

/* ===== Quick prompts ===== */
document.querySelectorAll('.quick-prompt').forEach(btn => {
  btn.addEventListener('click', () => {
    const ta = document.querySelector('.chat-input-wrap textarea');
    if (ta) { ta.value = btn.textContent.trim(); ta.focus(); }
  });
});

/* ===== Progress bars animate ===== */
document.querySelectorAll('.progress-fill').forEach(bar => {
  const pObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        bar.style.width = bar.dataset.width || '0%';
        pObs.unobserve(bar);
      }
    });
  }, { threshold: 0.5 });
  pObs.observe(bar);
});

/* ===== Smooth link active state ===== */
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
  if (link.getAttribute('href') === currentPath) link.classList.add('active');
});

/* ===== Profile nav active ===== */
document.querySelectorAll('.profile-nav a').forEach(link => {
  link.addEventListener('click', e => {
    document.querySelectorAll('.profile-nav a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});

/* ===== Curriculum item active ===== */
document.querySelectorAll('.curriculum-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.curriculum-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

/* ===== Toast notification ===== */
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 22px;background:${type === 'success' ? '#1F170D' : '#1B0F0F'};border:1px solid ${type === 'success' ? 'rgba(197,139,42,.42)' : 'rgba(239,68,68,.4)'};border-radius:12px;color:${type === 'success' ? '#DAB77A' : '#F87171'};font-size:.875rem;font-weight:600;backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(0,0,0,.4);animation:slideUp .3s ease;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .4s'; setTimeout(() => toast.remove(), 400); }, 3200);
}
