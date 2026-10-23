/* hexo-theme-tty */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式等情况下不可用，忽略 */ }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
    return Promise.resolve();
  }

  function flash(el, text) {
    var original = el.textContent;
    el.textContent = text;
    setTimeout(function () { el.textContent = original; }, 1500);
  }

  // ---------- 深浅色 ----------

  function currentScheme() {
    var set = root.getAttribute('data-scheme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  $$('.js-scheme').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = currentScheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-scheme', next);
      store('tty-scheme', next);
    });
  });

  // ---------- 搜索 ----------

  var dialog = $('#search');
  var openSearch = function () {};

  if (dialog) {
    var input = $('input', dialog);
    var list = $('.search-results', dialog);
    var index = null;
    var loading = null;
    var selected = -1;

    var escapeHTML = function (s) {
      return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
      });
    };

    var highlight = function (text, terms) {
      var html = escapeHTML(text);
      terms.forEach(function (t) {
        var re = new RegExp(escapeHTML(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        html = html.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
      });
      return html;
    };

    var snippet = function (content, terms) {
      var lower = content.toLowerCase();
      var at = -1;
      for (var i = 0; i < terms.length && at < 0; i++) at = lower.indexOf(terms[i]);
      if (at < 0) return content.slice(0, 80);
      var start = Math.max(0, at - 30);
      return (start ? '…' : '') + content.slice(start, at + 70) + '…';
    };

    var load = function () {
      if (!loading) {
        loading = fetch(dialog.getAttribute('data-src'))
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (data) {
            index = data.map(function (p) {
              p._title = (p.title || '').toLowerCase();
              p._body = ((p.tags || []).join(' ') + ' ' + (p.content || '')).toLowerCase();
              return p;
            });
          })
          .catch(function () { loading = null; throw new Error('failed'); });
      }
      return loading;
    };

    var select = function (i) {
      var items = $$('li[role="option"]', list);
      if (!items.length) { selected = -1; return; }
      selected = (i + items.length) % items.length;
      items.forEach(function (li, n) { li.setAttribute('aria-selected', n === selected ? 'true' : 'false'); });
      items[selected].scrollIntoView({ block: 'nearest' });
    };

    var message = function (text) {
      list.innerHTML = '<li class="r-empty">' + escapeHTML(text) + '</li>';
      selected = -1;
    };

    var render = function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { list.innerHTML = ''; selected = -1; return; }
      if (!index) {
        message(dialog.getAttribute('data-loading'));
        load().then(render, function () { message(dialog.getAttribute('data-failed')); });
        return;
      }
      var terms = q.split(/\s+/);
      var hits = [];
      index.forEach(function (p) {
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          var inTitle = p._title.indexOf(terms[i]) >= 0;
          if (!inTitle && p._body.indexOf(terms[i]) < 0) return;
          score += inTitle ? 10 : 1;
        }
        hits.push({ p: p, score: score });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      if (!hits.length) { message(dialog.getAttribute('data-empty')); return; }
      list.innerHTML = hits.slice(0, 20).map(function (h) {
        var p = h.p;
        return '<li role="option" aria-selected="false"><a href="' + escapeHTML(p.url) + '">'
          + '<span class="r-title">' + highlight(p.title || '', terms) + '</span>'
          + '<span class="r-meta">' + escapeHTML(p.date || '') + (p.tags && p.tags.length ? ' · #' + escapeHTML(p.tags.join(' #')) : '') + '</span>'
          + '<span class="r-snippet">' + highlight(snippet(p.content || '', terms), terms) + '</span>'
          + '</a></li>';
      }).join('');
      select(0);
    };

    openSearch = function () {
      if (dialog.open) return;
      dialog.showModal();
      input.select();
      load().catch(function () {});
    };

    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
      else if (e.key === 'Enter') {
        var link = $('li[aria-selected="true"] a', list);
        if (link) { e.preventDefault(); location.href = link.href; }
      }
    });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('li[role="option"]');
      if (li) select($$('li[role="option"]', list).indexOf(li));
    });
    // 点到对话框外的遮罩时关闭
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

    $$('.js-search').forEach(function (btn) { btn.addEventListener('click', openSearch); });
  }

  // ---------- 快捷键 ----------

  var keyLinks = {};
  $$('[data-key]').forEach(function (el) { keyLinks[el.getAttribute('data-key').toLowerCase()] = el; });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (dialog && dialog.open) return;
    var key = e.key.toLowerCase();
    if (key === '/' || (key === 's' && keyLinks.s)) { e.preventDefault(); openSearch(); return; }
    var target = keyLinks[key];
    if (!target) return;
    e.preventDefault();
    target.click();
  });

  // ---------- 文章页：代码块、目录、进度 ----------

  var prose = $('.prose');

  $$('.prose figure.highlight').forEach(function (fig) {
    var lang = fig.className.replace(/\bhighlight\b/, '').trim();
    var head = document.createElement('div');
    head.className = 'code-head';
    var name = document.createElement('span');
    name.textContent = lang && lang !== 'plaintext' && lang !== 'plain' ? lang : 'text';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = document.body.getAttribute('data-copy');
    btn.addEventListener('click', function () {
      var code = $('td.code pre', fig) || $('pre', fig);
      var lines = $$('.line', code);
      var text = lines.length ? lines.map(function (l) { return l.textContent; }).join('\n') : code.textContent;
      copyText(text).then(function () { flash(btn, document.body.getAttribute('data-copied')); });
    });
    head.appendChild(name);
    head.appendChild(btn);
    fig.insertBefore(head, fig.firstChild);
  });

  $$('.js-copy-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(location.href.split('#')[0]).then(function () { flash(btn, btn.getAttribute('data-done')); });
    });
  });

  var tree = $('.tree');
  var narrow = window.matchMedia('(max-width: 860px)');
  if (tree && narrow.matches) tree.open = false;

  var tocLinks = $$('.tree .toc-link');
  var headings = tocLinks.map(function (a) {
    return document.getElementById(decodeURIComponent(a.hash.slice(1)));
  });
  var bar = $('.progress .bar');
  var pct = $('.progress .pct');
  var asideTitle = $('.aside-title');
  var postHead = $('.post-head');

  function onScroll() {
    if (prose && bar) {
      // 正文底部进入视口底部算读完；正文后面的内容不够长、滚不到那里时，以页面滚到底为准
      var scrolled = window.scrollY;
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      var end = Math.min(prose.getBoundingClientRect().bottom + scrolled - window.innerHeight, maxScroll);
      var p = end > 0 ? Math.min(1, Math.max(0, scrolled / end)) : 1;
      bar.style.setProperty('--p', p.toFixed(4));
      pct.textContent = String(Math.round(p * 100)).padStart(2, '0') + '%';
    }
    if (asideTitle && postHead) asideTitle.hidden = postHead.getBoundingClientRect().bottom > 0;
    if (tocLinks.length) {
      var active = -1;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i] && headings[i].getBoundingClientRect().top < window.innerHeight * 0.3) active = i;
      }
      tocLinks.forEach(function (a, n) { a.classList.toggle('on', n === active); });
    }
  }

  if (prose) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; onScroll(); });
    }, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  // ---------- 图片放大 ----------

  if (root.hasAttribute('data-zoom') && prose) {
    root.classList.add('zoomable');
    prose.addEventListener('click', function (e) {
      var img = e.target.closest('img');
      if (!img || img.closest('a')) return;
      var layer = document.createElement('div');
      layer.className = 'zoom';
      var big = document.createElement('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      layer.appendChild(big);
      var close = function () { layer.remove(); document.removeEventListener('keydown', onKey); };
      var onKey = function (ev) { if (ev.key === 'Escape') close(); };
      layer.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(layer);
    });
  }

  // ---------- 404：显示访问的路径 ----------

  $$('.js-path').forEach(function (el) { el.textContent = decodeURIComponent(location.pathname); });
})();
