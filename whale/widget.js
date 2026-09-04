/*
 * 鲸鱼娘 · DeepSeek 状态浮窗 —— 注入组件本体（自包含）
 *
 * 加载方式：
 *   1) 已嵌入 GUI 本体：dsh-web-frontend dist/index.html 注入 /whale-widget.js，
 *      改本文件后重跑 `node patch-gui.js patch` 刷新副本并刷新页面；
 *   2) Tampermonkey：whale.user.js（= 本文件 + 脚本头）；
 *   3) 临时：把 inject-demo.js 粘贴到 F12 控制台。
 *
 * 依赖：本地代理 http://127.0.0.1:8790（whale/proxy.js）。代理未启动时，
 *       峰谷模式与示例台词仍可用（内置默认时段表），余额与自定义图需代理。
 *
 * 交互约定：点【图标】循环切换 峰谷/余额/台词；点气泡空白处不切换；
 *       台词模式下用气泡内 ‹ › 逐句切换；气泡向上扩展，图标位置不动。
 */
(() => {
  'use strict';
  if (typeof window !== 'undefined') {
    if (window.__dshWhaleWidget) return;
    window.__dshWhaleWidget = true;
  }

  const PROXY = 'http://127.0.0.1:8790';
  const LS = { pos: 'whale.pos', mode: 'whale.mode', collapsed: 'whale.collapsed', tip: 'whale.seenTip' };
  const MODES = ['峰谷', '余额', '台词'];
  const WHALE_W = 170;   // 图标区域宽度
  const WHALE_H = 158;   // 图标区域高度（加大）
  const BUBBLE_W = 292;  // 气泡宽度
  const GAP = 10;        // 气泡与图标间距
  const MINI = 104;      // 收起圆点尺寸

  const DEFAULT_CFG = {
    refreshIntervalMin: 10,
    linesIntervalSec: 6,
    schedule: {
      timezoneLabel: '北京时间 (UTC+8)',
      timezoneOffsetMinutes: 480,
      peak: [
        { label: '上午高峰', weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
        { label: '下午高峰', weekdays: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
      ],
      offPeakFactor: 0.5,
      note: '官方规则：高峰=北京时间周一至周五 9:00-12:00、14:00-18:00；其余时段=空闲时段，价格为高峰的一半。',
      scheduleSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
      scheduleUpdated: '2026-09-03',
    },
    lines: [
      '现在是谷值时段，模型价格只要一半哦～',
      '高峰时段到啦，本鲸的身价翻倍了呢！',
      '记得去查余额，别等欠费才想起我～',
      '点我的头可以切换：峰谷 / 余额 / 台词',
      '拖动可以把我放到你喜欢的位置哦～',
      '努力工作，错峰干活，省钱养鲸鱼！',
    ],
  };

  let cfg = Object.assign({}, DEFAULT_CFG, { schedule: Object.assign({}, DEFAULT_CFG.schedule), lines: DEFAULT_CFG.lines.slice() });
  let proxyOk = null;
  let mode = clampInt(readLS(LS.mode), 0, MODES.length - 1, 0);
  let collapsed = readLS(LS.collapsed) === '1';
  let seenTip = readLS(LS.tip) === '1';
  let pos = { x: null, y: null }; // root 左上角（= 图标左上角）
  try { const p = JSON.parse(readLS(LS.pos) || 'null'); if (p && typeof p.x === 'number') pos = p; } catch (_) {}
  let balance = { status: 'none', fetchedAt: 0, lastAttempt: 0, data: null, hint: '', detail: '' };
  let lineIdx = 0;
  let lastNav = 0; // 台词手动切换时间
  let dragging = false;

  /* ---------- helpers ---------- */

  function readLS(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function clampInt(v, lo, hi, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.min(hi, Math.max(lo, v)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- schedule (北京时间窗口判定) ---------- */

  function offsetMs() { return ((cfg.schedule.timezoneOffsetMinutes || 480)) * 60000; }
  function virt(now) { return new Date(now.getTime() + offsetMs()); }
  function isoWeekday(vd) { const u = vd.getUTCDay(); return u === 0 ? 7 : u; }
  function minutesOfDay(vd) { return vd.getUTCHours() * 60 + vd.getUTCMinutes(); }
  function hhmmMin(s) { const a = String(s).split(':').map(Number); return a[0] * 60 + (a[1] || 0); }
  function windowsOf(vd) {
    const wd = isoWeekday(vd);
    return (cfg.schedule.peak || []).filter((w) => !w.weekdays || w.weekdays.indexOf(wd) >= 0);
  }
  function peakAt(now) {
    const vd = virt(now), m = minutesOfDay(vd);
    return windowsOf(vd).some((w) => m >= hhmmMin(w.start) && m < hhmmMin(w.end));
  }
  function nextFlip(now) {
    const vd = virt(now);
    const m = minutesOfDay(vd);
    const nowV = now.getTime() + offsetMs();
    const dayStartV = Date.UTC(vd.getUTCFullYear(), vd.getUTCMonth(), vd.getUTCDate());
    const cur = windowsOf(vd).find((w) => m >= hhmmMin(w.start) && m < hhmmMin(w.end));
    if (cur) {
      return { realAt: dayStartV + hhmmMin(cur.end) * 60000 - offsetMs(), toPeak: false, label: cur.label };
    }
    for (let i = 0; i <= 8; i++) {
      const d = new Date(dayStartV + i * 86400000);
      for (const w of windowsOf(d)) {
        const openV = d.getTime() + hhmmMin(w.start) * 60000;
        if (openV > nowV) return { realAt: openV - offsetMs(), toPeak: true, label: w.label };
      }
    }
    return null;
  }
  function factorText(f) {
    f = Number(f);
    if (!isFinite(f) || f >= 1) return '全价';
    if (Math.abs(f - 0.5) < 0.001) return '半价';
    return (f * 10).toFixed(f * 10 % 1 ? 1 : 0) + ' 折';
  }
  function fmtCountdown(remMs) {
    const mm = Math.floor(remMs / 60000);
    if (mm <= 0) return '即将变价…';
    if (mm < 60) return '约 ' + mm + ' 分钟后';
    const h = Math.floor(mm / 60), mi = mm % 60;
    return mi ? '约 ' + h + ' 小时 ' + mi + ' 分后' : '约 ' + h + ' 小时后';
  }

  /* ---------- data fetching ---------- */

  async function fetchJSON(p) {
    const r = await fetch(PROXY + p, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function loadConfig() {
    try {
      const j = await fetchJSON('/api/config');
      if (j && j.ok !== false) {
        cfg = Object.assign({}, cfg, j, { schedule: Object.assign({}, cfg.schedule, j.schedule || {}), lines: (j.lines && j.lines.length) ? j.lines : cfg.lines });
        proxyOk = true;
      }
    } catch (_) {
      proxyOk = false;
    }
    render();
  }
  async function loadBalance() {
    balance.status = 'loading';
    balance.lastAttempt = Date.now();
    render();
    try {
      const j = await fetchJSON('/api/balance');
      if (j.ok) {
        balance = { status: 'ok', data: j.data || null, ts: j.ts, fetchedAt: Date.now(), lastAttempt: Date.now(), hint: '', detail: '' };
        proxyOk = true;
      } else {
        balance = { status: 'err', error: j.error, hint: j.hint || '', detail: (j.detail && (j.detail.error || (typeof j.detail === 'string' ? j.detail : ''))) || '', fetchedAt: 0, lastAttempt: Date.now(), data: null };
      }
    } catch (_) {
      proxyOk = false;
      balance = { status: 'err', error: 'proxy_down', hint: '本地服务未启动：双击 whale\\启动鲸鱼娘.cmd', detail: '', fetchedAt: 0, lastAttempt: Date.now(), data: null };
    }
    render();
  }

  /* ---------- node 自测钩子（仅无 DOM 的 Node 环境生效） ---------- */

  function mergeCfg(c) {
    cfg = Object.assign({}, DEFAULT_CFG, c || {}, {
      schedule: Object.assign({}, DEFAULT_CFG.schedule, (c || {}).schedule || {}),
      lines: (c && c.lines && c.lines.length) ? c.lines : cfg.lines,
    });
  }
  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined') {
    module.exports = {
      peakAt,
      nextFlip,
      factorText,
      fmtCountdown,
      hhmmMin,
      offsetMs,
      setCfg: mergeCfg,
      getCfg: () => cfg,
    };
    return;
  }

  /* ---------- DOM ---------- */

  const host = document.createElement('div');
  host.id = 'dsh-whale-widget';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .root { position: fixed; z-index: 2147483000; width: ${BUBBLE_W}px; cursor: grab; user-select: none; -webkit-user-select: none; }
    .root.dragging { cursor: grabbing; }
    /* 气泡：绝对定位锚在图标上方，文本变长时向上扩展，图标不动 */
    .bubble {
      position: absolute; left: 50%; transform: translateX(-50%);
      bottom: ${WHALE_H + GAP}px; width: ${BUBBLE_W}px;
      background: rgba(255,255,255,0.98); border: 1px solid rgba(30,64,120,0.18);
      border-radius: 14px; box-shadow: 0 6px 24px rgba(15,40,90,0.16);
      padding: 9px 12px 8px; font-size: 13px; color: #1c2b3a;
    }
    .bubble::after {
      content: ''; position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%);
      border-left: 9px solid transparent; border-right: 9px solid transparent; border-top: 9px solid rgba(255,255,255,0.98);
      filter: drop-shadow(0 2px 0 rgba(30,64,120,0.12));
    }
    .headrow { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .chip { font-size: 10px; color: #fff; background: #4b6cff; border-radius: 9px; padding: 1px 8px; letter-spacing: 0.5px; }
    .btns { margin-left: auto; display: flex; gap: 4px; }
    .btns button { border: none; background: #eef2fa; color: #5a6b82; border-radius: 6px; font-size: 12px; line-height: 16px; width: 20px; height: 20px; cursor: pointer; padding: 0; }
    .btns button:hover { background: #dbe4f4; }
    .body { line-height: 1.55; word-break: break-word; }
    .peak-title { font-weight: 600; font-size: 15px; }
    .valley { color: #159a4c; } .peak { color: #e2620f; }
    .sub { color: #5a6b82; font-size: 12px; margin-top: 2px; }
    .note { color: #93a1b4; font-size: 10.5px; margin-top: 6px; border-top: 1px dashed #dfe6f0; padding-top: 5px; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .big { font-size: 17px; font-weight: 700; }
    .ok { color: #159a4c; } .bad { color: #d33; } .warn { color: #e28b12; }
    .act { color: #4b6cff; cursor: pointer; }
    .act:hover { text-decoration: underline; }
    .proxynote { color: #b3810f; background: #fff6e0; border-radius: 6px; padding: 2px 6px; font-size: 10.5px; margin-top: 6px; }
    .tipnote { color: #93a1b4; font-size: 10.5px; margin-top: 6px; text-align: center; }
    /* 图标：固定在 root 顶部（flow），不随气泡高度移动 */
    .whale { position: relative; width: ${WHALE_W}px; height: ${WHALE_H}px; margin: 0 auto; text-align: center; cursor: pointer; }
    .whale img { max-width: ${WHALE_W}px; max-height: ${WHALE_H}px; filter: drop-shadow(0 4px 10px rgba(15,40,90,0.2)); pointer-events: none; }
    .whale .emoji { font-size: 96px; line-height: ${WHALE_H}px; }
    @keyframes whaleFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    .whale { animation: whaleFloat 3.4s ease-in-out infinite; }
    .mini { width: ${MINI}px; height: ${MINI}px; margin: 0 auto; border-radius: 50%;
      background: rgba(255,255,255,0.98); border: 1px solid rgba(30,64,120,0.18);
      box-shadow: 0 6px 18px rgba(15,40,90,0.18); display: flex; align-items: center;
      justify-content: center; cursor: pointer; overflow: hidden; position: relative; }
    .mini img { width: 100%; height: auto; object-fit: cover; display: block; pointer-events: none;
      position: absolute; top: -18%; left: 50%; transform: translateX(-50%); }
    .mini .emoji { font-size: 38px; line-height: 1; position: relative; z-index: 1; }
    /* 台词 ‹ › 按钮 */
    .linewrap { display: flex; align-items: center; gap: 6px; }
    .linebtn { flex: 0 0 auto; width: 24px; height: 24px; border: none; border-radius: 50%;
      background: #eef2fa; color: #4b6cff; font-size: 15px; line-height: 1; cursor: pointer; padding: 0; }
    .linebtn:hover { background: #dbe4f4; }
    .linetext { flex: 1 1 auto; font-size: 14px; line-height: 1.7; min-width: 0; }
    .linesub { color: #93a1b4; font-size: 10.5px; text-align: center; margin-top: 5px; }
  `;
  shadow.appendChild(style);
  const root = document.createElement('div');
  root.className = 'root';
  shadow.appendChild(root);
  host.style.position = 'fixed';
  host.style.zIndex = '2147483000';
  host.style.left = '0';
  host.style.top = '0';
  host.style.pointerEvents = 'none';
  root.style.pointerEvents = 'auto';
  document.documentElement.appendChild(host);
  applyPos();

  function applyPos() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const anchorH = collapsed ? MINI : WHALE_H;
    let x = (pos.x == null) ? vw - BUBBLE_W - 16 : pos.x;
    let y = (pos.y == null) ? vh - anchorH - (collapsed ? 16 : 14) : pos.y;
    x = Math.min(Math.max(0, x), Math.max(0, vw - BUBBLE_W));
    y = Math.min(Math.max(0, y), Math.max(0, vh - anchorH - 12));
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    pos.x = x; pos.y = y;
  }
  function finalizePos() {
    // 气泡底边在图标上方，若气泡过长顶出视口，则整体下移以保证可见
    const bb = root.querySelector('.bubble');
    if (bb && !collapsed) {
      const need = bb.offsetHeight + GAP;
      const vh = window.innerHeight;
      const maxY = Math.max(4, vh - WHALE_H - 12);
      if (pos.y < need) pos.y = Math.min(need, maxY);
      applyPos();
    }
  }
  function savePos() { writeLS(LS.pos, JSON.stringify({ x: pos.x, y: pos.y })); }
  window.addEventListener('resize', () => { applyPos(); });

  /* ---------- 峰谷模式内容 ---------- */

  function peakContent() {
    const now = new Date();
    const peak = peakAt(now);
    const flip = nextFlip(now);
    const f = peak ? 1 : (cfg.schedule.offPeakFactor == null ? 0.5 : cfg.schedule.offPeakFactor);
    const title = peak
      ? '<span class="peak-title peak">⚡ 当前价格：峰值（' + factorText(f) + '）</span>'
      : '<span class="peak-title valley">💤 当前价格：谷值（' + factorText(f) + '）</span>';
    const when = flip
      ? '距下次变价 ' + fmtCountdown(Math.max(0, flip.realAt - now.getTime()))
      : '时段数据异常';
    const label = peak ? '高峰' : '空闲';
    return (
      title +
      '<div class="sub">' + esc('现在为' + label + '时段' + (peak && cfg.schedule.peak && cfg.schedule.peak.length ? ' · 工作日' : '') + ' · ' + esc(cfg.schedule.timezoneLabel || '北京时间')) + '</div>' +
      '<div class="sub">↻ ' + when + '</div>' +
      '<div class="note">' + esc(cfg.schedule.note || '') + '<br>规则来源：' + esc(cfg.schedule.scheduleSource || '') + '（' + esc(cfg.schedule.scheduleUpdated || '') + '，可在 whale\\config.json 修改）</div>'
    );
  }

  /* ---------- 余额模式内容 ---------- */

  function fmtMoney(n, cur) {
    const sym = cur === 'CNY' ? '¥' : (cur === 'USD' ? '$' : (cur || '') + ' ');
    return sym + Number(n || 0).toFixed(2);
  }
  function balanceContent() {
    if (balance.status === 'loading') return '<div class="sub">正在查询余额…</div>';
    if (balance.status === 'none') {
      return '<div class="row"><span>余额</span><span class="act" data-act="refresh">立即查询</span></div>' +
        '<div class="sub">点击「立即查询」获取真实余额<br><span class="note">需先填 whale\\config.json 的 apiKey 并启动代理</span></div>';
    }
    if (balance.status === 'err') {
      const head = balance.error === 'proxy_down' ? '本地服务未启动' : '余额获取失败';
      return '<div class="row"><span>余额</span><span class="act" data-act="refresh">重试</span></div>' +
        '<div class="bad">' + esc(head) + '</div>' +
        '<div class="sub">' + esc(balance.hint || balance.error || '') + '</div>' +
        (balance.detail ? '<div class="note">' + esc(String(balance.detail).slice(0, 160)) + '</div>' : '');
    }
    const d = balance.data || {};
    const infos = d.balance_infos || [];
    const cur = infos.length ? infos[0].currency : 'CNY';
    const total = infos.reduce((s, i) => s + Number(i.total_balance || 0), 0);
    const topped = infos.reduce((s, i) => s + Number(i.topped_up_balance || 0), 0);
    const granted = infos.reduce((s, i) => s + Number(i.granted_balance || 0), 0);
    const avail = d.is_available;
    const st = '<span class="' + (avail ? 'ok' : 'bad') + '">' + (avail ? '✓ 可调用' : '✗ 不可用/欠费') + '</span>';
    const t = new Date(balance.fetchedAt);
    const hm = (t.getHours() < 10 ? '0' : '') + t.getHours() + ':' + (t.getMinutes() < 10 ? '0' : '') + t.getMinutes() + ':' + (t.getSeconds() < 10 ? '0' : '') + t.getSeconds();
    return '<div class="row"><span>真实余额</span>' + st + '</div>' +
      '<div class="big">' + esc(fmtMoney(total, cur)) + '</div>' +
      '<div class="row sub"><span>充值 ' + esc(fmtMoney(topped, cur)) + '</span><span>赠送 ' + esc(fmtMoney(granted, cur)) + '</span></div>' +
      '<div class="row sub"><span>更新于 ' + hm + '</span><span class="act" data-act="refresh">↻ 刷新</span></div>';
  }

  /* ---------- 台词模式内容（带 ‹ › 切换按钮） ---------- */

  function stepLine(d) {
    const ls = cfg.lines && cfg.lines.length ? cfg.lines : DEFAULT_CFG.lines;
    lineIdx = ((lineIdx + d) % ls.length + ls.length) % ls.length;
    lastNav = Date.now();
    render();
  }
  function linesContent() {
    const ls = cfg.lines && cfg.lines.length ? cfg.lines : DEFAULT_CFG.lines;
    lineIdx = ((lineIdx % ls.length) + ls.length) % ls.length;
    const txt = ls[lineIdx];
    return '<div class="linewrap">' +
      '<button class="linebtn" data-act="line-prev" title="上一条">‹</button>' +
      '<div class="linetext">“' + esc(txt) + '”</div>' +
      '<button class="linebtn" data-act="line-next" title="下一条">›</button>' +
      '</div>' +
      '<div class="linesub">台词 ' + (lineIdx + 1) + ' / ' + ls.length + '（点 ‹ › 切换）</div>';
  }

  /* ---------- render ---------- */

  function bubbleBody() {
    if (mode === 0) return peakContent();
    if (mode === 1) return balanceContent();
    return linesContent();
  }
  function render() {
    applyPos();
    root.innerHTML = '';
    const chipColor = ['#4b6cff', '#2f9e6e', '#c05fd0'];
    if (collapsed) {
      const mini = document.createElement('div');
      mini.className = 'mini';
      mini.title = '鲸鱼娘（点我展开）';
      // 优先显示收起态专属图片 deepseek_whale_girl.png；加载失败回退 🐋
      const img = document.createElement('img');
      img.alt = '展开';
      img.onerror = () => {
        img.style.display = 'none';
        const em = document.createElement('div');
        em.className = 'emoji';
        em.textContent = '🐋';
        mini.appendChild(em);
      };
      img.src = PROXY + '/whale-mini.png';
      mini.appendChild(img);
      root.appendChild(mini);
      return;
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML =
      '<div class="headrow"><span class="chip" style="background:' + chipColor[mode] + '">' + MODES[mode] + '</span>' +
      '<div class="btns"><button data-act="collapse" title="收起">−</button></div></div>' +
      '<div class="body"></div>';
    bubble.querySelector('.body').innerHTML = bubbleBody();
    if (proxyOk === false) {
      bubble.innerHTML += '<div class="proxynote">⚠ 本地代理未启动(127.0.0.1:8790)：双击 whale\\启动鲸鱼娘.cmd；峰谷与台词仍可用</div>';
    }
    if (!seenTip) {
      bubble.innerHTML += '<div class="tipnote">点鲸鱼图标切换模式 · 点 ‹ › 切台词 · 拖动可移动</div>';
      seenTip = true; writeLS(LS.tip, '1');
    }
    root.appendChild(bubble);
    // 图标（加大；点它才切换模式；不动随气泡高度移动）
    const whale = document.createElement('div');
    whale.className = 'whale';
    whale.title = '点我切换：峰谷 / 余额 / 台词';
    const img = document.createElement('img');
    img.alt = '鲸鱼娘';
    img.onload = () => { img.style.display = ''; };
    img.onerror = () => {
      img.style.display = 'none';
      if (!whale.querySelector('.emoji')) {
        const em = document.createElement('div');
        em.className = 'emoji';
        em.textContent = '🐳';
        em.title = '未找到 whale-girl.png：请把图片放到 whale 文件夹';
        whale.appendChild(em);
      }
    };
    img.src = PROXY + '/whale-girl.png';
    whale.appendChild(img);
    root.appendChild(whale);
    finalizePos();
  }
  function cycleMode() {
    mode = (mode + 1) % MODES.length;
    writeLS(LS.mode, String(mode));
    if (mode === 1) loadBalance();
    render();
  }

  /* ---------- 拖拽 & 点击 ---------- */

  (function initDrag() {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, pid = null;
    let suppressClick = false;
    let downOnWhale = false; // pointerdown 是否落在图标上（pointer capture 会重定向 click 目标，故不能用 e.target 判断）
    root.addEventListener('pointerdown', (e) => {
      downOnWhale = !!e.target.closest('.whale');
      if (e.target.closest('[data-act]')) return;
      dragging = true; moved = false; suppressClick = false;
      sx = e.clientX; sy = e.clientY;
      ox = pos.x; oy = pos.y;
      root.setPointerCapture && root.setPointerCapture(e.pointerId);
      pid = e.pointerId;
      root.classList.add('dragging');
    });
    root.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 5) moved = true;
      if (moved) {
        pos.x = ox + dx; pos.y = oy + dy;
        applyPos();
      }
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('dragging');
      if (moved) { savePos(); suppressClick = true; }
      moved = false;
    };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; } // 刚拖拽过：忽略这次点击
      const a = e.target.closest('[data-act]');
      if (a) {
        const act = a.dataset.act;
        if (act === 'collapse') { collapsed = true; writeLS(LS.collapsed, '1'); render(); }
        else if (act === 'refresh') loadBalance();
        else if (act === 'line-prev') stepLine(-1);
        else if (act === 'line-next') stepLine(1);
        return;
      }
      // 只有按下时在【图标】上才循环切换模式；点气泡空白处不做任何事
      if (collapsed) { collapsed = false; writeLS(LS.collapsed, '0'); render(); }
      else if (downOnWhale) cycleMode();
    });
  })();

  /* ---------- 定时器 ---------- */

  const lineTimer = setInterval(() => {
    if (!collapsed && mode === 2) {
      const pauseMs = Math.max(2, cfg.linesIntervalSec || 6) * 1000 * 2;
      if (Date.now() - lastNav > pauseMs) { lineIdx++; render(); }
    }
  }, Math.max(2, cfg.linesIntervalSec || 6) * 1000);

  const tick = setInterval(() => {
    if (collapsed) return;
    if (mode === 0) { render(); return; }
    if (mode === 1 && balance.status !== 'loading') {
      const refreshMs = (cfg.refreshIntervalMin || 10) * 60000;
      const now = Date.now();
      const dueStale = balance.status === 'ok' && balance.fetchedAt && now - balance.fetchedAt > refreshMs;
      const dueErr = balance.status === 'err' && now - (balance.lastAttempt || 0) > refreshMs;
      const never = balance.status === 'none';
      if ((dueStale || dueErr || never) && now - (balance.lastAttempt || 0) > 20000) loadBalance();
    }
  }, 15000);

  /* ---------- boot ---------- */

  window.addEventListener('unload', () => { clearInterval(lineTimer); clearInterval(tick); });
  if (mode === 1) loadBalance();
  loadConfig();
  render();
})();
