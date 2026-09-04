#!/usr/bin/env node
/*
 * 鲸鱼娘 DeepSeek 状态浮窗 —— 本地代理 (127.0.0.1:8790)
 *
 * 职责：
 *   GET /api/balance   带 config.apiKey 转发官方 https://api.deepseek.com/user/balance
 *   GET /api/config    返回 config.json（剥离 apiKey）
 *   GET /whale-girl.png 提供鲸鱼娘图片（用户替换文件即生效）
 *   GET /widget.js     返回注入组件源码（可选，供调试）
 *   GET /              状态页（提示各端点与配置状态）
 *
 * API Key 只存在于本机 config.json，永不发给浏览器 / 页面。
 * 所有响应带 CORS 头，仅绑定 127.0.0.1。
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CONFIG_PATH = path.join(DIR, 'config.json');
const PNG_PATH = path.join(DIR, 'whale-girl.png');
const MINI_PNG_PATH = path.join(DIR, 'deepseek_whale_girl.png'); // 收起(最小化)态图标
const WIDGET_PATH = path.join(DIR, 'widget.js');
const BALANCE_API = 'https://api.deepseek.com/user/balance';

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { proxyPort: 8790, apiKey: '' };
  }
}

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return 'sk-***';
  return key.slice(0, 6) + '***' + key.slice(-4);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function fetchBalance(apiKey) {
  return new Promise((resolve) => {
    const u = new URL(BALANCE_API);
    const req = https.request(
      u,
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          Accept: 'application/json',
        },
        timeout: 15000,
      },
      (res) => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(chunks);
          } catch (_) {
            /* not json */
          }
          resolve({ status: res.statusCode, body: parsed || chunks });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: { error: String(e.message || e) } }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: { error: 'timeout' } });
    });
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    corsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const cfg = readConfig();

  if (p === '/api/balance') {
    if (!cfg.apiKey) {
      sendJson(res, 200, {
        ok: false,
        error: 'no_api_key',
        hint: '请在 whale/config.json 中填写 sk- 开头的 DeepSeek API Key',
      });
      return;
    }
    const r = await fetchBalance(cfg.apiKey);
    if (r.status === 200) {
      sendJson(res, 200, { ok: true, data: r.body, ts: Date.now() });
    } else {
      const statusText = r.status || 'network_error';
      let hint = '余额接口请求失败';
      if (r.status === 401) hint = 'API Key 无效，请检查 whale/config.json 中的 apiKey';
      if (r.status === 402) hint = '余额不足或不可用（官方返回 402）';
      sendJson(res, 200, {
        ok: false,
        error: 'upstream_error',
        status: statusText,
        detail: r.body,
        hint,
      });
    }
    return;
  }

  if (p === '/api/config') {
    const publicCfg = Object.assign({}, cfg);
    delete publicCfg.apiKey;
    sendJson(res, 200, Object.assign({ ok: true }, publicCfg));
    return;
  }

  if (p === '/whale-girl.png') {
    if (!fs.existsSync(PNG_PATH)) {
      sendJson(res, 404, {
        ok: false,
        error: 'png_missing',
        hint: '请把鲸鱼娘图片命名为 whale-girl.png 放到 whale 文件夹',
      });
      return;
    }
    corsHeaders(res);
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(PNG_PATH).pipe(res);
    return;
  }

  if (p === '/whale-mini.png') {
    if (!fs.existsSync(MINI_PNG_PATH)) {
      sendJson(res, 404, {
        ok: false,
        error: 'mini_png_missing',
        hint: '请把收起态图标命名为 deepseek_whale_girl.png 放到 whale 文件夹',
      });
      return;
    }
    corsHeaders(res);
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(MINI_PNG_PATH).pipe(res);
    return;
  }

  if (p === '/widget.js') {
    if (!fs.existsSync(WIDGET_PATH)) {
      sendJson(res, 404, { ok: false, error: 'widget_missing' });
      return;
    }
    corsHeaders(res);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    fs.createReadStream(WIDGET_PATH).pipe(res);
    return;
  }

  if (p === '/') {
    corsHeaders(res);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const hasPng = fs.existsSync(PNG_PATH);
    const hasKey = !!(cfg.apiKey || '').trim();
    const host =
      req.headers.host || '127.0.0.1:' + cfg.proxyPort;
    res.end(
      [
        'whale proxy is running',
        '',
        'endpoints:',
        '  GET /api/config      (public config, no apiKey)',
        '  GET /api/balance     (real balance, needs apiKey)',
        '  GET /whale-girl.png  ' + (hasPng ? '(ok)' : '(missing: place whale-girl.png)'),
        '  GET /whale-mini.png  ' + (fs.existsSync(MINI_PNG_PATH) ? '(ok)' : '(missing: place deepseek_whale_girl.png)'),
        '  GET /widget.js       ' + (fs.existsSync(WIDGET_PATH) ? '(ok)' : '(missing)'),
        '',
        'config: apiKey ' + (hasKey ? maskKey(cfg.apiKey) : '(empty)') + ', port ' + cfg.proxyPort,
        'open in browser: http://' + host + '/',
      ].join('\n')
    );
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
});

const port = readConfig().proxyPort || 8790;
const srv = server.listen(port, '127.0.0.1', () => {
  console.log('[whale-proxy] listening on http://127.0.0.1:' + port);
});
srv.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('[whale-proxy] ERROR: port ' + port + ' is already in use.');
    console.error('[whale-proxy] A proxy instance may already be running.');
    console.error('[whale-proxy] Check http://127.0.0.1:' + port + '/ or close the other window.');
  } else {
    console.error('[whale-proxy] ERROR:', e && e.message);
  }
  process.exit(1);
});
