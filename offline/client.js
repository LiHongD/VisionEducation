/* Offline-only adapter, injected by the local server; no hosted-site changes. */
(() => {
  let info;
  const oldGate = window.teacherGate;
  window.teacherGate = function () {
    if (session && !session.isTeacher) {
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
      return '<section class="panel panel-pad"><span class="eyebrow">校园本地课堂</span><h2>' + (local ? '请从启动文件恢复教师登录。' : '请在教师电脑打开教师端。') + '</h2><p>' + (local ? '课堂数据仍保存在本机。请双击当前程序文件夹中的“启动系统.vbs”（或“启动系统.cmd”），它会重新打开已登录的教师工作台。请勿从其他版本的文件夹启动。' : '这是学生局域网入口。教师请在自己的电脑双击“启动系统”，学生使用课堂码加入。') + '</p><p>无需注册或登录 ChatGPT 账号。</p><div class="work-actions"><button class="primary" onclick="loadSession()">我已重新启动，检查登录</button><a href="#classroom">进入学生端 →</a></div></section>';
    }
    return oldGate();
  };
  const oldApi = window.api;
  window.api = async function (...args) {
    try { const data = await oldApi(...args); if (args[0] === 'session' && info) { info.isTeacher = data.isTeacher; show(); } return data; }
    catch (error) {
      if (error.status === 401 && (portal === 'teacher' || portal === 'showcase')) {
        session = { user: null, isTeacher: false, allowGuests: true };
        if (info) info.isTeacher = false;
        queueMicrotask(() => route());
      }
      throw error;
    }
  };
  const style = document.createElement('style');
  style.textContent = '#offline-status{padding:10px 24px;border-bottom:1px solid #d9e2db;background:#eaf0e8;color:#245244;font-size:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}#offline-status a{color:#245244}#offline-status button{background:#fff;border:1px solid #b9cbbd;border-radius:5px;padding:3px 8px;font:inherit}#offline-status code{user-select:all;font-size:12px}';
  document.head.appendChild(style);
  function show() {
    if (!info) return;
    let bar = document.getElementById('offline-status');
    if (!bar) { bar = document.createElement('div'); bar.id = 'offline-status'; document.querySelector('main').prepend(bar); }
    const teacher = info.isTeacher, urls = info.studentUrls || [];
    const content = '<b>● 校园本地课堂</b><span>无需外网 · 数据保存在教师电脑</span>' + (teacher ? '<a href="/__local/control" target="_blank">系统管理 / 数据备份 ↗</a>' + (urls[0] ? '<span>学生入口：<code>' + urls[0] + '</code></span><button id="offline-copy-url">复制地址</button>' : '<span>尚未检测到局域网，请连接机房网络后重新打开系统管理。</span>') : '');
    if (bar.innerHTML !== content) {
      bar.innerHTML = content;
      const button = document.getElementById('offline-copy-url');
      if (button) button.onclick = async () => { try { await navigator.clipboard.writeText(urls[0]); toast('已复制学生入口'); } catch { prompt('复制下面的学生访问地址：', urls[0]); } };
    }
  }
  fetch('/__local/info').then(r => r.json()).then(value => { info = value; show(); if (location.hash === '#teacher' && session && !session.isTeacher) route(); }).catch(() => {});
  new MutationObserver(show).observe(document.querySelector('main'), { childList: true });
})();
