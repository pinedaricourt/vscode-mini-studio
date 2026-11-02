// Página de inicio de Mini Studio (webview)
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const TEMPLATES = [
        { key: 'console', template: 'console', icon: '⌨', title: 'Aplicación de consola', detail: 'Un programa que se ejecuta en la línea de comandos. Ideal para aprender C#.', tags: ['C#', 'VB', 'Consola'], cat: 'consola', langs: true, def: 'ConsoleApp' },
        { key: 'winforms', template: 'winforms', icon: '🗔', title: 'Aplicación de Windows Forms', detail: 'Una app de escritorio con ventanas. Se diseña arrastrando controles.', tags: ['C#', 'VB', 'Windows', 'Escritorio'], cat: 'escritorio', langs: true, def: 'WinFormsApp' },
        { key: 'classlib', template: 'classlib', icon: '📚', title: 'Biblioteca de clases', detail: 'Un proyecto .dll con código para reutilizar en otros proyectos.', tags: ['C#', 'VB', 'Biblioteca'], cat: 'biblioteca', langs: true, def: 'ClassLibrary' },
    ];
    const FILTERS = [['todos', 'Todos'], ['consola', 'Consola'], ['escritorio', 'Escritorio'], ['biblioteca', 'Biblioteca'], ['ejemplos', 'Ejemplos']];

    let state = { frameworks: [], location: '', solution: undefined, samples: [], windows: true };
    let filter = 'todos';
    let chosen = null;

    function allItems() {
        const samples = state.samples.map(s => ({
            key: 'sample:' + s.id, template: s.template, sample: s.id, icon: s.template === 'winforms' ? '🧮' : '🎲',
            title: s.title, detail: s.detail, tags: ['C#', 'Ejemplo', s.template === 'winforms' ? 'Escritorio' : 'Consola'],
            cat: 'ejemplos', langs: false, def: s.title.replace(/[^A-Za-z0-9]/g, ''),
        }));
        return [...TEMPLATES, ...samples];
    }

    function renderGallery() {
        $('filters').innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
        const items = allItems().filter(i => filter === 'todos' || i.cat === filter);
        $('cards').innerHTML = items.map(i => `
            <button class="card" data-key="${esc(i.key)}">
              <span class="ico">${i.icon}</span>
              <span class="txt"><b>${esc(i.title)}</b><small>${esc(i.detail)}</small>
              <span class="tags">${i.tags.map(t => `<i>${esc(t)}</i>`).join('')}</span></span>
            </button>`).join('');
        if (!state.windows) {
            $('cards').insertAdjacentHTML('beforeend', '<p class="muted note">En Linux/macOS las apps de Windows Forms se compilan y se corren con Wine (si está instalado) o en el simulador del diseñador.</p>');
        }
    }

    function nextName(base) {
        return base + '1';
    }

    function openConfig(item) {
        chosen = item;
        $('gallery').hidden = true;
        $('config').hidden = false;
        $('cfgTitle').textContent = item.title + (item.sample ? ' (ejemplo listo para correr)' : '');
        $('name').value = nextName(item.def);
        $('location').value = state.location;
        $('framework').innerHTML = (state.frameworks.length ? state.frameworks : ['']).map(f => `<option value="${f}">${f ? '.NET ' + f.replace(/^net/, '') : 'Predeterminado del SDK'}</option>`).join('');
        $('langRow').hidden = !item.langs;
        $('lang').value = 'C#';
        $('slnRow').hidden = !state.solution;
        $('addToSln').checked = false;
        if (state.solution) { $('slnLabel').textContent = `Agregar a la solución abierta (${state.solution.split(/[\\/]/).pop()})`; }
        updateDependent();
        $('error').hidden = true;
        $('name').focus();
        $('name').select();
    }

    function updateDependent() {
        const add = !$('slnRow').hidden && $('addToSln').checked;
        $('locRow').hidden = add;
        $('mainRow').hidden = !(chosen && chosen.template === 'console' && !chosen.sample && $('lang').value === 'C#');
        const name = $('name').value.trim() || '...';
        const sep = state.windows ? '\\' : '/';
        $('path').textContent = add
            ? `El proyecto se creará en: ${state.solution.replace(/[\\/][^\\/]+$/, '')}${sep}${name}`
            : `Se creará: ${$('location').value.replace(/[\\/]$/, '')}${sep}${name}${sep}${name}.sln`;
    }

    function create() {
        const name = $('name').value.trim();
        if (!/^[\p{L}_][\p{L}\p{N}_.\-]*$/u.test(name)) { showError('Nombre no válido: usa letras, números, _ . -'); return; }
        const add = !$('slnRow').hidden && $('addToSln').checked;
        if (!add && !$('location').value.trim()) { showError('Elige una ubicación.'); return; }
        $('create').disabled = true;
        $('create').textContent = 'Creando...';
        vscode.postMessage({
            type: 'create', options: {
                template: chosen.template, lang: chosen.langs ? $('lang').value : 'C#', name,
                solution: add ? state.solution : undefined, location: add ? undefined : $('location').value.trim(),
                classicMain: $('classicMain').checked, framework: $('framework').value || undefined, sample: chosen.sample,
            },
        });
    }

    function showError(msg) {
        $('error').textContent = msg;
        $('error').hidden = false;
        $('create').disabled = false;
        $('create').textContent = 'Crear';
    }

    function renderRecent(recent) {
        if (!recent.length) { return; }
        $('recent').innerHTML = recent.map(r => `<button class="recent" data-path="${esc(r.path)}"><b>${esc(r.name)}</b><small>${esc(r.path)}</small></button>`).join('');
    }

    document.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (chip) { filter = chip.dataset.f; renderGallery(); return; }
        const card = e.target.closest('.card');
        if (card) { openConfig(allItems().find(i => i.key === card.dataset.key)); return; }
        const rec = e.target.closest('.recent');
        if (rec) { vscode.postMessage({ type: 'openRecent', path: rec.dataset.path }); }
    });
    $('back').addEventListener('click', () => { $('config').hidden = true; $('gallery').hidden = false; });
    $('browse').addEventListener('click', () => vscode.postMessage({ type: 'browse', current: $('location').value }));
    $('create').addEventListener('click', create);
    $('openFolder').addEventListener('click', () => vscode.postMessage({ type: 'openFolder' }));
    $('openSolution').addEventListener('click', () => vscode.postMessage({ type: 'openSolution' }));
    ['name', 'location'].forEach(id => $(id).addEventListener('input', updateDependent));
    ['addToSln', 'lang'].forEach(id => $(id).addEventListener('change', updateDependent));
    $('name').addEventListener('keydown', e => { if (e.key === 'Enter') { create(); } });

    window.addEventListener('message', e => {
        const m = e.data;
        if (m.type === 'init') {
            state = m;
            renderGallery();
            renderRecent(m.recent);
        }
        if (m.type === 'location') { $('location').value = m.path; state.location = m.path; updateDependent(); }
        if (m.type === 'error') { showError(m.message); }
    });

    vscode.postMessage({ type: 'ready' });
})();
