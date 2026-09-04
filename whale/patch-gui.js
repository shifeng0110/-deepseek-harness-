#!/usr/bin/env node
/*
 * 鎶婇哺楸煎宓屽叆 GUI 鏈綋锛氱粰 dsh-web-frontend 鐨?dist/index.html 娉ㄥ叆
 * <script src="/whale-widget.js"> 骞舵妸 whale/widget.js 澶嶅埗杩?dist銆? *
 * 鐢ㄦ硶锛堝湪 whale 鐩綍涓嬶級锛? *   node patch-gui.js patch    宓屽叆锛堝箓绛夛紝鍙噸澶嶆墽琛岋級
 *   node patch-gui.js unpatch  绉婚櫎宓屽叆
 *   node patch-gui.js status   鏌ョ湅鍚勫€欓€?dist 鐨勭姸鎬? *
 * 璇存槑锛? *   - 鍊欓€夎矾寰勮鐩栨湰鏈?web profile 涓?npx 瀹夎涓や唤 dist锛? *   - dsh 鍗囩骇/閲嶈 npm 鍖呭悗闇€閲嶈窇涓€娆?patch锛? *   - 鍙姩涓ゅ锛歩ndex.html 鍔犱竴琛岃剼鏈?+ 澶嶅埗涓€涓?js 鏂囦欢锛堝潎甯︽爣璁帮紝鍙€嗭級銆? */
'use strict';
const fs = require('fs');
const path = require('path');

const MARK = '<!-- dsh-whale-embed -->';
const SCRIPT = MARK + '\n    <script src="/whale-widget.js"></script>';
// Dist candidates are resolved generically (no machine-specific paths):
//  1. DSH_WHALE_DISTS (optional, ';'-separated explicit dist dirs)
//  2. %USERPROFILE%\\.dsh\\profiles\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist
//  3. \\profiles\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist (if DSH_HOME set)
const CANDIDATES = (process.env.DSH_WHALE_DISTS || '').split(';').filter(Boolean).concat([
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'),
  (process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist') : null),
].filter(Boolean));

function dists() {
  return CANDIDATES.map((d) => ({ d, index: path.join(d, 'index.html') })).filter((x) => fs.existsSync(x.index));
}

function patchOne({ d, index }) {
  let html = fs.readFileSync(index, 'utf8');
  fs.copyFileSync(path.join(__dirname, 'widget.js'), path.join(d, 'whale-widget.js')); // 濮嬬粓鍒锋柊鍓湰
  if (html.includes(MARK)) {
    console.log('[patch]  already patched, whale-widget.js refreshed: ' + index);
    return;
  }
  if (!html.includes('</body>')) {
    console.log('[patch]  WARN no </body>, skip: ' + index);
    return;
  }
  html = html.replace('</body>', SCRIPT + '\n  </body>');
  fs.writeFileSync(index, html, 'utf8');
  console.log('[patch]  patched: ' + index + ' (+whale-widget.js)');
}

function unpatchOne({ d, index }) {
  let html = fs.readFileSync(index, 'utf8');
  if (html.includes(MARK)) {
    html = html.replace(new RegExp('\\s*' + MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<script src="/whale-widget.js"></script>', ''), '');
    fs.writeFileSync(index, html, 'utf8');
    console.log('[patch]  unpatched: ' + index);
  }
  const w = path.join(d, 'whale-widget.js');
  if (fs.existsSync(w)) { fs.unlinkSync(w); console.log('[patch]  removed: ' + w); }
}

function status() {
  const list = dists();
  if (!list.length) { console.log('[patch]  no candidate dist found'); return; }
  for (const { d, index } of list) {
    const html = fs.readFileSync(index, 'utf8');
    const w = path.join(d, 'whale-widget.js');
    console.log(
      '[patch]  ' + d +
      '\n         index.html: ' + (html.includes(MARK) ? 'PATCHED' : 'clean') +
      ' | whale-widget.js: ' + (fs.existsSync(w) ? 'present' : 'absent')
    );
  }
}

const cmd = process.argv[2] || 'status';
if (cmd === 'patch') dists().forEach(patchOne);
else if (cmd === 'unpatch') dists().forEach(unpatchOne);
else if (cmd === 'status') status();
else { console.error('usage: node patch-gui.js patch|unpatch|status'); process.exit(1); }
