#!/usr/bin/env node
/*
 * 从 widget.js 生成分发文件：
 *   whale.user.js  —— Tampermonkey 安装用（脚本头 + 组件本体）
 *   inject-demo.js —— 控制台临时注入用（说明头 + 组件本体）
 * 改过 widget.js 后运行：node build-dist.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const core = fs.readFileSync(path.join(DIR, 'widget.js'), 'utf8');

const tmHeader = `// ==UserScript==
// @name         鲸鱼娘 · DeepSeek 状态浮窗
// @namespace    dsh-whale
// @version      0.1.0
// @description  DeepSeek Harness GUI 悬浮鲸鱼娘：点击切换 峰谷/余额/台词，可拖动（依赖本地代理 whale/proxy.js，端口 8790）
// @match        http://127.0.0.1:3080/*
// @match        https://127.0.0.1:3080/*
// @match        http://localhost:3080/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

`;

const demoHeader = `/* 鲸鱼娘 · DeepSeek 状态浮窗 —— 控制台临时注入版
 * 用法：复制本文件全部内容，粘贴到 GUI 页面 F12 控制台回车即可。
 * 刷新页面后需重新粘贴；长期使用请装 Tampermonkey 版 whale.user.js。
 * 依赖本地代理：先双击 whale\\启动鲸鱼娘.cmd（127.0.0.1:8790）。
 */
`;

fs.writeFileSync(path.join(DIR, 'whale.user.js'), tmHeader + core, 'utf8');
fs.writeFileSync(path.join(DIR, 'inject-demo.js'), demoHeader + core, 'utf8');
console.log('[build-dist] whale.user.js  ' + (tmHeader.length + core.length) + ' bytes');
console.log('[build-dist] inject-demo.js ' + (demoHeader.length + core.length) + ' bytes');
