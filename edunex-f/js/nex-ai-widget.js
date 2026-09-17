(function () {
  'use strict';
  if (document.getElementById('nex-ai-widget-root')) return;

  const storedUser = window.EduNex?.getUser?.() || null;
  const learnerName = (storedUser?.fullName || storedUser?.email || storedUser?.mobileNumber || 'there').split(/\s+/)[0];
  const learnerAvatar = storedUser?.avatar || window.EduNex?.avatarFallback?.(storedUser) || '';
  const botOwner = String(storedUser?._id || storedUser?.id || 'guest');
  const botNameStorageKey = `edunexAiBotName:${botOwner}`;
  const botAvatarStorageKey = `edunexAiBotAvatar:${botOwner}`;
  const botSetupStorageKey = `edunexAiBotSetupComplete:${botOwner}`;
  const savedBotName = localStorage.getItem(botNameStorageKey) || 'AI';
  const savedBotAvatar = localStorage.getItem(botAvatarStorageKey) || 'nex';
  const aiSetupComplete = localStorage.getItem(botSetupStorageKey) === 'true';
  const botAvatarMarkup = `<img class="nai-bot-avatar-img" src="/assets/nex-avatar.png" alt="">`;
  const escAttr = (value) => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hasAiAccess = () => Boolean(
    window.EduNex?.getAccessToken?.()
    || localStorage.getItem('edunexAccessToken')
    || sessionStorage.getItem('edunexAccessToken')
  );
  const returnToCurrentPage = () => encodeURIComponent(window.location.pathname + window.location.search);
  const loginUrl = () => `/login.html?next=${returnToCurrentPage()}`;
  const signupUrl = () => `/signup.html?next=${returnToCurrentPage()}`;
  function hideAiLoginPrompt() {
    const prompt = document.getElementById('nai-auth-prompt');
    if (!prompt) return;
    prompt.classList.remove('is-visible');
    prompt.setAttribute('aria-hidden', 'true');
    (lastAiTrigger || document.getElementById('nai-float-btn'))?.focus?.();
  }
  function showAiLoginPrompt(container = null) {
    const target = container || document.fullscreenElement || document.body;
    let prompt = document.getElementById('nai-auth-prompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = 'nai-auth-prompt';
      prompt.setAttribute('aria-hidden', 'true');
      prompt.innerHTML = `
        <div class="nai-auth-card" role="dialog" aria-modal="true" aria-labelledby="nai-auth-title">
          <button class="nai-auth-close" type="button" aria-label="Close">&times;</button>
          <div class="nai-auth-icon"><i class="fas fa-bolt"></i></div>
          <h3 id="nai-auth-title">Login or sign up to use Nex AI</h3>
          <p>Nex AI is available after you create an Skillomate account or log in.</p>
          <div class="nai-auth-actions">
            <a class="nai-auth-primary" href="${loginUrl()}">Login</a>
            <a class="nai-auth-secondary" href="${signupUrl()}">Sign up</a>
          </div>
        </div>
      `;
      target.appendChild(prompt);
      prompt.addEventListener('click', (event) => {
        if (event.target.closest('.nai-auth-actions a')) {
          hideAiLoginPrompt();
          return;
        }
        if (event.target === prompt || event.target.closest('.nai-auth-close')) {
          hideAiLoginPrompt();
        }
      });
    } else {
      prompt.querySelector('.nai-auth-primary')?.setAttribute('href', loginUrl());
      prompt.querySelector('.nai-auth-secondary')?.setAttribute('href', signupUrl());
      if (prompt.parentElement !== target) target.appendChild(prompt);
    }
    prompt.classList.add('is-visible');
    prompt.setAttribute('aria-hidden', 'false');
    setTimeout(() => prompt.querySelector('.nai-auth-close')?.focus?.(), 0);
  }
  function requireAiAccess(container = null) {
    if (hasAiAccess()) return true;
    showAiLoginPrompt(container);
    return false;
  }

  /* ═══════════════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════════════ */
  const CSS = `
    /* ── FLOAT BUTTON ── */
    #nai-float-btn {
      all: unset;
      position: fixed;
      top: auto;
      bottom: calc(28px + env(safe-area-inset-bottom, 0px));
      right: calc(28px + env(safe-area-inset-right, 0px));
      left: auto;
      z-index: 9990;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 13px 20px 13px 16px;
      background: #C58B2A;
      border-radius: 14px;
      cursor: pointer;
      color: #FFFDF8;
      font-family: "Manrope", -apple-system, ui-sans-serif, system-ui, sans-serif;
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      box-shadow: 0 4px 24px rgba(88,65,34,0.16);
      transition: transform 0.2s, box-shadow 0.2s;
      animation: naipulse 2.8s ease-in-out infinite;
      user-select: none;
      -webkit-user-select: none;
    }
    #nai-float-btn i { font-size: 1rem; }
    #nai-float-btn .nai-float-mobile-label { display: none; }
    #nai-float-btn:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 36px rgba(88,65,34,0.22);
    }
    #nai-float-btn.nai-btn-open {
      background: #A96F18;
      color: #FFFDF8;
      border: 1px solid #DAB77A;
      box-shadow: 0 4px 20px rgba(88,65,34,0.18);
      animation: none;
    }
    @keyframes naipulse {
      0%,100% { box-shadow: 0 4px 24px rgba(88,65,34,0.16), 0 0 0 0 rgba(197,139,42,0.26); }
      60%      { box-shadow: 0 4px 24px rgba(88,65,34,0.16), 0 0 0 14px rgba(197,139,42,0); }
    }

    /* ── OVERLAY ── */
    #nai-overlay {
      position: fixed;
      inset: 0;
      z-index: 9991;
      background: rgba(0,0,0,0.82);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 0.3s ease;
    }
    #nai-overlay.nai-open {
      opacity: 1;
      pointer-events: all;
      visibility: visible;
    }
    #nai-overlay[aria-hidden="true"] #nai-modal {
      visibility: hidden;
    }
    #nai-overlay.nai-open #nai-modal {
      visibility: visible;
    }

    /* ── MODAL ── */
    #nai-modal {
      width: 100%;
      max-width: 1060px;
      height: 84vh;
      max-height: 720px;
      background: #0e1118;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      display: flex;
      transform: scale(0.96) translateY(20px);
      transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1);
      box-shadow: 0 36px 120px rgba(0,0,0,0.85);
      font-family: "Manrope", -apple-system, ui-sans-serif, system-ui, sans-serif;
      box-sizing: border-box;
      position: relative;
    }
    #nai-overlay.nai-open #nai-modal {
      transform: scale(1) translateY(0);
    }

    /* ── SIDEBAR ── */
    #nai-sidebar {
      width: 300px;
      flex-shrink: 0;
      background: #131820;
      border-right: 1px solid rgba(255,255,255,0.06);
      display: flex;
      flex-direction: column;
      padding: 22px 16px 20px;
      overflow-y: auto;
      gap: 22px;
      box-sizing: border-box;
    }
    #nai-sidebar::-webkit-scrollbar { width: 3px; }
    #nai-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .nai-history-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
      list-style: none;
      cursor: pointer;
    }
    .nai-history-top::-webkit-details-marker { display: none; }
    .nai-history-title {
      margin: 0;
      color: #fff;
      font-size: .88rem;
      font-weight: 900;
    }
    .nai-history-chevron {
      color: #756A60;
      font-size: .72rem;
      transition: transform .18s ease;
    }
    .nai-history-panel[open] .nai-history-chevron { transform: rotate(180deg); }
    .nai-history-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-height: 80px;
    }
    .nai-history-empty {
      border: 1px dashed rgba(255,255,255,.12);
      border-radius: 12px;
      color: #756A60;
      font-size: .78rem;
      font-weight: 700;
      line-height: 1.45;
      padding: 13px;
    }
    .nai-history-item {
      all: unset;
      display: grid;
      gap: 4px;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.035);
      color: #d1d5db;
      cursor: pointer;
      min-width: 0;
      transition: border-color .18s, background .18s, color .18s;
    }
    .nai-history-item:hover,
    .nai-history-item.is-active {
      border-color: rgba(197,139,42,.38);
      background: rgba(197,139,42,.1);
      color: #fff;
    }
    .nai-history-item-title,
    .nai-history-item-meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .nai-history-item-title {
      font-size: .78rem;
      font-weight: 900;
    }
    .nai-history-item-meta {
      color: #756A60;
      font-size: .68rem;
      font-weight: 700;
    }

    /* Bot header */
    .nai-bot-hdr {
      display: flex;
      align-items: center;
      gap: 13px;
    }
    .nai-bot-icon {
      width: 46px; height: 46px;
      border-radius: 13px;
      background: #C58B2A;
      display: flex; align-items: center; justify-content: center;
      color: #FFFDF8; font-size: 1.1rem;
      flex-shrink: 0;
      overflow: hidden;
    }
    .nai-bot-name {
      font-size: 1rem; font-weight: 800; color: #fff;
      margin-bottom: 3px;
    }
    .nai-online {
      display: flex; align-items: center; gap: 5px;
      font-size: 0.73rem; font-weight: 600; color: #A96F18;
    }
    .nai-online-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #A96F18;
      box-shadow: 0 0 6px rgba(169,111,24,0.7);
    }

    /* Section label */
    .nai-sec-lbl {
      font-size: 0.6rem; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.12em;
      color: #756A60;
      margin-bottom: 10px;
    }

    /* Current focus */
    .nai-focus-card {
      background: rgba(197,139,42,0.07);
      border: 1px solid rgba(197,139,42,0.18);
      border-radius: 11px;
      padding: 11px 14px;
      font-size: 0.84rem; font-weight: 700;
      color: #C58B2A;
    }

    /* ── CHAT AREA ── */
    #nai-chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #0e1118;
      min-width: 0;
    }

    /* Chat header */
    #nai-chat-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .nai-session-title {
      font-size: 1.3rem; font-weight: 800; color: #fff;
      margin-bottom: 5px; line-height: 1;
    }
    .nai-connected {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.73rem; color: #9ca3af; font-weight: 500;
    }
    .nai-conn-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #C58B2A;
      box-shadow: 0 0 6px rgba(197,139,42,0.7);
      animation: naiconnpulse 1.8s ease-in-out infinite;
    }
    @keyframes naiconnpulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    .nai-hdr-actions { display: flex; gap: 6px; }
    .nai-hdr-btn {
      all: unset;
      min-height: 34px; border-radius: 9px;
      padding: 0 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      display: flex; align-items: center; justify-content: center; gap: 7px;
      color: #d1d5db; font-size: 0.78rem; font-weight: 800;
      cursor: pointer; transition: all 0.18s;
    }
    .nai-hdr-btn:hover { color: #fff; background: rgba(255,255,255,0.09); }
    .nai-bot-customizer {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .nai-bot-avatar-picker {
      all: unset;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 1px solid rgba(197,139,42,.22);
      background: rgba(197,139,42,.08);
      color: #C58B2A;
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;
    }
    .nai-bot-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
      transform: scale(1.14) translateY(2px);
    }
    #nai-bot-name-input {
      width: min(220px, 100%);
      min-height: 36px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.05);
      color: #fff;
      padding: 0 11px;
      font: inherit;
      font-size: .82rem;
      font-weight: 700;
      outline: none;
    }
    .nai-avatar-menu {
      position: absolute;
      top: 82px;
      left: 24px;
      z-index: 3;
      width: 290px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 14px;
      background: #332820;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      box-shadow: 0 18px 50px rgba(0,0,0,.45);
    }
    .nai-avatar-menu[hidden] { display: none; }
    .nai-avatar-choice {
      all: unset;
      aspect-ratio: 1;
      border-radius: 10px;
      overflow: hidden;
      border: 2px solid transparent;
      cursor: pointer;
      background: rgba(255,255,255,.06);
    }
    .nai-avatar-choice:hover { border-color: rgba(197,139,42,.42); }
    .nai-avatar-choice.is-selected { border-color: #C58B2A; box-shadow: 0 0 0 3px rgba(197,139,42,.14); }
    .nai-avatar-choice i,
    .nai-avatar-choice .enx-icon {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #DAB77A;
      font-size: 1.1rem;
    }

    .nai-setup-panel {
      position: absolute;
      inset: 0;
      z-index: 6;
      display: grid;
      place-items: center;
      padding: 22px;
      background: rgba(4,8,14,.86);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .nai-setup-panel[hidden] { display: none; }
    .nai-setup-card {
      width: min(520px, 100%);
      border: 1px solid rgba(197,139,42,.2);
      border-radius: 20px;
      background: #0e1118;
      box-shadow: 0 28px 80px rgba(0,0,0,.45);
      padding: 24px;
      color: #fff;
      box-sizing: border-box;
    }
    .nai-setup-kicker {
      font-size: .68rem;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #C58B2A;
      margin-bottom: 8px;
    }
    .nai-setup-card h3 {
      margin: 0 0 8px;
      font-size: 1.35rem;
      line-height: 1.2;
    }
    .nai-setup-card p {
      margin: 0 0 18px;
      color: #9ca3af;
      font-size: .9rem;
      line-height: 1.6;
    }
    .nai-setup-label {
      display: block;
      margin: 16px 0 8px;
      font-size: .76rem;
      font-weight: 900;
      color: #d1d5db;
    }
    #nai-setup-name {
      width: 100%;
      min-height: 44px;
      box-sizing: border-box;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.06);
      color: #fff;
      padding: 0 13px;
      font: inherit;
      font-size: .9rem;
      font-weight: 800;
      outline: none;
    }
    #nai-setup-name:focus { border-color: rgba(197,139,42,.48); }
    .nai-setup-avatars {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .nai-setup-avatars .nai-avatar-choice { border-color: rgba(255,255,255,.08); }
    .nai-setup-error {
      min-height: 18px;
      margin-top: 12px;
      color: #A96F18;
      font-size: .78rem;
      font-weight: 700;
    }
    .nai-setup-save {
      width: 100%;
      min-height: 46px;
      margin-top: 12px;
      border: 0;
      border-radius: 12px;
      background: #C58B2A;
      color: #FFFDF8;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }
    .nai-setup-save:disabled {
      cursor: not-allowed;
      opacity: .45;
    }

    /* Messages */
    #nai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 24px 24px 10px;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }
    #nai-messages::-webkit-scrollbar { width: 4px; }
    #nai-messages::-webkit-scrollbar-track { background: transparent; }
    #nai-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    /* AI message row */
    .nai-ai-row {
      display: flex; align-items: flex-start; gap: 14px;
    }
    .nai-ai-avatar {
      position: relative;
      width: 50px; height: 56px;
      background: transparent;
      display: flex; align-items: center; justify-content: center;
      color: #FFFDF8; font-size: 0.85rem;
      flex-shrink: 0; margin-top: 2px;
      overflow: visible;
      filter: drop-shadow(0 8px 9px rgba(0,0,0,.28));
    }
    .nai-ai-avatar img { width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
    .nai-ai-avatar img.is-thinking { animation: naiavatarthinking 1.15s ease-in-out infinite; }
    .nai-thinking-overhead {
      position: absolute; z-index: 2; top: -12px; left: 64%;
      min-width: 40px; height: 22px; padding: 0 8px;
      display: flex; align-items: center; justify-content: center; gap: 4px;
      border: 1px solid rgba(255,255,255,.12); border-radius: 999px;
      background: #171a21; box-shadow: 0 7px 16px rgba(0,0,0,.28);
      transform: translateX(-50%);
    }
    .nai-thinking-overhead span {
      width: 5px; height: 5px; border-radius: 50%; background: #C58B2A;
      animation: naioverheaddot 1.05s ease-in-out infinite;
    }
    .nai-thinking-overhead span:nth-child(2) { animation-delay: .14s; }
    .nai-thinking-overhead span:nth-child(3) { animation-delay: .28s; }
    @keyframes naioverheaddot {
      0%,65%,100% { opacity: .34; transform: translateY(1px) scale(.82); }
      32% { opacity: 1; transform: translateY(-2px) scale(1); }
    }
    @keyframes naiavatarthinking {
      0%,100% { transform: scale(.98) translateY(2px) rotate(-1.2deg); }
      50% { transform: scale(1.04) translateY(-3px) rotate(1.2deg); }
    }
    .nai-ai-bubble {
      flex: 1;
      font-size: 0.9rem; color: rgba(255,255,255,0.85);
      line-height: 1.72;
    }
    html:not([data-theme="light"]) #nex-ai-widget-root .nai-ai-bubble,
    html:not([data-theme="light"]) #nex-ai-widget-root .nai-ai-bubble p,
    html:not([data-theme="light"]) #nex-ai-widget-root .nai-reply-list,
    html:not([data-theme="light"]) #nex-ai-widget-root .nai-reply-list li {
      color: #FFFFFF !important;
    }
    .nai-ai-bubble a, .nai-cyan-link {
      color: #C58B2A; text-decoration: none; font-weight: 600;
    }
    .nai-ai-bubble strong { color: #fff; font-weight: 700; }
    .nai-ai-bubble p {
      margin: 0 0 10px;
    }
    .nai-ai-bubble p:last-child {
      margin-bottom: 0;
    }
    .nai-typing-indicator {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 5px 16px 16px 16px;
      background: rgba(255,255,255,.05);
      color: rgba(255,255,255,.7);
      font-size: .76rem;
      font-weight: 700;
    }
    .nai-typing-dots { display: inline-flex; align-items: center; gap: 3px; }
    .nai-typing-dots span {
      width: 5px; height: 5px; border-radius: 50%;
      background: #C58B2A;
      animation: naitypingdot 1s ease-in-out infinite;
    }
    .nai-typing-dots span:nth-child(2) { animation-delay: .14s; }
    .nai-typing-dots span:nth-child(3) { animation-delay: .28s; }
    @keyframes naitypingdot { 0%,100%{opacity:.35;transform:translateY(0)} 50%{opacity:1;transform:translateY(-2px)} }
    .nai-reply-list {
      margin: 8px 0 10px 18px;
      padding: 0;
    }
    .nai-reply-list:last-child {
      margin-bottom: 0;
    }
    .nai-reply-list li {
      margin: 4px 0;
      padding-left: 2px;
    }
    .nai-ai-bubble code {
      color: #e5faff;
      background: rgba(197,139,42,0.1);
      border: 1px solid rgba(197,139,42,0.15);
      border-radius: 5px;
      padding: 1px 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.86em;
    }

    /* User message row */
    .nai-user-row {
      display: flex; align-items: flex-end; justify-content: flex-end;
      gap: 10px;
    }
    .nai-user-bubble {
      max-width: 80%;
      background: #C58B2A;
      color: #FFFDF8; font-weight: 600;
      padding: 14px 18px;
      border-radius: 16px 16px 4px 16px;
      font-size: 0.88rem;
      line-height: 1.6;
    }
    .nai-user-avatar-sm {
      width: 34px; height: 34px; border-radius: 50%;
      overflow: hidden; flex-shrink: 0;
      border: 2px solid rgba(197,139,42,0.3);
    }
    .nai-user-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }

    /* ── INPUT AREA ── */
    #nai-input-area {
      padding: 14px 20px 12px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .nai-input-row {
      display: flex; align-items: center; gap: 10px;
      background: #181f2b;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; padding: 10px 10px 10px 14px;
      margin-bottom: 10px;
      transition: border-color 0.2s;
    }
    .nai-input-row:focus-within { border-color: rgba(197,139,42,0.3); }
    .nai-attach-btn {
      all: unset;
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.15);
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; font-size: 0.82rem;
      cursor: pointer; flex-shrink: 0; transition: all 0.2s;
    }
    .nai-attach-btn:hover { border-color: rgba(197,139,42,0.4); color: #C58B2A; }
    #nai-input {
      flex: 1; background: none; border: none; outline: none;
      font-size: 0.88rem; color: #fff;
      font-family: "Manrope", -apple-system, ui-sans-serif, system-ui, sans-serif;
      min-width: 0;
    }
    #nai-input::placeholder { color: #756A60; }
    .nai-mic-btn {
      all: unset;
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; font-size: 0.88rem;
      cursor: pointer; padding: 4px; transition: color 0.2s;
      flex-shrink: 0;
    }
    .nai-mic-btn:hover { color: #9ca3af; }
    #nai-send {
      all: unset;
      width: 38px; height: 38px; border-radius: 10px;
      background: #C58B2A;
      display: flex; align-items: center; justify-content: center;
      color: #FFFDF8; font-size: 0.82rem;
      cursor: pointer; flex-shrink: 0; transition: all 0.2s;
    }
    #nai-send:hover { background: #A96F18; box-shadow: 0 3px 14px rgba(197,139,42,0.5); }

    .nai-footer-hint {
      text-align: center;
      font-size: 0.62rem; color: #374151;
      letter-spacing: 0.04em; font-weight: 600;
      text-transform: uppercase;
    }
    .nai-footer-hint span { margin: 0 8px; }
    /* ── RESPONSIVE ── */
    @media (max-width: 900px) {
      #nai-overlay {
        align-items: stretch;
        justify-content: stretch;
        bottom: var(--mobile-fixed-reserve, calc(84px + env(safe-area-inset-bottom, 0px)));
        padding: 0;
        z-index: 900;
      }
      #nai-modal {
        width: 100vw;
        max-width: none;
        height: 100%;
        min-height: 0;
        max-height: none;
        border-radius: 0;
        border: 0;
        flex-direction: column;
        box-shadow: none;
        transform: translateY(18px);
      }
      #nai-overlay.nai-open #nai-modal {
        transform: translateY(0);
      }
      #nai-sidebar {
        display: none;
      }
      #nai-float-btn .nai-float-text-label { display: none !important; }
      #nai-float-btn {
        display: none !important;
        width: 52px;
        height: 52px;
        justify-content: center;
        bottom: var(--floating-ai-bottom, calc(104px + env(safe-area-inset-bottom, 0px)));
        right: calc(16px + env(safe-area-inset-right, 0px));
        padding: 0;
        border-radius: 16px;
      }
      #nai-float-btn i { display: none; }
      #nai-float-btn .nai-float-mobile-label {
        display: inline !important;
        font-size: .78rem;
        font-weight: 900;
        letter-spacing: 0;
      }
      #nai-input-area {
        padding: 10px 14px 12px;
      }
      #nai-chat-hdr {
        align-items: flex-start;
        gap: 10px;
        padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 12px;
      }
      #nai-chat-hdr > div:first-child {
        flex: 1;
        min-width: 0;
      }
      .nai-session-title {
        overflow: hidden;
        margin-bottom: 0;
        font-size: 1.08rem;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nai-bot-customizer {
        flex-wrap: nowrap;
        gap: 8px;
        margin-top: 8px;
      }
      .nai-bot-avatar-picker {
        width: 34px;
        height: 34px;
        border-radius: 10px;
      }
      #nai-bot-name-input {
        flex: 1;
        width: 150px;
        min-width: 0;
        max-width: 150px;
        min-height: 34px;
        box-sizing: border-box;
      }
      .nai-hdr-actions {
        flex-shrink: 0;
      }
      .nai-hdr-btn {
        min-height: 34px;
        padding: 0 9px;
        font-size: .72rem;
      }
      .nai-avatar-menu {
        top: 72px;
        left: 14px;
        width: min(260px, calc(100vw - 28px));
        box-sizing: border-box;
      }
      #nai-messages {
        gap: 18px;
        padding: 18px 16px 12px;
      }
      .nai-ai-row {
        gap: 10px;
      }
      .nai-ai-avatar {
        width: 44px;
        height: 50px;
      }
      .nai-ai-bubble {
        font-size: .86rem;
        line-height: 1.62;
      }
      .nai-user-bubble {
        max-width: 82%;
        padding: 11px 14px;
      }
      .nai-user-avatar-sm {
        width: 30px;
        height: 30px;
      }
      .nai-input-row {
        gap: 8px;
        margin-bottom: 0;
        padding: 7px 7px 7px 10px;
        border-radius: 13px;
      }
      .nai-footer-hint {
        display: none;
      }
      #nai-auth-prompt {
        inset: 0 0 var(--mobile-fixed-reserve, calc(84px + env(safe-area-inset-bottom, 0px))) 0;
        z-index: 900;
        align-items: center;
        justify-content: center;
        padding: 14px;
        pointer-events: none;
        background: rgba(0,0,0,.42);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .nai-auth-card {
        width: min(420px, 100%);
        min-height: auto;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.1);
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        box-shadow: 0 28px 90px rgba(0,0,0,.65);
        pointer-events: auto;
      }
      .nai-auth-actions {
        flex-direction: column;
      }
    }
    #nex-ai-widget-root.nai-fullscreen-hidden {
      display: none !important;
    }
    html[data-theme="light"] #nai-modal,
    html[data-theme="light"] #nai-chat-area {
      background: #FFFDF8;
      border-color: #E2D6C6;
      box-shadow: 0 28px 90px rgba(88,65,34,.12);
    }
    html[data-theme="light"] #nai-chat-hdr,
    html[data-theme="light"] #nai-input-area,
    html[data-theme="light"] #nai-sidebar {
      border-color: #E6DACB;
    }
    html[data-theme="light"] #nai-sidebar {
      background: #FAF5ED;
    }
    html[data-theme="light"] .nai-session-title,
    html[data-theme="light"] .nai-history-title,
    html[data-theme="light"] .nai-ai-bubble strong {
      color: #2B211A;
    }
    html[data-theme="light"] .nai-history-empty {
      border-color: #E2D6C6;
      color: #8B7A69;
    }
    html[data-theme="light"] .nai-history-item {
      background: #FFFDF8;
      border-color: #E2D6C6;
      color: #332820;
    }
    html[data-theme="light"] .nai-history-item:hover,
    html[data-theme="light"] .nai-history-item.is-active {
      background: rgba(197,139,42,.12);
      border-color: rgba(197,139,42,.42);
      color: #2B211A;
    }
    html[data-theme="light"] .nai-ai-bubble,
    html[data-theme="light"] .nai-ai-bubble p,
    html[data-theme="light"] .nai-reply-list,
    html[data-theme="light"] .nai-reply-list li {
      color: #756A60 !important;
    }
    html[data-theme="light"] .nai-input-row,
    html[data-theme="light"] #nai-bot-name-input {
      background: #FAF5ED;
      border-color: #E2D6C6;
      color: #332820;
    }
    html[data-theme="light"] #nai-input {
      color: #332820;
    }
    html[data-theme="light"] .nai-hdr-btn {
      background: #FFFCF6;
      border-color: #E2D6C6;
      color: #8B6A37;
    }
    html[data-theme="light"] .nai-avatar-menu {
      background: #FFFDF8;
      border-color: #E2D6C6;
      box-shadow: 0 18px 50px rgba(88,65,34,.12);
    }
    html[data-theme="light"] .nai-setup-panel {
      background: rgba(250,247,241,.92);
    }
    html[data-theme="light"] .nai-setup-card {
      background: #FFFDF8;
      color: #332820;
      border-color: #DAB77A;
    }
    html[data-theme="light"] .nai-setup-card p,
    html[data-theme="light"] .nai-setup-label {
      color: #756A60;
    }
    html[data-theme="light"] #nai-setup-name {
      background: #FAF5ED;
      color: #332820;
      border-color: #E2D6C6;
    }
    #nai-auth-prompt {
      position: fixed;
      inset: 0;
      z-index: 9993;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,.72);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      font-family: "Manrope", -apple-system, ui-sans-serif, system-ui, sans-serif;
    }
    #nai-auth-prompt.is-visible { display: flex; }
    .nai-auth-card {
      width: min(420px, 100%);
      position: relative;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.1);
      background: #10141c;
      padding: 28px;
      text-align: center;
      color: #fff;
      box-shadow: 0 28px 90px rgba(0,0,0,.65);
    }
    .nai-auth-close {
      all: unset;
      position: absolute;
      top: 12px;
      right: 16px;
      color: #9ca3af;
      font-size: 1.4rem;
      cursor: pointer;
    }
    .nai-auth-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #C58B2A;
      color: #FFFDF8;
    }
    .nai-auth-card h3 {
      margin: 0 0 8px;
      font-size: 1.25rem;
      line-height: 1.25;
    }
    .nai-auth-card p {
      margin: 0;
      color: #aeb7c5;
      font-size: .9rem;
      line-height: 1.5;
    }
    .nai-auth-actions {
      display: flex;
      gap: 10px;
      margin-top: 22px;
    }
    .nai-auth-actions a {
      flex: 1;
      min-height: 42px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-weight: 800;
      font-size: .9rem;
    }
    .nai-auth-primary {
      background: #C58B2A;
      color: #FFFDF8;
    }
    .nai-auth-secondary {
      border: 1px solid #DAB77A;
      color: #9A681F;
      background: #FFFDF8;
    }
    html[data-theme="light"] .nai-auth-card {
      background: #FFFDF8;
      color: #332820;
      border-color: #E2D6C6;
    }
    html[data-theme="light"] .nai-auth-card p { color: #756A60; }
  `;

  /* ═══════════════════════════════════════════════════════════════
     HTML
  ═══════════════════════════════════════════════════════════════ */
  const HTML = `
    <!-- Floating Button -->
    <button id="nai-float-btn" aria-label="Open Nex AI Tutor">
      <i class="fas fa-bolt"></i>
      <span class="nai-float-mobile-label" aria-hidden="true">AI</span>
      <span class="nai-float-text-label">${hasAiAccess() ? 'Nex AI' : 'Login to use AI'}</span>
    </button>

    <!-- Overlay -->
    <div id="nai-overlay" aria-hidden="true">
      <div id="nai-modal" role="dialog" aria-modal="true" aria-labelledby="nai-session-title" tabindex="-1">

        <!-- ── CHAT HISTORY ── -->
        <aside id="nai-sidebar" aria-label="Nex AI tutor">
          <div class="nai-bot-hdr">
            <div class="nai-bot-icon">${botAvatarMarkup}</div>
            <div>
              <div class="nai-bot-name">${savedBotName}</div>
              <div class="nai-online"><span class="nai-online-dot"></span>Ready to help</div>
            </div>
          </div>
          <div class="nai-focus-card">Ask anything about courses, projects, subscriptions, or your learning plan.</div>
        </aside>

        <!-- ── CHAT AREA ── -->
        <div id="nai-chat-area">

          <!-- Header -->
          <div id="nai-chat-hdr">
            <div>
              <div class="nai-session-title" id="nai-session-title"><span id="nai-bot-name-title">${savedBotName}</span></div>
              <div class="nai-bot-customizer">
                <button class="nai-bot-avatar-picker" id="nai-bot-avatar-picker" type="button" aria-label="Choose AI icon">${botAvatarMarkup}</button>
                <input id="nai-bot-name-input" type="text" value="${escAttr(savedBotName)}" maxlength="24" aria-label="AI bot name">
              </div>
              <div class="nai-avatar-menu" id="nai-avatar-menu" hidden></div>
            </div>
            <div class="nai-hdr-actions">
              <button class="nai-hdr-btn" id="nai-new-chat" type="button">New chat</button>
              <button class="nai-hdr-btn" id="nai-close" type="button" aria-label="Close Nex AI Tutor"><i class="fas fa-arrow-left"></i><span>Back</span></button>
            </div>
          </div>

          <!-- Messages -->
          <div id="nai-messages">
          </div>
          <!-- /messages -->

          <!-- Input -->
          <div id="nai-input-area">
            <div class="nai-input-row">
              <button class="nai-attach-btn" type="button" title="Attach file" aria-label="Attach file">
                <i class="fas fa-plus"></i>
              </button>
              <input type="text" id="nai-input" placeholder="Type your question here..." aria-label="Message Nex AI">
              <button class="nai-mic-btn" type="button" title="Voice input" aria-label="Voice input">
                <i class="fas fa-microphone"></i>
              </button>
              <button id="nai-send" type="button" title="Send" aria-label="Send message">
                <i class="fas fa-arrow-up"></i>
              </button>
            </div>
            <div class="nai-footer-hint">
              PRESS SHIFT + ENTER FOR NEW LINE
              <span>·</span>
              AI CAN MAKE MISTAKES. VERIFY IMPORTANT INFO.
            </div>
          </div>

        </div>
        <!-- /chat area -->

        <div class="nai-setup-panel" id="nai-setup-panel" ${aiSetupComplete ? 'hidden' : ''}>
          <div class="nai-setup-card">
            <div class="nai-setup-kicker">First AI setup</div>
            <h3>Choose your AI companion</h3>
            <p>Pick a refined icon and give your tutor a name. I will save it for your future Skillomate sessions.</p>
            <label class="nai-setup-label" for="nai-setup-name">AI name</label>
            <input id="nai-setup-name" type="text" maxlength="24" value="${escAttr(savedBotName === 'AI' ? '' : savedBotName)}" placeholder="Example: Nova, Mentor, Study Buddy">
            <div class="nai-setup-label">AI icon</div>
            <div class="nai-setup-avatars" id="nai-setup-avatars"></div>
            <div class="nai-setup-error" id="nai-setup-error" role="alert" aria-live="assertive"></div>
            <button class="nai-setup-save" id="nai-setup-save" type="button" disabled>Save and start</button>
          </div>
        </div>

      </div>
    </div>
  `;

  /* ═══════════════════════════════════════════════════════════════
     INJECT
  ═══════════════════════════════════════════════════════════════ */
  const styleEl = document.createElement('style');
  styleEl.id = 'nex-ai-widget-styles';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  const rootEl = document.createElement('div');
  rootEl.id = 'nex-ai-widget-root';
  rootEl.innerHTML = HTML;
  document.body.appendChild(rootEl);

  /* ═══════════════════════════════════════════════════════════════
     INTERACTIONS
  ═══════════════════════════════════════════════════════════════ */
  const floatBtn  = document.getElementById('nai-float-btn');
  const overlay   = document.getElementById('nai-overlay');
  const modal     = document.getElementById('nai-modal');
  const closeBtn  = document.getElementById('nai-close');
  const input     = document.getElementById('nai-input');
  const sendBtn   = document.getElementById('nai-send');
  const messages  = document.getElementById('nai-messages');
  const conversationList = document.getElementById('nai-conversation-list');
  const botNameInput = document.getElementById('nai-bot-name-input');
  const botNameTitle = document.getElementById('nai-bot-name-title');
  const sidebarBotName = document.querySelector('.nai-bot-name');
  const botAvatarPicker = document.getElementById('nai-bot-avatar-picker');
  const avatarMenu = document.getElementById('nai-avatar-menu');
  const setupPanel = document.getElementById('nai-setup-panel');
  const setupName = document.getElementById('nai-setup-name');
  const setupAvatars = document.getElementById('nai-setup-avatars');
  const setupSave = document.getElementById('nai-setup-save');
  const setupError = document.getElementById('nai-setup-error');
  const setupCard = setupPanel?.querySelector('.nai-setup-card');
  const botAvatars = ['nex', 'sparkles', 'brain', 'book', 'badge'];
  const botIconClass = (value) => ({
    sparkles: 'fas fa-bolt',
    brain: 'fas fa-network-wired',
    book: 'fas fa-book-open',
    badge: 'fas fa-award'
  }[value] || 'fas fa-bolt');

  const botAvatarMarkupFor = (value) => value === 'nex'
    ? '<img class="nai-bot-avatar-img" src="/assets/nex-avatar.png" alt="">'
    : `<i class="${botIconClass(value)}"></i>`;

  function currentBotAvatarMarkup() {
    const avatar = localStorage.getItem(botAvatarStorageKey) || 'nex';
    return botAvatarMarkupFor(avatar);
  }

  function syncBotAvatar() {
    const markup = currentBotAvatarMarkup();
    botAvatarPicker.innerHTML = markup;
    const sidebarBotIcon = document.querySelector('.nai-bot-icon');
    if (sidebarBotIcon) sidebarBotIcon.innerHTML = markup;
    document.querySelectorAll('.nai-ai-avatar').forEach((node) => { node.innerHTML = markup; });
  }

  function normalizeBotName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  }

  function previewBotName(value) {
    const name = normalizeBotName(value) || 'AI';
    botNameTitle.textContent = name;
  }

  function syncBotName(value) {
    const name = normalizeBotName(value) || 'AI';
    localStorage.setItem(botNameStorageKey, name);
    botNameInput.value = name;
    setupName.value = name === 'AI' ? '' : name;
    botNameTitle.textContent = name;
    if (sidebarBotName) sidebarBotName.textContent = name;
    validateSetup();
  }

  function validateSetup() {
    const hasName = Boolean(setupName.value.trim());
    const hasAvatar = Boolean(setupAvatars.querySelector('.is-selected'));
    setupSave.disabled = !(hasName && hasAvatar);
    setupError.textContent = setupSave.disabled ? 'Choose an icon and name your AI to continue.' : '';
  }

  function showSetupPrompt() {
    setupPanel.hidden = false;
    setTimeout(() => setupName.focus(), 80);
    validateSetup();
  }

  function mountWidget(container = null) {
    const target = container || document.fullscreenElement || document.body;
    if (rootEl.parentElement !== target) target.appendChild(rootEl);
  }

  let lastAiTrigger = null;
  function openChat(container = null)  {
    mountWidget(container);
    syncConversationOwner();
    lastAiTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : floatBtn;
    if (!requireAiAccess(container)) return;
    overlay.classList.add('nai-open');
    overlay.setAttribute('aria-hidden', 'false');
    floatBtn.classList.add('nai-btn-open');
    if (localStorage.getItem(botSetupStorageKey) !== 'true') showSetupPrompt();
    setTimeout(() => (input && !input.disabled ? input : modal)?.focus(), 0);
  }
  function closeChat() {
    overlay.classList.remove('nai-open');
    overlay.setAttribute('aria-hidden', 'true');
    floatBtn.classList.remove('nai-btn-open');
    hideAiLoginPrompt();
    (lastAiTrigger || floatBtn)?.focus?.();
  }

  function closeChatForNavigation() {
    overlay.classList.remove('nai-open');
    overlay.setAttribute('aria-hidden', 'true');
    floatBtn.classList.remove('nai-btn-open');
    hideAiLoginPrompt();
    mountWidget(document.body);
  }

  function syncAuthButton() {
    const isLoggedIn = hasAiAccess();
    floatBtn.querySelector('.nai-float-text-label').textContent = isLoggedIn ? 'Nex AI' : 'Login to use AI';
    floatBtn.setAttribute('aria-label', isLoggedIn ? 'Open Nex AI Tutor' : 'Login to use Nex AI');
  }

  const mobileFullscreenViewport = window.matchMedia('(max-width: 900px), (pointer: coarse)');
  let nativeVideoFullscreen = false;

  function activeFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function syncMobileFullscreenVisibility() {
    const fullscreenActive = Boolean(activeFullscreenElement() || nativeVideoFullscreen);
    const shouldHide = mobileFullscreenViewport.matches && fullscreenActive;
    rootEl.classList.toggle('nai-fullscreen-hidden', shouldHide);
    rootEl.toggleAttribute('inert', shouldHide);
    rootEl.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');

    if (!fullscreenActive) mountWidget(document.body);
  }

  floatBtn.addEventListener('click', () => {
    overlay.classList.contains('nai-open') ? closeChat() : openChat();
  });
  window.addEventListener('edunex:auth-changed', syncAuthButton);
  window.addEventListener('storage', syncAuthButton);
  window.addEventListener('edunex:route-changed', closeChatForNavigation);
  window.addEventListener('popstate', closeChatForNavigation);
  document.addEventListener('fullscreenchange', syncMobileFullscreenVisibility);
  document.addEventListener('webkitfullscreenchange', syncMobileFullscreenVisibility);
  document.addEventListener('webkitbeginfullscreen', (event) => {
    if (event.target?.tagName !== 'VIDEO') return;
    nativeVideoFullscreen = true;
    syncMobileFullscreenVisibility();
  }, true);
  document.addEventListener('webkitendfullscreen', (event) => {
    if (event.target?.tagName !== 'VIDEO') return;
    nativeVideoFullscreen = false;
    syncMobileFullscreenVisibility();
  }, true);
  if (mobileFullscreenViewport.addEventListener) {
    mobileFullscreenViewport.addEventListener('change', syncMobileFullscreenVisibility);
  } else {
    mobileFullscreenViewport.addListener(syncMobileFullscreenVisibility);
  }
  syncAuthButton();
  syncMobileFullscreenVisibility();

  window.NexAIWidget = {
    open: openChat,
    close: closeChat,
    isOpen: () => overlay.classList.contains('nai-open'),
  };

  closeBtn.addEventListener('click', closeChat);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('nai-auth-prompt')?.classList.contains('is-visible')) {
      hideAiLoginPrompt();
      return;
    }
    if (event.key === 'Escape' && overlay.classList.contains('nai-open')) closeChat();
  });

  botNameInput.addEventListener('input', () => {
    previewBotName(botNameInput.value);
  });
  botNameInput.addEventListener('change', () => {
    syncBotName(botNameInput.value);
  });
  botNameInput.addEventListener('blur', () => {
    syncBotName(botNameInput.value);
  });
  botNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      botNameInput.blur();
    }
  });

  avatarMenu.innerHTML = botAvatars.map((style) => `
    <button class="nai-avatar-choice" type="button" data-avatar="${style}" aria-label="Choose AI style">
      ${botAvatarMarkupFor(style)}
    </button>
  `).join('');
  botAvatarPicker.addEventListener('click', () => {
    avatarMenu.hidden = !avatarMenu.hidden;
  });
  avatarMenu.querySelectorAll('.nai-avatar-choice').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(botAvatarStorageKey, button.dataset.avatar || '');
      avatarMenu.hidden = true;
      syncBotAvatar();
    });
  });

  setupAvatars.innerHTML = botAvatars.map((style) => `
    <button class="nai-avatar-choice${savedBotAvatar === style ? ' is-selected' : ''}" type="button" data-avatar="${style}" aria-label="Choose AI style">
      ${botAvatarMarkupFor(style)}
    </button>
  `).join('');
  setupName.addEventListener('input', validateSetup);
  setupAvatars.querySelectorAll('.nai-avatar-choice').forEach((button) => {
    button.addEventListener('click', () => {
      setupAvatars.querySelectorAll('.nai-avatar-choice').forEach((node) => node.classList.remove('is-selected'));
      button.classList.add('is-selected');
      localStorage.setItem(botAvatarStorageKey, button.dataset.avatar || '');
      syncBotAvatar();
      validateSetup();
    });
  });
  setupSave.addEventListener('click', () => {
    validateSetup();
    if (setupSave.disabled) return;
    syncBotName(setupName.value);
    localStorage.setItem(botSetupStorageKey, 'true');
    setupPanel.hidden = true;
    input.focus();
  });
  setupCard?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  validateSetup();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeChat();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('nai-auth-prompt')?.classList.contains('is-visible')) {
      hideAiLoginPrompt();
      return;
    }
    if (e.key === 'Escape') closeChat();
  });

  /* ── Send message ── */
  const MAX_STORED_SESSIONS = 24;
  const MAX_MESSAGES_PER_SESSION = 80;
  let conversationHistory = [];
  let conversationOwner = null;
  let conversationSessions = [];
  let currentSessionId = '';
  let conversationVersion = 0;
  let sending = false;

  function getConversationList() {
    if (typeof conversationList !== 'undefined') return conversationList;
    return document.getElementById('nai-conversation-list');
  }

  function conversationStorageKey() {
    return `edunexNexAiChats:${conversationOwner || 'guest'}`;
  }

  function readStoredSessions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(conversationStorageKey()) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((session) => ({
          id: String(session?.id || ''),
          title: String(session?.title || 'New chat').slice(0, 80),
          updatedAt: Number(session?.updatedAt || Date.now()),
          messages: Array.isArray(session?.messages)
            ? session.messages
                .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
                .map((message) => ({
                  role: message.role,
                  content: message.content.slice(0, 4000),
                  notice: typeof message.notice === 'string' ? message.notice.slice(0, 1000) : '',
                  sources: Array.isArray(message.sources) ? message.sources.slice(0, 8) : [],
                  createdAt: Number(message.createdAt || Date.now()),
                }))
            : [],
        }))
        .filter((session) => session.id)
        .slice(0, MAX_STORED_SESSIONS);
    } catch (_) {
      return [];
    }
  }

  function writeStoredSessions() {
    if (typeof localStorage?.setItem !== 'function') return;
    const stored = conversationSessions
      .filter((session) => Array.isArray(session.messages) && session.messages.length)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_STORED_SESSIONS);
    try {
      localStorage.setItem(conversationStorageKey(), JSON.stringify(stored));
    } catch (_) {}
  }

  function newSessionId() {
    return `nai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function titleFromMessage(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'New chat';
    return text.length > 42 ? `${text.slice(0, 42).trim()}...` : text;
  }

  function dateLabel(value) {
    const timestamp = Number(value || Date.now());
    const delta = Date.now() - timestamp;
    if (delta < 60 * 1000) return 'Just now';
    if (delta < 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 60000))} min ago`;
    if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / 3600000))} hr ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function createConversationSession() {
    return {
      id: newSessionId(),
      title: 'New chat',
      updatedAt: Date.now(),
      messages: [],
    };
  }

  function activeSession() {
    let session = conversationSessions.find((item) => item.id === currentSessionId);
    if (!session) {
      session = createConversationSession();
      currentSessionId = session.id;
      conversationSessions.unshift(session);
    }
    return session;
  }

  function syncHistoryFromActiveSession() {
    const session = activeSession();
    conversationHistory = session.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content }))
      .slice(-12);
  }

  function renderMessageRecord(message) {
    const row = document.createElement('div');
    if (message.role === 'user') {
      row.className = 'nai-user-row';
      row.innerHTML = `
        <div class="nai-user-bubble">${escapeNaiHtml(message.content)}</div>
        <div class="nai-user-avatar-sm">
          <img src="${escapeNaiHtml(learnerAvatar)}" alt="">
        </div>
      `;
      return row;
    }

    row.className = 'nai-ai-row';
    row.innerHTML = `
      <div class="nai-ai-avatar">${currentBotAvatarMarkup()}</div>
      <div class="nai-ai-bubble">${formatNaiReply(message.content)}
        ${message.notice ? `<p role="status">${escapeNaiHtml(message.notice)}</p>` : ''}
        ${(message.sources || []).length ? `<div style="margin-top:12px;font-size:.8rem"><strong>References</strong>${message.sources.filter(source => source.url?.startsWith('/course-details.html?')).map(source => `<p><a style="color:inherit;text-decoration:underline" href="${escapeNaiHtml(source.url)}">[${escapeNaiHtml(source.id)}] ${escapeNaiHtml(source.title)} — ${escapeNaiHtml(source.section)}</a></p>`).join('')}</div>` : ''}
      </div>
    `;
    return row;
  }

  function renderMessagesForSession(session) {
    messages.replaceChildren();
    session.messages.forEach((message) => messages.appendChild(renderMessageRecord(message)));
    messages.scrollTop = messages.scrollHeight;
  }

  function renderConversationList() {
    const list = getConversationList();
    if (!list) return;
    const visibleSessions = conversationSessions
      .filter((session) => session.messages.length)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    if (!visibleSessions.length) {
      list.innerHTML = '<div class="nai-history-empty">Saved chats will appear here after you send a message.</div>';
      return;
    }

    list.innerHTML = visibleSessions.map((session) => `
      <button class="nai-history-item${session.id === currentSessionId ? ' is-active' : ''}" type="button" data-session-id="${escapeNaiHtml(session.id)}" aria-current="${session.id === currentSessionId ? 'true' : 'false'}">
        <span class="nai-history-item-title">${escapeNaiHtml(session.title || 'New chat')}</span>
        <span class="nai-history-item-meta">${dateLabel(session.updatedAt)} · ${session.messages.length} messages</span>
      </button>
    `).join('');
  }

  function loadConversationSessions() {
    conversationSessions = readStoredSessions();
    if (!conversationSessions.length) conversationSessions = [createConversationSession()];
    currentSessionId = conversationSessions[0].id;
    syncHistoryFromActiveSession();
    renderMessagesForSession(activeSession());
    renderConversationList();
  }

  function beginNewConversation() {
    const current = activeSession();
    if (!current.messages.length) {
      conversationHistory = [];
      renderMessagesForSession(current);
      renderConversationList();
      return;
    }

    const session = createConversationSession();
    conversationSessions.unshift(session);
    currentSessionId = session.id;
    conversationHistory = [];
    conversationVersion += 1;
    renderMessagesForSession(session);
    renderConversationList();
    writeStoredSessions();
  }

  function switchConversation(sessionId) {
    const session = conversationSessions.find((item) => item.id === sessionId);
    if (!session) return;
    currentSessionId = session.id;
    conversationVersion += 1;
    syncHistoryFromActiveSession();
    renderMessagesForSession(session);
    renderConversationList();
    input.value = '';
    input.focus();
  }

  function appendConversationMessage(message) {
    const session = activeSession();
    const record = {
      role: message.role,
      content: String(message.content || '').slice(0, 4000),
      notice: typeof message.notice === 'string' ? message.notice.slice(0, 1000) : '',
      sources: Array.isArray(message.sources) ? message.sources.slice(0, 8) : [],
      createdAt: Date.now(),
    };
    session.messages.push(record);
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    if (record.role === 'user' && (!session.title || session.title === 'New chat')) {
      session.title = titleFromMessage(record.content);
    }
    session.updatedAt = Date.now();
    conversationSessions = [
      session,
      ...conversationSessions.filter((item) => item.id !== session.id),
    ].slice(0, MAX_STORED_SESSIONS);
    syncHistoryFromActiveSession();
    writeStoredSessions();
    renderConversationList();
    return record;
  }

  function discardConversationMessage(record) {
    const session = activeSession();
    session.messages = session.messages.filter((message) => message !== record);
    syncHistoryFromActiveSession();
    writeStoredSessions();
    renderConversationList();
  }

  function syncConversationOwner() {
    const user = window.EduNex?.getUser?.();
    const owner = window.EduNex?.getAccessToken?.()
      ? String(user?._id || user?.id || '') : '';
    if (owner !== conversationOwner) {
      conversationOwner = owner;
      conversationVersion += 1;
      loadConversationSessions();
    }
  }

  window.addEventListener('edunex:auth-changed', syncConversationOwner);
  window.addEventListener('storage', syncConversationOwner);
  document.getElementById('nai-new-chat').addEventListener('click', () => {
    beginNewConversation();
    input.value = '';
    input.focus();
  });
  getConversationList()?.addEventListener('click', (event) => {
    const item = event.target.closest('.nai-history-item');
    if (!item) return;
    switchConversation(item.dataset.sessionId || '');
  });

  function escapeNaiHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNaiInline(value) {
    return escapeNaiHtml(value)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/\*\*/g, '');
  }

  function formatNaiReply(value) {
    const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listOpen = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);

      if (!trimmed) {
        if (listOpen) {
          html.push('</ul>');
          listOpen = false;
        }
        html.push('<br>');
        return;
      }

      if (bulletMatch) {
        if (!listOpen) {
          html.push('<ul class="nai-reply-list">');
          listOpen = true;
        }
        html.push(`<li>${formatNaiInline(bulletMatch[1])}</li>`);
        return;
      }

      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      html.push(`<p>${formatNaiInline(trimmed)}</p>`);
    });

    if (listOpen) html.push('</ul>');
    return html.join('');
  }

  async function getAiReply(text, history = conversationHistory) {
    const data = await EduNex.authRequest('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        history,
        pagePath: window.location.pathname + window.location.search,
        assistantName: normalizeBotName(botNameInput?.value) || localStorage.getItem(botNameStorageKey) || 'AI',
      }),
    });

    if (typeof data?.reply !== 'string' || !data.reply.trim()) throw new Error('No answer returned. Please try again.');
    return data;
  }

  async function sendMessage() {
    if (sending) return;
    syncConversationOwner();
    if (!requireAiAccess(rootEl.parentElement)) return;
    const text = input.value.trim();
    if (!text) return;

    sending = true;
    const requestVersion = conversationVersion;
    const historyBeforeSend = conversationHistory.slice();
    sendBtn.disabled = true;
    const userRecord = appendConversationMessage({ role: 'user', content: text });
    const requestSessionId = currentSessionId;
    messages.appendChild(renderMessageRecord(userRecord));
    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'nai-ai-row';
    typing.id = 'nai-typing';
      typing.innerHTML = `
      <div class="nai-ai-avatar"><span class="nai-thinking-overhead" aria-hidden="true"><span></span><span></span><span></span></span><img class="nai-bot-avatar-img is-thinking" src="/assets/nex-avatar-thinking.png" alt=""></div>
      <div class="nai-ai-bubble"><span class="nai-typing-indicator" aria-label="AI is thinking"><span>${escHtml(normalizeBotName(botNameInput?.value) || 'AI')} is thinking…</span></span></div>
    `;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const data = await getAiReply(text, historyBeforeSend);
      const reply = data.reply;
      syncConversationOwner();
      if (requestVersion !== conversationVersion || requestSessionId !== currentSessionId) return;
      const t = document.getElementById('nai-typing');
      if (t) t.remove();

      const aiRecord = appendConversationMessage({
        role: 'assistant',
        content: reply,
        notice: data.notice || '',
        sources: data.sources || [],
      });
      messages.appendChild(renderMessageRecord(aiRecord));
      messages.scrollTop = messages.scrollHeight;
    } catch (error) {
      syncConversationOwner();
      if (requestVersion !== conversationVersion || requestSessionId !== currentSessionId) return;
      const t = document.getElementById('nai-typing');
      if (t) t.remove();
      discardConversationMessage(userRecord);

      const aiRecord = {
        role: 'assistant',
        content: `Nex AI is not available right now. ${error.message || 'Please try again later.'}`,
      };
      messages.appendChild(renderMessageRecord(aiRecord));
      messages.scrollTop = messages.scrollHeight;
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  /* ── Scroll messages to bottom on open ── */
  overlay.addEventListener('transitionend', (event) => {
    if (event.target !== overlay) return;
    if (overlay.classList.contains('nai-open')) {
      messages.scrollTop = messages.scrollHeight;
      if (document.activeElement === botNameInput || document.activeElement === setupName) return;
      if (setupPanel.hidden) input.focus();
      else setupName.focus();
    }
  });

})();
