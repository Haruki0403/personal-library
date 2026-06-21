/*
 * 个人图书馆 · 侦探白板 — 4 modes: graph / list / search / random
 */
(function () {
    'use strict';

    /* ========================================
       DOM refs
       ======================================== */
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const sections = {
        graph:  $('#modeGraph'),
        list:   $('#modeList'),
        search: $('#modeSearch'),
        random: $('#modeRandom'),
    };
    const navLinks = $$('.nav-link');
    const cyContainer = $('#cy');
    const emptyState = $('#emptyState');
    const detailPanel = $('#detailPanel');
    const detailContent = $('#detailContent');
    const cardModal = $('#cardModal');
    const cardForm = $('#cardForm');
    const cardType = $('#cardType');
    const dynamicFields = $('#dynamicFields');
    const tagsContainer = $('#tagsContainer');

    let cy = null, allCards = [], allConnections = [], tags = [], currentMode = 'graph';

    /* ========================================
       Mode switching
       ======================================== */
    function setMode(mode) {
        currentMode = mode;
        Object.keys(sections).forEach(k => {
            if (sections[k]) sections[k].style.display = k === mode ? '' : 'none';
        });
        navLinks.forEach(l => {
            l.classList.toggle('active', l.dataset.mode === mode);
        });
        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url);

        if (mode === 'list') renderCardWall();
        if (mode === 'random') triggerRandom();
        if (mode === 'graph' && cy) cy.resize();
    }

    navLinks.forEach(link => {
        if (!link.dataset.mode) return; // Skip non-mode links (login, etc.)
        link.addEventListener('click', (e) => {
            e.preventDefault();
            setMode(link.dataset.mode);
        });
    });

    // Read initial mode from URL
    const params = new URLSearchParams(window.location.search);
    const initMode = params.get('mode') || 'graph';
    setMode(initMode);

    /* ========================================
       Clue rotation
       ======================================== */
    const clues = [
        '「还没有连线等着被发现」',
        '「一条线索连接另一条线索」',
        '「每个节点都是一扇门」',
        '「侦探不急于下结论」',
        '「线索藏在细节里」',
        '「看似无关的，往往最有关」'
    ];
    let clueIdx = 0;
    const clueText = $('#clueText');
    if (clueText) {
        clueText.style.transition = 'opacity 300ms';
        setInterval(() => {
            clueIdx = (clueIdx + 1) % clues.length;
            clueText.style.opacity = '0';
            setTimeout(() => { clueText.textContent = clues[clueIdx]; clueText.style.opacity = '1'; }, 300);
        }, 15000);
    }

    /* ========================================
       Modal
       ======================================== */
    function openModal() { cardModal.setAttribute('aria-hidden', 'false'); cardType.focus(); }
    function closeModal() {
        cardModal.setAttribute('aria-hidden', 'true');
        cardForm.reset(); dynamicFields.innerHTML = ''; tags = []; renderTags();
    }
    $('#fabAdd')?.addEventListener('click', openModal);
    $('#addFirstCard')?.addEventListener('click', openModal);
    cardModal?.querySelector('.modal-cancel').addEventListener('click', closeModal);
    cardModal?.addEventListener('click', e => { if (e.target === cardModal) closeModal(); });

    /* ========================================
       Dynamic form fields
       ======================================== */
    const typeFields = {
        book: `<div class="form-group"><label for="fieldTitle">书名 *</label><input type="text" id="fieldTitle" name="title" required placeholder="书名…"></div>
               <div class="form-group"><label for="fieldAuthor">作者</label><input type="text" id="fieldAuthor" name="author" placeholder="作者…"></div>
               <div class="form-group"><label for="fieldStatus">阅读状态</label><select id="fieldStatus" name="status"><option value="reading">在读</option><option value="read">已读</option><option value="want">想读</option></select></div>
               <div class="form-group"><label for="fieldNotes">笔记/评价</label><textarea id="fieldNotes" name="notes" rows="5" placeholder="写下你的想法…（支持 Markdown）"></textarea></div>`,
        music: `<div class="form-group"><label for="fieldTitle">专辑/曲目名 *</label><input type="text" id="fieldTitle" name="title" required placeholder="专辑或曲目名…"></div>
                <div class="form-group"><label for="fieldArtist">艺术家</label><input type="text" id="fieldArtist" name="artist" placeholder="艺术家…"></div>
                <div class="form-group"><label for="fieldGenre">曲风/流派</label><input type="text" id="fieldGenre" name="genre" placeholder="流派…"></div>
                <div class="form-group"><label for="fieldYear">发行年份</label><input type="number" id="fieldYear" name="year" placeholder="2026"></div>
                <div class="form-group"><label for="fieldNotes">感悟</label><textarea id="fieldNotes" name="notes" rows="5" placeholder="写下你的感悟…（支持 Markdown）"></textarea></div>`,
        film: `<div class="form-group"><label for="fieldTitle">电影名 *</label><input type="text" id="fieldTitle" name="title" required placeholder="电影名…"></div>
               <div class="form-group"><label for="fieldDirector">导演</label><input type="text" id="fieldDirector" name="director" placeholder="导演…"></div>
               <div class="form-group"><label for="fieldYear">年份</label><input type="number" id="fieldYear" name="year" placeholder="2026"></div>
               <div class="form-group"><label for="fieldRating">评分 (1-10)</label><input type="range" id="fieldRating" name="rating" min="1" max="10" value="7"><span id="ratingValue" style="font-family:var(--font-display);color:var(--color-film)">7</span></div>
               <div class="form-group"><label for="fieldNotes">评价</label><textarea id="fieldNotes" name="notes" rows="5" placeholder="写下你的评价…（支持 Markdown）"></textarea></div>`,
        game: `<div class="form-group"><label for="fieldTitle">游戏名 *</label><input type="text" id="fieldTitle" name="title" required placeholder="游戏名…"></div>
               <div class="form-group"><label for="fieldPlatform">平台</label><input type="text" id="fieldPlatform" name="platform" placeholder="PS / Switch / PC / 其他…"></div>
               <div class="form-group"><label for="fieldGenre">类型</label><input type="text" id="fieldGenre" name="gameGenre" placeholder="游戏类型…"></div>
               <div class="form-group"><label for="fieldStatus">游玩状态</label><select id="fieldStatus" name="status"><option value="playing">在玩</option><option value="done">通关</option><option value="dropped">弃了</option></select></div>
               <div class="form-group"><label for="fieldNotes">感想</label><textarea id="fieldNotes" name="notes" rows="5" placeholder="写下你的感想…（支持 Markdown）"></textarea></div>`,
        writing: `<div class="form-group"><label for="fieldTitle">标题 *</label><input type="text" id="fieldTitle" name="title" required placeholder="标题…"></div>
                  <div class="form-group"><label for="fieldGenre">体裁</label><input type="text" id="fieldGenreW" name="writingGenre" placeholder="随笔 / 短篇 / 诗 / 其他…"></div>
                  <div class="form-group"><label for="fieldNotes">正文</label><textarea id="fieldNotes" name="notes" rows="8" placeholder="开始写作…（支持 Markdown）"></textarea></div>`
    };

    cardType?.addEventListener('change', function () {
        dynamicFields.innerHTML = typeFields[this.value] || '';
        const ri = $('#fieldRating'), rv = $('#ratingValue');
        if (ri && rv) ri.addEventListener('input', () => { rv.textContent = ri.value; });
    });

    /* ========================================
       Tags input
       ======================================== */
    $('#cardTags')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = this.value.trim();
            if (v && !tags.includes(v)) { tags.push(v); renderTags(); }
            this.value = '';
        }
    });

    function renderTags() {
        if (!tagsContainer) return;
        tagsContainer.innerHTML = tags.map(t =>
            `<span class="tag">${t}<span class="tag-remove" data-tag="${t}">&times;</span></span>`).join('');
        tagsContainer.querySelectorAll('.tag-remove').forEach(el => {
            el.addEventListener('click', function () { tags = tags.filter(x => x !== this.dataset.tag); renderTags(); });
        });
    }

    /* ========================================
       Detail panel
       ======================================== */
    function openDetail(html) { detailContent.innerHTML = html; detailPanel.setAttribute('aria-hidden', 'false'); }
    function closeDetail() { detailPanel.setAttribute('aria-hidden', 'true'); }
    detailPanel?.querySelector('.detail-close')?.addEventListener('click', closeDetail);

    /* ========================================
       Form submit
       ======================================== */
    cardForm?.addEventListener('submit', function (e) {
        e.preventDefault();
        const type = cardType.value;
        const fd = new FormData(cardForm);
        const data = { type, title: fd.get('title'), tags, notes: fd.get('notes') };
        if (type === 'book') { data.author = fd.get('author'); data.status = fd.get('status'); }
        else if (type === 'music') { data.artist = fd.get('artist'); data.genre = fd.get('genre'); data.year = fd.get('year'); }
        else if (type === 'film') { data.director = fd.get('director'); data.year = fd.get('year'); data.rating = fd.get('rating'); }
        else if (type === 'game') { data.platform = fd.get('platform'); data.gameGenre = fd.get('gameGenre'); data.status = fd.get('status'); }
        else if (type === 'writing') { data.writingGenre = fd.get('writingGenre'); }
        saveCard(data);
    });

    function saveCard(data) {
        fetch('/api/cards/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(r => r.json())
        .then(card => {
            closeModal();
            allCards.push(card.card);
            if (card.suggested_connections) {
                allConnections.push(...card.suggested_connections);
            }
            if (cy) addNodeToGraph(card.card);
            else initGraph();
            if (emptyState) emptyState.style.display = 'none';
        })
        .catch(err => { console.error(err); alert('保存失败，请重试'); });
    }

    /* ========================================
       Graph (Cytoscape.js)
       ======================================== */
    function getCardColor(type) {
        const map = { book: '#3D5A73', music: '#C68B3C', film: '#B8404A', game: '#5C7A56', writing: '#E8D5B7' };
        return map[type] || '#999';
    }

    function getNodeLabelColor() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return isDark ? '#E8E2D4' : '#2C2416';
    }

    function getCyStyle() {
        return [
            { selector: 'node', style: { 'background-color': 'data(color)', 'label': 'data(label)', 'color': getNodeLabelColor(), 'font-size': '12px', 'font-family': 'STFangsong, FangSong, serif', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6, 'width': 44, 'height': 44, 'border-width': 2, 'border-color': 'data(color)', 'border-opacity': 0.4, 'shape': 'round-rectangle' } },
            { selector: 'edge', style: { 'width': 2, 'line-color': '#B5A894', 'curve-style': 'unbundled-bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#B5A894', 'arrow-scale': 0.6 } },
            { selector: 'edge[confirmed="false"]', style: { 'line-style': 'dashed', 'line-color': '#CCBBAA' } },
            { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#D4844A', 'border-opacity': 1 } }
        ];
    }

    function initGraph() {
        if (!cyContainer) return;
        const confirmed = allConnections.filter(c => c.is_confirmed !== false);

        const nodes = allCards.map(c => ({
            data: { id: c.id, label: c.title, type: c.type, color: getCardColor(c.type), details: c }
        }));
        const edges = confirmed.map(conn => ({
            data: { id: conn.id, source: conn.source_id, target: conn.target_id, reason: conn.reason, confirmed: conn.is_confirmed }
        }));

        if (cy) cy.destroy();
        cy = cytoscape({
            container: cyContainer,
            elements: { nodes, edges },
            style: getCyStyle(),
            layout: { name: 'cose', padding: 60, animate: false },
            wheelSensitivity: 0.3
        });

        cy.on('tap', 'node', function (evt) {
            showCardDetail(evt.target.data('details'));
        });
        cy.on('tap', function (evt) {
            if (evt.target === cy) { closeDetail(); cy.elements().unselect(); }
        });
        cy.on('mouseover', 'edge', function (evt) {
            const reason = evt.target.data('reason');
            if (reason) showTooltip(reason, evt.renderedPosition || evt.target.midpoint());
        });
        cy.on('mouseout', 'edge', () => removeTooltip());

        if (emptyState && allCards.length > 0) emptyState.style.display = 'none';

        // Watch theme changes to update node label color
        new MutationObserver(() => {
            if (cy) {
                cy.style().selector('node').style('color', getNodeLabelColor()).update();
            }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    function addNodeToGraph(card) {
        if (!cy) { initGraph(); return; }
        cy.add({ group: 'nodes', data: { id: card.id, label: card.title, type: card.type, color: getCardColor(card.type), details: card } });
        cy.layout({ name: 'cose', padding: 60, animate: true, animationDuration: 500 }).run();
    }

    let tooltipEl = null;
    function showTooltip(text, pos) {
        removeTooltip();
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'edge-tooltip';
        tooltipEl.textContent = text;
        tooltipEl.style.cssText = `position:absolute;left:${pos.x+10}px;top:${pos.y-30}px;background:var(--color-surface,#F0EBE0);color:var(--color-text,#2C2416);padding:4px 10px;border-radius:var(--radius-sm);font-size:12px;font-family:var(--font-mono);box-shadow:var(--shadow-md);z-index:70;pointer-events:none;white-space:nowrap;`;
        cyContainer.appendChild(tooltipEl);
    }
    function removeTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }

    /* ========================================
       Auth check
       ======================================== */
    function isAuthenticated() {
        const meta = document.querySelector('meta[name="is-authenticated"]');
        return meta && meta.content === 'true';
    }

    /* ========================================
       Card detail rendering
       ======================================== */
    function showCardDetail(card) {
        const labels = { book: '📖 书籍', music: '🎵 音乐', film: '🎬 电影', game: '🎮 游戏', writing: '✍️ 原创' };
        const color = getCardColor(card.type);
        let meta = [];
        if (card.author) meta.push(`作者：${card.author}`);
        if (card.artist) meta.push(`艺术家：${card.artist}`);
        if (card.director) meta.push(`导演：${card.director}`);
        if (card.year) meta.push(`${card.year}`);
        if (card.rating) meta.push(`评分：${card.rating}/10`);
        if (card.status_display) meta.push(card.status_display);
        if (card.platform) meta.push(card.platform);
        if (card.genre) meta.push(card.genre);

        const notes = card.notes || card.body || '';
        const rendered = typeof marked !== 'undefined' ? marked.parse(notes) : notes.replace(/\n/g, '<br>');
        const editBtn = isAuthenticated()
            ? `<button class="btn btn-secondary" onclick="window._editCardById('${card.id}')" style="font-size:13px;padding:2px var(--space-3);position:absolute;top:var(--space-3);right:var(--space-12)">✏️ 编辑</button>`
            : '';

        detailContent.innerHTML = `
            ${editBtn}
            <div style="border-left:4px solid ${color};padding-left:var(--space-4);margin-bottom:var(--space-6)">
                <span style="color:${color};font-family:var(--font-display);font-size:13px">${labels[card.type]||''}</span>
                <h2 style="font-family:var(--font-display);margin:var(--space-2) 0">${card.title}</h2>
                <p style="color:var(--color-text-muted);font-size:14px">${meta.join(' · ')}</p>
                <p style="color:var(--color-text-faint);font-size:12px;margin-top:var(--space-1)">${card.created_at?.slice(0,10)||''}</p>
            </div>
            <div style="line-height:1.8">${rendered || '<p style="color:var(--color-text-faint)">暂无笔记</p>'}</div>
            <div style="margin-top:var(--space-6)">${(card.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
        `;
        openDetail(detailContent.innerHTML);
    }

    /* ========================================
       Inline editing
       ======================================== */
    window._editCardById = function(cardId) {
        const card = allCards.find(c => c.id === cardId);
        if (!card) return;
        const color = getCardColor(card.type);
        const notes = card.notes || card.body || '';
        const tagsStr = (card.tags || []).join(', ');

        detailContent.innerHTML = `
            <h2 style="font-family:var(--font-display);margin-bottom:var(--space-4);border-left:4px solid ${color};padding-left:var(--space-4)">编辑卡片</h2>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="editTitle" value="${card.title}">
            </div>
            <div class="form-group">
                <label>内容 (Markdown)</label>
                <textarea id="editNotes" rows="8">${notes}</textarea>
            </div>
            <div class="form-group">
                <label>标签（逗号分隔）</label>
                <input type="text" id="editTags" value="${tagsStr}">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelEdit">取消</button>
                <button class="btn btn-primary" id="saveEdit">保存</button>
            </div>
        `;

        $('#cancelEdit').addEventListener('click', () => showCardDetail(card));
        $('#saveEdit').addEventListener('click', () => {
            const newTags = $('#editTags').value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
            fetch('/api/cards/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    card_id: card.id,
                    type: card.type,
                    title: $('#editTitle').value,
                    notes: $('#editNotes').value,
                    tags: newTags
                })
            })
            .then(r => r.json())
            .then(data => {
                // Update local cache
                const idx = allCards.findIndex(c => c.id === cardId);
                if (idx >= 0) allCards[idx] = data.card;
                // Update graph node label
                if (cy) {
                    const node = cy.getElementById(cardId);
                    if (node.length) {
                        node.data('label', data.card.title);
                        node.data('details', data.card);
                    }
                }
                showCardDetail(data.card);
            })
            .catch(err => { console.error(err); alert('保存失败'); });
        });
    };

    /* ========================================
       Card wall (list mode)
       ======================================== */
    function renderCardWall(filterType, filterTag) {
        const wall = $('#cardWall');
        if (!wall) return;
        let cards = allCards;
        if (filterType) cards = cards.filter(c => c.type === filterType);
        if (filterTag) cards = cards.filter(c => (c.tags || []).includes(filterTag));

        if (cards.length === 0) {
            wall.innerHTML = '<div class="empty-state"><h3>没有匹配的卡片</h3><p>试试清除筛选条件。</p></div>';
            return;
        }
        wall.innerHTML = cards.map(c => {
            const color = getCardColor(c.type);
            const labels = { book: '📖', music: '🎵', film: '🎬', game: '🎮', writing: '✍️' };
            return `<article class="card-item" data-card-id="${c.id}" style="border-top:3px solid ${color}">
                <span class="card-item-type" style="color:${color};font-family:var(--font-display);font-size:12px">${labels[c.type]||''} ${c.type}</span>
                <h3 style="font-family:var(--font-display);margin:var(--space-1) 0">${c.title}</h3>
                <p style="color:var(--color-text-muted);font-size:13px">${c.created_at?.slice(0,10)||''}</p>
                <div style="margin-top:var(--space-2)">${(c.tags||[]).slice(0,5).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
            </article>`;
        }).join('');

        wall.querySelectorAll('.card-item').forEach(el => {
            el.addEventListener('click', () => {
                const card = allCards.find(c => c.id === el.dataset.cardId);
                if (card) showCardDetail(card);
                setMode('graph');
                // Highlight the node in graph
                setTimeout(() => {
                    if (cy) {
                        const node = cy.getElementById(card.id);
                        if (node.length) { node.select(); cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 400 }); }
                    }
                }, 100);
            });
        });
    }

    // Filter listeners
    $$('input[name="filterType"]').forEach(r => {
        r.addEventListener('change', () => renderCardWall(r.value || null, null));
    });

    // Populate filter tags from all cards
    function updateFilterTags() {
        const container = $('#filterTags');
        if (!container) return;
        const allTags = [...new Set(allCards.flatMap(c => c.tags || []))].sort();
        container.innerHTML = allTags.map(t =>
            `<span class="tag filter-tag" data-tag="${t}">${t}</span>`
        ).join('');
        container.querySelectorAll('.filter-tag').forEach(el => {
            el.addEventListener('click', function () {
                this.classList.toggle('active');
                const activeTags = [...container.querySelectorAll('.filter-tag.active')].map(e => e.dataset.tag);
                renderCardWall($$('input[name="filterType"]:checked')[0]?.value || null, activeTags.length ? activeTags : null);
            });
        });
    }

    $('#filterClear')?.addEventListener('click', () => {
        $$('input[name="filterType"]').forEach(r => r.checked = r.value === '');
        renderCardWall(null, null);
    });

    /* ========================================
       Search mode
       ======================================== */
    function doSearch(query) {
        const results = $('#searchResults');
        if (!results) return;
        if (!query.trim()) {
            results.innerHTML = '<p class="search-hint">输入关键词，搜索你的所有卡片。</p>';
            return;
        }
        const q = query.toLowerCase();
        const hits = allCards.filter(c => {
            if ((c.title||'').toLowerCase().includes(q)) return true;
            if ((c.notes||c.body||'').toLowerCase().includes(q)) return true;
            if ((c.tags||[]).some(t => t.toLowerCase().includes(q))) return true;
            if ((c.author||c.artist||c.director||'').toLowerCase().includes(q)) return true;
            return false;
        });
        if (hits.length === 0) {
            results.innerHTML = '<div class="empty-state"><h3>没有找到</h3><p>试试其他关键词。</p></div>';
            return;
        }
        results.innerHTML = `<p class="search-count">找到 ${hits.length} 条结果</p>` + hits.map(c => {
            const color = getCardColor(c.type);
            const excerpt = ((c.notes||c.body||'').length > 120 ? (c.notes||c.body||'').slice(0,120)+'…' : (c.notes||c.body||''));
            return `<article class="search-item" data-card-id="${c.id}">
                <span style="color:${color};font-family:var(--font-display);font-size:12px">${c.type}</span>
                <h3 style="font-family:var(--font-display);margin:var(--space-1) 0">${highlight(c.title, q)}</h3>
                <p style="color:var(--color-text-muted);font-size:13px">${highlight(excerpt, q)}</p>
            </article>`;
        }).join('');

        results.querySelectorAll('.search-item').forEach(el => {
            el.addEventListener('click', () => {
                const card = allCards.find(c => c.id === el.dataset.cardId);
                if (card) { showCardDetail(card); setMode('graph'); }
            });
        });
    }

    function highlight(text, query) {
        if (!query) return text;
        const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(re, '<mark style="background:var(--color-accent);color:var(--color-text-inverse);padding:0 2px;border-radius:2px">$1</mark>');
    }

    $('#searchInput')?.addEventListener('input', function () { doSearch(this.value); });
    $('#searchBtn')?.addEventListener('click', () => doSearch($('#searchInput')?.value || ''));

    /* ========================================
       Random walk
       ======================================== */
    function triggerRandom() {
        if (allCards.length === 0) {
            if ($('#randomCard')) $('#randomCard').innerHTML = '<div class="empty-state"><h3>🎲 还没有卡片</h3><p>先去白板创建几张吧。</p></div>';
            return;
        }
        const idx = Math.floor(Math.random() * allCards.length);
        const card = allCards[idx];
        const color = getCardColor(card.type);
        const labels = { book: '📖 书籍', music: '🎵 音乐', film: '🎬 电影', game: '🎮 游戏', writing: '✍️ 原创' };
        const notes = (card.notes || card.body || '').slice(0, 200);
        if ($('#randomCard')) $('#randomCard').innerHTML = `
            <div style="border-left:4px solid ${color};padding-left:var(--space-4);margin-bottom:var(--space-6)">
                <span style="color:${color};font-family:var(--font-display);font-size:13px">${labels[card.type]||''}</span>
                <h2 style="font-family:var(--font-display);margin:var(--space-2) 0;cursor:pointer" onclick="window._showCardById('${card.id}')">${card.title}</h2>
                <p style="color:var(--color-text-muted);font-size:13px">${notes}${notes.length>=200?'…':''}</p>
                <div style="margin-top:var(--space-3)">${(card.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>
            </div>
            <button class="btn btn-primary" onclick="document.querySelector('#randomBtn').click()">🎲 再跳一次</button>
        `;

        // Related suggestions
        const cardTags = card.tags || [];
        const related = allCards
            .filter(c => c.id !== card.id && (c.tags||[]).some(t => cardTags.includes(t)))
            .slice(0, 5);
        const relatedList = $('#randomRelatedList');
        if (relatedList) relatedList.innerHTML = related.map(c =>
            `<span class="tag" style="cursor:pointer;margin:4px" data-card-id="${c.id}">${c.title}</span>`
        ).join('');
        relatedList?.querySelectorAll('.tag').forEach(el => {
            el.addEventListener('click', () => {
                const c = allCards.find(x => x.id === el.dataset.cardId);
                if (c) { showCardDetail(c); setMode('graph'); }
            });
        });
    }

    // Expose for onclick in HTML
    window._showCardById = function(id) {
        const card = allCards.find(c => c.id === id);
        if (card) { showCardDetail(card); setMode('graph'); }
    };

    $('#randomBtn')?.addEventListener('click', triggerRandom);

    /* ========================================
       Keyboard
       ======================================== */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeModal(); closeDetail(); }
        if (e.key === 'n' && e.ctrlKey) { e.preventDefault(); openModal(); }
        if (e.key === '1' && !e.ctrlKey) setMode('graph');
        if (e.key === '2' && !e.ctrlKey) setMode('list');
        if (e.key === '3' && !e.ctrlKey) setMode('search');
        if (e.key === '4' && !e.ctrlKey) setMode('random');
    });

    /* ========================================
       Load data
       ======================================== */
    fetch('/api/cards/')
        .then(r => r.json())
        .then(data => {
            allCards = data.cards || [];
            allConnections = data.connections || [];
            if (allCards.length > 0) {
                initGraph();
            }
            updateFilterTags();
            if (currentMode === 'list') renderCardWall();
        })
        .catch(() => { /* no cards yet */ });

})();
