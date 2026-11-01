// Diseñador de Windows Forms de Mini Studio (corre dentro del webview).
// El modelo (form) llega del host ya parseado desde X.Designer.cs; cada cambio se devuelve
// completo y el host regenera el archivo.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const $ = id => document.getElementById(id);
    const FORM = '$form';

    /** @type {any} */ let form = null;
    let sel = FORM;
    let grid = 4;
    let tab = 'props';
    const undoStack = [], redoStack = [];
    let clipboard = null;

    // ------------------------------------------------------------------ catálogo
    const TOOLS = [
        { g: 'Controles comunes' },
        { t: 'Button', i: '▭', size: [94, 29], text: true, ev: 'Click', init: { UseVisualStyleBackColor: 'true' } },
        { t: 'Label', i: 'A', size: [50, 20], text: true, ev: 'Click', init: { AutoSize: 'true' } },
        { t: 'LinkLabel', i: 'a̲', size: [72, 20], text: true, ev: 'LinkClicked', init: { AutoSize: 'true', TabStop: 'true' } },
        { t: 'TextBox', i: 'ab', size: [125, 27], ev: 'TextChanged' },
        { t: 'RichTextBox', i: '¶', size: [150, 120], ev: 'TextChanged', textEmpty: true },
        { t: 'MaskedTextBox', i: '#_', size: [125, 27], ev: 'MaskInputRejected' },
        { t: 'CheckBox', i: '☑', size: [101, 24], text: true, ev: 'CheckedChanged', init: { AutoSize: 'true', UseVisualStyleBackColor: 'true' } },
        { t: 'RadioButton', i: '◉', size: [117, 24], text: true, ev: 'CheckedChanged', init: { AutoSize: 'true', TabStop: 'true', UseVisualStyleBackColor: 'true' } },
        { t: 'ComboBox', i: '▾', size: [151, 28], ev: 'SelectedIndexChanged', items: true, init: { FormattingEnabled: 'true' } },
        { t: 'ListBox', i: '☰', size: [150, 104], ev: 'SelectedIndexChanged', items: true, init: { FormattingEnabled: 'true' } },
        { t: 'CheckedListBox', i: '☑', size: [150, 114], ev: 'SelectedIndexChanged', items: true, init: { FormattingEnabled: 'true' } },
        { t: 'PictureBox', i: '🖼', size: [125, 62], ev: 'Click', init: { TabStop: 'false' } },
        { t: 'ProgressBar', i: '▬', size: [125, 29], ev: 'Click' },
        { t: 'NumericUpDown', i: '⇅', size: [150, 27], ev: 'ValueChanged' },
        { t: 'DateTimePicker', i: '📅', size: [250, 27], ev: 'ValueChanged' },
        { t: 'TrackBar', i: '⊸', size: [130, 56], ev: 'Scroll' },
        { g: 'Contenedores' },
        { t: 'Panel', i: '▢', size: [250, 125], container: true, ev: 'Paint' },
        { t: 'GroupBox', i: '⬚', size: [250, 125], container: true, text: true, ev: 'Enter', init: { TabStop: 'false' } },
        { t: 'FlowLayoutPanel', i: '⇶', size: [250, 125], container: true, ev: 'Paint' },
        { g: 'Datos' },
        { t: 'DataGridView', i: '▦', size: [300, 188], ev: 'CellContentClick', init: { ColumnHeadersHeightSizeMode: 'System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize' } },
        { g: 'Componentes' },
        { t: 'Timer', i: '⏱', component: true, ev: 'Tick' },
        { t: 'ToolTip', i: '💬', component: true, ev: 'Popup' },
        { t: 'OpenFileDialog', i: '📂', component: true, ev: 'FileOk', init: { FileName: '"openFileDialog1"' } },
        { t: 'SaveFileDialog', i: '💾', component: true, ev: 'FileOk' },
        { t: 'ErrorProvider', i: '⚠', component: true, ev: 'Disposed', init: { ContainerControl: 'this' } },
    ];
    const TOOL = Object.fromEntries(TOOLS.filter(t => t.t).map(t => [t.t, t]));
    const CONTAINERS = new Set(['Panel', 'GroupBox', 'FlowLayoutPanel', 'TableLayoutPanel', 'TabPage']);

    const COMMON_EVENTS = ['Click', 'DoubleClick', 'TextChanged', 'Enter', 'Leave', 'KeyDown', 'KeyPress', 'KeyUp', 'MouseClick', 'MouseDown', 'MouseUp', 'MouseMove', 'Validating', 'VisibleChanged'];
    const FORM_EVENTS = ['Load', 'Shown', 'FormClosing', 'FormClosed', 'Activated', 'Click', 'KeyDown', 'KeyPress', 'Resize', 'Paint'];
    const COMPONENT_EVENTS = { Timer: ['Tick'], ToolTip: ['Popup'], OpenFileDialog: ['FileOk'], SaveFileDialog: ['FileOk'], ErrorProvider: [] };

    const ENUMS = {
        Dock: ['None', 'Top', 'Bottom', 'Left', 'Right', 'Fill'].map(v => [v, 'System.Windows.Forms.DockStyle.' + v]),
        BorderStyle: ['None', 'FixedSingle', 'Fixed3D'].map(v => [v, 'System.Windows.Forms.BorderStyle.' + v]),
        DropDownStyle: ['Simple', 'DropDown', 'DropDownList'].map(v => [v, 'System.Windows.Forms.ComboBoxStyle.' + v]),
        SizeMode: ['Normal', 'StretchImage', 'AutoSize', 'CenterImage', 'Zoom'].map(v => [v, 'System.Windows.Forms.PictureBoxSizeMode.' + v]),
        StartPosition: ['Manual', 'CenterScreen', 'WindowsDefaultLocation', 'WindowsDefaultBounds', 'CenterParent'].map(v => [v, 'System.Windows.Forms.FormStartPosition.' + v]),
        FormBorderStyle: ['None', 'FixedSingle', 'Fixed3D', 'FixedDialog', 'Sizable', 'FixedToolWindow', 'SizableToolWindow'].map(v => [v, 'System.Windows.Forms.FormBorderStyle.' + v]),
        WindowState: ['Normal', 'Minimized', 'Maximized'].map(v => [v, 'System.Windows.Forms.FormWindowState.' + v]),
        TextAlign: ['TopLeft', 'TopCenter', 'TopRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'BottomLeft', 'BottomCenter', 'BottomRight'].map(v => [v, 'System.Drawing.ContentAlignment.' + v]),
        ScrollBars: ['None', 'Horizontal', 'Vertical', 'Both'].map(v => [v, 'System.Windows.Forms.ScrollBars.' + v]),
    };
    const DEFAULT_ENUM = { Dock: 'None', BorderStyle: 'None', DropDownStyle: 'DropDown', SizeMode: 'Normal', StartPosition: 'WindowsDefaultLocation', FormBorderStyle: 'Sizable', WindowState: 'Normal', TextAlign: 'TopLeft', ScrollBars: 'None' };

    // ------------------------------------------------------------------ expresiones C#
    const short = t => t.slice(t.lastIndexOf('.') + 1);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function decodeStr(expr) {
        if (expr == null) { return undefined; }
        expr = expr.trim();
        if (expr.startsWith('@"')) { return expr.slice(2, -1).replace(/""/g, '"'); }
        if (!expr.startsWith('"')) { return undefined; }
        const body = expr.slice(1, -1);
        return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,4}|.)/g, (_, e) => {
            switch (e[0]) {
                case 'n': return '\n'; case 'r': return '\r'; case 't': return '\t'; case '0': return '\0';
                case 'u': case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
                default: return e;
            }
        });
    }
    const encodeStr = s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
    function pair(expr) {
        const m = /\(\s*(-?\d+)F?\s*,\s*(-?\d+)F?\s*\)/.exec(expr || '');
        return m ? [+m[1], +m[2]] : undefined;
    }
    const pointExpr = (x, y) => `new System.Drawing.Point(${x}, ${y})`;
    const sizeExpr = (w, h) => `new System.Drawing.Size(${w}, ${h})`;
    const isTrue = (expr, def) => expr === undefined ? def : expr.trim() === 'true';
    const SYS_COLORS = { Control: '#f0f0f0', ControlText: '#000000', Window: '#ffffff', WindowText: '#000000', Highlight: '#0078d7', HighlightText: '#ffffff', ControlDark: '#a0a0a0', ControlLight: '#e3e3e3', ButtonFace: '#f0f0f0', Info: '#ffffe1', GrayText: '#6d6d6d', HotTrack: '#0066cc', ActiveCaption: '#99b4d1', AppWorkspace: '#ababab' };
    function cssColor(expr) {
        if (!expr) { return undefined; }
        let m = /FromArgb\(([\s\S]*)\)/.exec(expr);
        if (m) {
            const n = (m[1].match(/-?\d+/g) || []).map(Number);
            if (n.length === 3) { return `rgb(${n[0]},${n[1]},${n[2]})`; }
            if (n.length === 4) { return `rgba(${n[1]},${n[2]},${n[3]},${n[0] / 255})`; }
            return undefined;
        }
        m = /SystemColors\.(\w+)/.exec(expr);
        if (m) { return SYS_COLORS[m[1]]; }
        m = /Color\.(\w+)$/.exec(expr.trim());
        if (m) { return m[1] === 'Transparent' ? 'transparent' : m[1].toLowerCase(); }
        return undefined;
    }
    function hexColor(expr) {
        const c = cssColor(expr);
        if (!c) { return '#000000'; }
        const m = /rgba?\((\d+),(\d+),(\d+)/.exec(c);
        if (m) { return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join(''); }
        if (c.startsWith('#')) { return c; }
        const probe = document.createElement('canvas').getContext('2d');
        probe.fillStyle = c;
        return probe.fillStyle.startsWith('#') ? probe.fillStyle : '#000000';
    }
    const colorExpr = hex => `System.Drawing.Color.FromArgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    function cssFont(expr) {
        const m = /Font\(\s*"([^"]+)"\s*,\s*([\d.]+)F?(?:\s*,\s*([^,)]+))?/.exec(expr || '');
        if (!m) { return undefined; }
        const style = m[3] || '';
        return {
            family: m[1], size: +m[2],
            css: `${/Italic/.test(style) ? 'italic ' : ''}${/Bold/.test(style) ? 'bold ' : ''}${(+m[2] * 96 / 72).toFixed(1)}px "${m[1]}", sans-serif`,
            deco: [/Underline/.test(style) && 'underline', /Strikeout/.test(style) && 'line-through'].filter(Boolean).join(' '),
            bold: /Bold/.test(style), italic: /Italic/.test(style),
        };
    }
    function fontExpr(family, size, bold, italic) {
        const styles = [bold && 'System.Drawing.FontStyle.Bold', italic && 'System.Drawing.FontStyle.Italic'].filter(Boolean);
        const st = styles.length ? styles.join(' | ') : 'System.Drawing.FontStyle.Regular';
        return `new System.Drawing.Font("${family}", ${size}F, ${st}, System.Drawing.GraphicsUnit.Point)`;
    }

    // ------------------------------------------------------------------ helpers del modelo
    const visibleControls = () => form.controls.filter(c => !c.extra.includes('__fieldOnly'));
    const getCtl = name => form.controls.find(c => c.name === name);
    const isComponent = c => !!c.ctorArgs || (TOOL[short(c.type)] || {}).component;
    const childrenOf = parent => visibleControls().filter(c => c.parent === parent && !isComponent(c));
    const target = () => sel === FORM ? form : getCtl(sel);
    function descendants(name) {
        const out = [];
        const walk = n => childrenOf(n).forEach(c => { out.push(c.name); walk(c.name); });
        walk(name);
        return out;
    }
    function itemsOf(c) {
        const st = c.extra.find(x => new RegExp(`^(this\\.)?${c.name}\\.Items\\.AddRange\\(`).test(x));
        if (!st) { return []; }
        return (st.match(/@?"(?:[^"\\]|\\.|"")*"/g) || []).map(decodeStr);
    }
    function setItems(c, items) {
        c.extra = c.extra.filter(x => !new RegExp(`^(this\\.)?${c.name}\\.Items\\.AddRange\\(`).test(x));
        if (items.length) {
            c.extra.push(`this.${c.name}.Items.AddRange(new object[] {\n${items.map(encodeStr).join(',\n')}})`);
        }
    }
    function uniqueName(type) {
        const base = type[0].toLowerCase() + type.slice(1);
        for (let i = 1; ; i++) {
            const n = base + i;
            if (!form.controls.some(c => c.name === n) && n !== form.className) { return n; }
        }
    }

    function mutate(fn) {
        undoStack.push(JSON.stringify(form));
        if (undoStack.length > 200) { undoStack.shift(); }
        redoStack.length = 0;
        fn();
        commit();
    }
    function commit() {
        render();
        vscode.postMessage({ type: 'change', form });
    }
    function undo() {
        if (!undoStack.length) { return; }
        redoStack.push(JSON.stringify(form));
        form = JSON.parse(undoStack.pop());
        if (sel !== FORM && !getCtl(sel)) { sel = FORM; }
        commit();
    }
    function redo() {
        if (!redoStack.length) { return; }
        undoStack.push(JSON.stringify(form));
        form = JSON.parse(redoStack.pop());
        if (sel !== FORM && !getCtl(sel)) { sel = FORM; }
        commit();
    }

    // ------------------------------------------------------------------ render de la superficie
    const surface = $('surface');
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    $('formWin').appendChild(overlay);

    function render() {
        if (!form) { return; }
        const cs = pair(form.props.ClientSize) || [800, 450];
        surface.style.width = cs[0] + 'px';
        surface.style.height = cs[1] + 'px';
        surface.style.backgroundColor = cssColor(form.props.BackColor) || '#f0f0f0';
        const ff = cssFont(form.props.Font);
        surface.style.font = ff ? ff.css : '';
        $('formTitleText').textContent = decodeStr(form.props.Text) ?? form.className;
        $('formWin').classList.toggle('selected', sel === FORM);
        surface.innerHTML = '';
        renderChildren(null, surface);
        renderTray();
        renderSelection();
        renderProps();
        renderCombo();
    }

    function renderChildren(parent, host) {
        const kids = childrenOf(parent);
        kids.forEach((c, i) => {
            const el = renderControl(c);
            el.style.zIndex = String(kids.length - i);
            host.appendChild(el);
            if (CONTAINERS.has(short(c.type))) { renderChildren(c.name, el); }
        });
    }

    function renderControl(c) {
        const t = short(c.type);
        const p = c.props;
        const el = document.createElement('div');
        el.className = 'ctl t-' + (TOOL[t] || CONTAINERS.has(t) ? t : 'Generic');
        el.dataset.name = c.name;
        const loc = pair(p.Location) || [0, 0];
        const size = pair(p.Size) || (TOOL[t] && TOOL[t].size) || [100, 23];
        el.style.left = loc[0] + 'px';
        el.style.top = loc[1] + 'px';
        el.style.width = size[0] + 'px';
        el.style.height = size[1] + 'px';
        applyDock(el, p.Dock, c.parent);
        const f = cssFont(p.Font);
        if (f) { el.style.font = f.css; if (f.deco) { el.style.textDecoration = f.deco; } }
        const fg = cssColor(p.ForeColor); if (fg) { el.style.color = fg; }
        const bg = cssColor(p.BackColor); if (bg) { el.style.background = bg; }
        if (!isTrue(p.Enabled, true)) { el.style.opacity = '.55'; }
        if (!isTrue(p.Visible, true)) { el.style.outline = '1px dotted #888'; }
        if (/FixedSingle/.test(p.BorderStyle || '')) { el.classList.add('border-single'); }
        if (/Fixed3D/.test(p.BorderStyle || '')) { el.classList.add('border-3d'); }
        const text = decodeStr(p.Text) ?? '';
        const auto = isTrue(p.AutoSize, false);
        switch (t) {
            case 'Button': el.innerHTML = `<span>${esc(text)}</span>`; break;
            case 'Label': case 'LinkLabel':
                el.textContent = text;
                if (auto) { el.classList.add('auto'); }
                break;
            case 'TextBox': case 'MaskedTextBox': case 'RichTextBox': {
                const pwd = p.PasswordChar || (isTrue(p.UseSystemPasswordChar, false) ? "'●'" : '');
                el.textContent = pwd ? (pwd.replace(/'/g, '')[0] || '*').repeat(text.length) : text;
                if (isTrue(p.Multiline, false)) { el.classList.add('multi'); }
                break;
            }
            case 'CheckBox':
                el.innerHTML = `<span class="box">${isTrue(p.Checked, false) || /Checked$/.test(p.CheckState || '') ? '✔' : ''}</span>${esc(text)}`;
                if (auto) { el.classList.add('auto'); }
                break;
            case 'RadioButton':
                el.innerHTML = `<span class="radio ${isTrue(p.Checked, false) ? 'on' : ''}"></span>${esc(text)}`;
                if (auto) { el.classList.add('auto'); }
                break;
            case 'ComboBox': el.innerHTML = `<span>${esc(text || itemsOf(c)[0] || '')}</span><span class="dd">▾</span>`; break;
            case 'ListBox': case 'CheckedListBox': {
                const items = itemsOf(c);
                el.innerHTML = items.length ? items.map(x => `<div class="it">${t === 'CheckedListBox' ? '☐ ' : ''}${esc(x)}</div>`).join('') : `<div class="it" style="opacity:.5">${esc(c.name)}</div>`;
                break;
            }
            case 'PictureBox': el.textContent = '🖼'; break;
            case 'GroupBox': el.innerHTML = `<div class="gframe"></div><div class="glegend">${esc(text)}</div>`; break;
            case 'DataGridView': el.innerHTML = '<div class="hdr"></div>'; break;
            case 'ProgressBar': {
                const v = +(p.Value || 0), max = +(p.Maximum || 100), min = +(p.Minimum || 0);
                el.innerHTML = `<div class="fill" style="width:${Math.max(0, Math.min(100, (v - min) / ((max - min) || 1) * 100))}%"></div>`;
                break;
            }
            case 'NumericUpDown': el.innerHTML = '<span>0</span><span class="dd">⇅</span>'; break;
            case 'DateTimePicker': el.innerHTML = `<span>${new Date().toLocaleDateString()}</span><span class="dd">▾</span>`; break;
            case 'TrackBar': el.innerHTML = '<div class="rail"></div><div class="thumb"></div>'; break;
            case 'Panel': case 'FlowLayoutPanel': case 'TableLayoutPanel': break;
            default: el.textContent = t; break;
        }
        if (p.TextAlign && /Label|Button|CheckBox|RadioButton/.test(t)) {
            const a = (/ContentAlignment\.(\w+)/.exec(p.TextAlign) || [])[1] || '';
            el.style.display = 'flex';
            el.style.justifyContent = /Left/.test(a) ? 'flex-start' : /Right/.test(a) ? 'flex-end' : 'center';
            el.style.alignItems = /^Top/.test(a) ? 'flex-start' : /^Bottom/.test(a) ? 'flex-end' : 'center';
        }
        return el;
    }

    function applyDock(el, dock, parent) {
        const d = (/DockStyle\.(\w+)/.exec(dock || '') || [])[1];
        if (!d || d === 'None') { return; }
        const s = el.style;
        const topPad = parent && short(getCtl(parent).type) === 'GroupBox' ? 16 : 0;
        if (d === 'Fill') { s.left = '0'; s.top = topPad + 'px'; s.width = '100%'; s.height = `calc(100% - ${topPad}px)`; }
        if (d === 'Top') { s.left = '0'; s.top = topPad + 'px'; s.width = '100%'; }
        if (d === 'Bottom') { s.left = '0'; s.top = 'auto'; s.bottom = '0'; s.width = '100%'; }
        if (d === 'Left') { s.left = '0'; s.top = topPad + 'px'; s.height = `calc(100% - ${topPad}px)`; }
        if (d === 'Right') { s.left = 'auto'; s.right = '0'; s.top = topPad + 'px'; s.height = `calc(100% - ${topPad}px)`; }
        el.dataset.docked = '1';
    }

    function renderTray() {
        const tray = $('tray');
        tray.innerHTML = '';
        visibleControls().filter(isComponent).forEach(c => {
            const d = document.createElement('div');
            d.className = 'comp' + (sel === c.name ? ' sel' : '');
            d.textContent = `${(TOOL[short(c.type)] || {}).i || '⚙'} ${c.name}`;
            d.dataset.name = c.name;
            d.addEventListener('mousedown', e => { e.stopPropagation(); select(c.name); });
            d.addEventListener('dblclick', e => { e.stopPropagation(); defaultEvent(c); });
            tray.appendChild(d);
        });
    }

    const elOf = name => surface.querySelector(`.ctl[data-name="${CSS.escape(name)}"]`);

    function renderSelection() {
        overlay.innerHTML = '';
        if (sel === FORM) { return; }
        const el = elOf(sel);
        if (!el) { return; }
        const wr = $('formWin').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'selbox';
        Object.assign(box.style, { left: (r.left - wr.left - 1) + 'px', top: (r.top - wr.top - 1) + 'px', width: (r.width + 2) + 'px', height: (r.height + 2) + 'px' });
        overlay.appendChild(box);
        if (el.dataset.docked) { return; }
        const c = getCtl(sel);
        const autoSized = isTrue(c.props.AutoSize, false) && /Label|CheckBox|RadioButton/.test(short(c.type));
        if (autoSized) { return; }
        const H = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
        const CUR = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
        for (const [dir, [fx, fy]] of Object.entries(H)) {
            const h = document.createElement('div');
            h.className = 'handle';
            h.style.left = (r.left - wr.left + r.width * fx - 4) + 'px';
            h.style.top = (r.top - wr.top + r.height * fy - 4) + 'px';
            h.style.cursor = CUR[dir] + '-resize';
            h.addEventListener('mousedown', e => startResize(e, dir));
            overlay.appendChild(h);
        }
    }

    function renderCombo() {
        const combo = $('selCombo');
        const opts = [[FORM, `${form.className}  System.Windows.Forms.Form`], ...visibleControls().map(c => [c.name, `${c.name}  ${c.type}`])];
        combo.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
    }

    // ------------------------------------------------------------------ selección e interacción
    function select(name) {
        sel = name;
        render();
    }

    const snap = v => Math.round(v / grid) * grid;
    const status = t => { $('status').textContent = t || ''; };

    surface.addEventListener('mousedown', e => {
        if (e.button !== 0) { return; }
        const el = e.target.closest('.ctl');
        if (!el) { select(FORM); return; }
        e.preventDefault();
        const name = el.dataset.name;
        if (sel !== name) { select(name); }
        if (elOf(name).dataset.docked) { return; }
        startMove(e, name);
    });

    function startMove(e, name) {
        const c = getCtl(name);
        const start = pair(c.props.Location) || [0, 0];
        const sx = e.clientX, sy = e.clientY;
        const before = JSON.stringify(form);
        let moved = false;
        let dropTarget = null;
        const onMove = ev => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 3) { return; }
            moved = true;
            const x = snap(start[0] + dx), y = snap(start[1] + dy);
            const el = elOf(name);
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.classList.add('dragging');
            c.props.Location = pointExpr(x, y);
            status(`Ubicación: ${x}, ${y}`);
            if (dropTarget) { dropTarget.classList.remove('drop-target'); }
            dropTarget = containerAt(ev.clientX, ev.clientY, name);
            if (dropTarget) { dropTarget.classList.add('drop-target'); }
            renderSelection();
        };
        const onUp = ev => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (!moved) { return; }
            const newParentEl = containerAt(ev.clientX, ev.clientY, name);
            const newParent = newParentEl ? newParentEl.dataset.name : null;
            if (newParent !== c.parent) { reparent(c, newParent); }
            undoStack.push(before);
            redoStack.length = 0;
            status('');
            commit();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    /** Contenedor (Panel/GroupBox...) bajo el puntero, sin contar al control que se arrastra ni sus hijos. */
    function containerAt(x, y, exclude) {
        const banned = new Set(exclude ? [exclude, ...descendants(exclude)] : []);
        for (const el of document.elementsFromPoint(x, y)) {
            if (!el.classList || !el.classList.contains('ctl')) { continue; }
            const n = el.dataset.name;
            if (banned.has(n)) { continue; }
            const c = getCtl(n);
            if (c && CONTAINERS.has(short(c.type))) { return el; }
        }
        return null;
    }

    function absOrigin(name) {
        // posición del área cliente de 'name' relativa a la superficie del formulario
        if (!name) { return [0, 0]; }
        const s = surface.getBoundingClientRect();
        const r = elOf(name).getBoundingClientRect();
        return [r.left - s.left, r.top - s.top];
    }

    function reparent(c, newParent) {
        const el = elOf(c.name);
        const s = surface.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const abs = [r.left - s.left, r.top - s.top];
        const o = absOrigin(newParent);
        c.parent = newParent;
        c.props.Location = pointExpr(Math.round(abs[0] - o[0]), Math.round(abs[1] - o[1]));
        // al frente dentro del nuevo contenedor
        form.controls.splice(form.controls.indexOf(c), 1);
        form.controls.unshift(c);
    }

    function startResize(e, dir) {
        e.preventDefault();
        e.stopPropagation();
        const c = getCtl(sel);
        const loc = pair(c.props.Location) || [0, 0];
        const size = pair(c.props.Size) || (TOOL[short(c.type)] || {}).size || [100, 23];
        const sx = e.clientX, sy = e.clientY;
        const before = JSON.stringify(form);
        const onMove = ev => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            let [x, y] = loc, [w, h] = size;
            if (dir.includes('e')) { w = snap(size[0] + dx); }
            if (dir.includes('s')) { h = snap(size[1] + dy); }
            if (dir.includes('w')) { x = snap(loc[0] + dx); w = size[0] + (loc[0] - x); }
            if (dir.includes('n')) { y = snap(loc[1] + dy); h = size[1] + (loc[1] - y); }
            w = Math.max(4, w); h = Math.max(4, h);
            c.props.Location = pointExpr(x, y);
            c.props.Size = sizeExpr(w, h);
            const el = elOf(c.name);
            Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
            status(`Tamaño: ${w} × ${h}`);
            renderSelection();
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            undoStack.push(before);
            redoStack.length = 0;
            status('');
            commit();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    $('formGrip').addEventListener('mousedown', e => {
        e.preventDefault();
        const cs = pair(form.props.ClientSize) || [800, 450];
        const sx = e.clientX, sy = e.clientY;
        const before = JSON.stringify(form);
        const onMove = ev => {
            const w = Math.max(80, snap(cs[0] + ev.clientX - sx)), h = Math.max(40, snap(cs[1] + ev.clientY - sy));
            form.props.ClientSize = sizeExpr(w, h);
            surface.style.width = w + 'px';
            surface.style.height = h + 'px';
            status(`ClientSize: ${w} × ${h}`);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            undoStack.push(before);
            redoStack.length = 0;
            status('');
            commit();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    surface.addEventListener('dblclick', e => {
        const el = e.target.closest('.ctl');
        if (!el) { defaultEvent(null); return; }
        defaultEvent(getCtl(el.dataset.name));
    });
    $('formTitle').addEventListener('mousedown', () => select(FORM));
    $('formTitle').addEventListener('dblclick', () => defaultEvent(null));

    // ------------------------------------------------------------------ eventos (doble clic → código)
    function defaultEvent(c) {
        const ev = c ? ((TOOL[short(c.type)] || {}).ev || 'Click') : 'Load';
        openHandler(c, ev);
    }
    function openHandler(c, ev) {
        const owner = c || form;
        const name = c ? c.name : form.className;
        let handler = owner.events[ev];
        if (!handler) {
            handler = `${name}_${ev}`;
            mutate(() => { owner.events[ev] = handler; });
        }
        vscode.postMessage({ type: 'change', form });
        vscode.postMessage({ type: 'createHandler', handler, event: ev });
    }

    // ------------------------------------------------------------------ cuadro de herramientas
    function renderTools(filter) {
        const tools = $('tools');
        tools.innerHTML = '';
        const f = (filter || '').toLowerCase();
        let group = null;
        for (const t of TOOLS) {
            if (t.g) { group = t.g; continue; }
            if (f && !t.t.toLowerCase().includes(f)) { continue; }
            if (group) {
                const g = document.createElement('div');
                g.className = 'tool-group';
                g.textContent = group;
                tools.appendChild(g);
                group = null;
            }
            const d = document.createElement('div');
            d.className = 'tool';
            d.innerHTML = `<span class="ti">${t.i}</span>${t.t}`;
            d.title = t.component ? `${t.t} (componente: aparece en la bandeja inferior)` : `Arrastra al formulario o haz doble clic`;
            d.addEventListener('mousedown', e => startToolDrag(e, t));
            d.addEventListener('dblclick', () => addControl(t.t, null, null));
            tools.appendChild(d);
        }
    }
    $('toolFilter').addEventListener('input', e => renderTools(e.target.value));

    const surfaceScroll = $('surfaceScroll');

    /** Arrastre desde el cuadro de herramientas (con ratón, sin HTML5 DnD, que falla en algunos webviews). */
    function startToolDrag(e, tool) {
        if (e.button !== 0) { return; }
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY;
        let ghost = null, hover = null;
        const onMove = ev => {
            if (!ghost && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) { return; }
            if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'ghost';
                ghost.textContent = `${tool.i} ${tool.t}`;
                document.body.appendChild(ghost);
            }
            ghost.style.left = ev.clientX + 8 + 'px';
            ghost.style.top = ev.clientY + 8 + 'px';
            if (hover) { hover.classList.remove('drop-target'); }
            hover = containerAt(ev.clientX, ev.clientY, null);
            if (hover) { hover.classList.add('drop-target'); }
        };
        const onUp = ev => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (hover) { hover.classList.remove('drop-target'); }
            if (!ghost) { return; }
            ghost.remove();
            const s = surface.getBoundingClientRect();
            const overForm = ev.clientX >= s.left && ev.clientX <= s.right && ev.clientY >= s.top && ev.clientY <= s.bottom;
            const overTray = surfaceScroll.contains(document.elementFromPoint(ev.clientX, ev.clientY));
            if (tool.component ? !overTray : !overForm) { return; }
            const parentEl = containerAt(ev.clientX, ev.clientY, null);
            const parent = parentEl ? parentEl.dataset.name : null;
            const o = absOrigin(parent);
            addControl(tool.t, parent, [snap(ev.clientX - s.left - o[0]), snap(ev.clientY - s.top - o[1])]);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    function addControl(type, parent, at) {
        const tool = TOOL[type];
        if (!tool) { return; }
        if (!at) {
            // doble clic: dentro del contenedor seleccionado, con un pequeño desplazamiento como VS
            const selC = sel !== FORM ? getCtl(sel) : null;
            parent = selC && CONTAINERS.has(short(selC.type)) ? selC.name : null;
            const n = childrenOf(parent).length;
            at = [12 + (n % 10) * 12, 12 + (n % 10) * 12 + (parent && short(getCtl(parent).type) === 'GroupBox' ? 14 : 0)];
        }
        const name = uniqueName(type);
        const c = { name, type: 'System.Windows.Forms.' + type, ctorArgs: tool.component ? 'this.components' : '', modifier: 'private', parent: tool.component ? null : parent, props: {}, events: {}, extra: [] };
        if (!tool.component) {
            c.props.Location = pointExpr(Math.max(0, at[0]), Math.max(0, at[1]));
            c.props.Size = sizeExpr(tool.size[0], tool.size[1]);
            c.props.TabIndex = String(childrenOf(parent).length);
            if (tool.text) { c.props.Text = encodeStr(name); }
        }
        Object.assign(c.props, tool.init || {});
        mutate(() => { form.controls.unshift(c); sel = name; });
    }

    // ------------------------------------------------------------------ propiedades
    function descriptors(c) {
        if (!c) {
            return [
                ['Apariencia', [['Text', 'string'], ['BackColor', 'color'], ['ForeColor', 'color'], ['Font', 'font'], ['FormBorderStyle', 'enum']]],
                ['Diseño', [['ClientSize', 'size'], ['StartPosition', 'enum'], ['WindowState', 'enum'], ['AutoScroll', 'bool:false']]],
                ['Ventana', [['MaximizeBox', 'bool:true'], ['MinimizeBox', 'bool:true'], ['ControlBox', 'bool:true'], ['ShowInTaskbar', 'bool:true'], ['TopMost', 'bool:false'], ['KeyPreview', 'bool:false']]],
                ['Varios', [['AcceptButton', 'ref'], ['CancelButton', 'ref']]],
            ];
        }
        const t = short(c.type);
        const tool = TOOL[t] || {};
        if (isComponent(c)) {
            const map = {
                Timer: [['Comportamiento', [['Enabled', 'bool:false'], ['Interval', 'int']]]],
                OpenFileDialog: [['Comportamiento', [['Title', 'string'], ['Filter', 'string'], ['FileName', 'string'], ['Multiselect', 'bool:false'], ['InitialDirectory', 'string']]]],
                SaveFileDialog: [['Comportamiento', [['Title', 'string'], ['Filter', 'string'], ['FileName', 'string'], ['DefaultExt', 'string']]]],
                ToolTip: [['Comportamiento', [['IsBalloon', 'bool:false'], ['ToolTipTitle', 'string'], ['InitialDelay', 'int'], ['AutoPopDelay', 'int']]]],
            };
            return map[t] || [];
        }
        const app = [['BackColor', 'color'], ['ForeColor', 'color'], ['Font', 'font']];
        if (tool.text || /TextBox|ComboBox/.test(t)) { app.unshift(['Text', /TextBox/.test(t) ? 'text' : 'string']); }
        if (/Label|Button|CheckBox|RadioButton/.test(t)) { app.push(['TextAlign', 'enum']); }
        if (/Panel|PictureBox|Label|DataGridView/.test(t)) { app.push(['BorderStyle', 'enum']); }
        const beh = [['Enabled', 'bool:true'], ['Visible', 'bool:true'], ['TabIndex', 'int']];
        if (/TextBox/.test(t)) { beh.push(['Multiline', 'bool:false'], ['ReadOnly', 'bool:false'], ['PasswordChar', 'char'], ['ScrollBars', 'enum'], ['MaxLength', 'int']); }
        if (/CheckBox|RadioButton/.test(t)) { beh.push(['Checked', 'bool:false']); }
        if (t === 'ComboBox') { beh.push(['DropDownStyle', 'enum']); }
        if (t === 'PictureBox') { beh.push(['SizeMode', 'enum']); }
        if (t === 'ProgressBar' || t === 'TrackBar') { beh.push(['Minimum', 'int'], ['Maximum', 'int'], ['Value', 'int']); }
        if (t === 'DataGridView') { beh.push(['ReadOnly', 'bool:false'], ['AllowUserToAddRows', 'bool:true'], ['AllowUserToDeleteRows', 'bool:true']); }
        const lay = [['Location', 'point'], ['Size', 'size'], ['Dock', 'enum'], ['Anchor', 'raw']];
        if (/Label|CheckBox|RadioButton|Button|Panel|GroupBox/.test(t)) { lay.push(['AutoSize', 'bool:false']); }
        const out = [['Apariencia', app], ['Comportamiento', beh], ['Diseño', lay]];
        if (tool.items) { out.push(['Datos', [['Items', 'items']]]); }
        return out;
    }

    function renderProps() {
        const grid = $('grid');
        grid.innerHTML = '';
        const c = sel === FORM ? null : getCtl(sel);
        if (sel !== FORM && !c) { return; }
        const owner = c || form;
        $('tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));

        if (tab === 'events') {
            const t = c ? short(c.type) : '';
            const list = !c ? FORM_EVENTS : isComponent(c) ? (COMPONENT_EVENTS[t] || []) : [...new Set([(TOOL[t] || {}).ev || 'Click', ...COMMON_EVENTS])];
            const extraEvents = Object.keys(owner.events).filter(e => !list.includes(e));
            grid.insertAdjacentHTML('beforeend', '<div class="hint">Doble clic en el nombre del evento para crear el controlador y abrir el código.</div>');
            for (const ev of [...list, ...extraEvents]) {
                const row = mkRow(ev, !!owner.events[ev]);
                const inp = document.createElement('input');
                inp.value = owner.events[ev] || '';
                inp.placeholder = '';
                inp.addEventListener('change', () => {
                    const v = inp.value.trim();
                    if (v && !/^[A-Za-z_]\w*$/.test(v)) { inp.value = owner.events[ev] || ''; return; }
                    mutate(() => { if (v) { owner.events[ev] = v; } else { delete owner.events[ev]; } });
                    if (v) { vscode.postMessage({ type: 'createHandler', handler: v, event: ev }); }
                });
                const go = document.createElement('button');
                go.textContent = '→';
                go.title = 'Ir al código';
                go.addEventListener('click', () => openHandler(c, ev));
                row.querySelector('label').addEventListener('dblclick', () => openHandler(c, ev));
                row.querySelector('.ed').append(inp, go);
                grid.appendChild(row);
            }
            return;
        }

        // (Name)
        const nameRow = mkRow('(Name)', true);
        const nameInp = document.createElement('input');
        nameInp.value = c ? c.name : form.className;
        nameInp.disabled = !c;
        nameInp.title = c ? '' : 'El nombre de la clase del formulario se cambia en el código.';
        nameInp.addEventListener('change', () => rename(c, nameInp.value.trim(), nameInp));
        nameRow.querySelector('.ed').appendChild(nameInp);
        const typeRow = mkRow('Tipo', false);
        typeRow.querySelector('.ed').textContent = c ? c.type : 'System.Windows.Forms.Form';
        grid.append(nameRow, typeRow);

        const known = new Set(['Name']);
        for (const [cat, rows] of descriptors(c)) {
            grid.insertAdjacentHTML('beforeend', `<div class="cat">${cat}</div>`);
            for (const [key, kind] of rows) {
                known.add(key);
                grid.appendChild(editorRow(owner, key, kind));
            }
        }
        const others = Object.keys(owner.props).filter(k => !known.has(k));
        if (others.length) {
            grid.insertAdjacentHTML('beforeend', '<div class="cat">Otras propiedades (C#)</div>');
            others.forEach(k => grid.appendChild(editorRow(owner, k, 'raw')));
        }
        grid.insertAdjacentHTML('beforeend', '<div class="cat">Agregar propiedad</div>');
        const add = mkRow('', false);
        add.classList.add('wide');
        const pk = document.createElement('input'); pk.placeholder = 'Propiedad (p. ej. Cursor)';
        const pv = document.createElement('input'); pv.placeholder = 'Expresión C#';
        const pb = document.createElement('button'); pb.textContent = '+';
        pb.addEventListener('click', () => {
            const k = pk.value.trim(), v = pv.value.trim();
            if (!/^[A-Za-z_][\w.]*$/.test(k) || !v) { return; }
            mutate(() => { owner.props[k] = v; });
        });
        add.querySelector('.ed').append(pk, pv, pb);
        grid.appendChild(add);
    }

    function mkRow(label, set) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<label class="${set ? 'set' : ''}" title="${esc(label)}">${esc(label)}</label><div class="ed"></div>`;
        return row;
    }

    function setProp(owner, key, value) {
        mutate(() => { if (value === undefined) { delete owner.props[key]; } else { owner.props[key] = value; } });
    }

    function editorRow(owner, key, kind) {
        const cur = owner.props[key];
        const row = mkRow(key, cur !== undefined);
        const ed = row.querySelector('.ed');
        const [k, def] = kind.split(':');
        const input = (value, onChange, type = 'text') => {
            const i = document.createElement('input');
            i.type = type;
            i.value = value;
            i.addEventListener('change', () => onChange(i.value));
            ed.appendChild(i);
            return i;
        };
        switch (k) {
            case 'string':
                input(decodeStr(cur) ?? '', v => setProp(owner, key, v === '' && key !== 'Text' ? undefined : encodeStr(v)));
                break;
            case 'text': {
                const multi = isTrue(owner.props.Multiline, false) || /RichTextBox/.test(owner.type || '');
                if (multi) {
                    const ta = document.createElement('textarea');
                    ta.value = decodeStr(cur) ?? '';
                    ta.addEventListener('change', () => setProp(owner, key, encodeStr(ta.value.replace(/\r?\n/g, '\r\n'))));
                    ed.appendChild(ta);
                } else {
                    input(decodeStr(cur) ?? '', v => setProp(owner, key, encodeStr(v)));
                }
                break;
            }
            case 'char':
                input(cur ? cur.replace(/^'|'$/g, '') : '', v => setProp(owner, key, v ? `'${v[0] === '\'' ? '\\\'' : v[0]}'` : undefined));
                break;
            case 'int':
                input(cur ?? '', v => setProp(owner, key, v.trim() === '' ? undefined : String(parseInt(v, 10) || 0)), 'number');
                break;
            case 'bool': {
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isTrue(cur, def === 'true');
                cb.addEventListener('change', () => setProp(owner, key, cb.checked === (def === 'true') && key !== 'AutoSize' ? undefined : String(cb.checked)));
                ed.appendChild(cb);
                break;
            }
            case 'point': case 'size': {
                const v = pair(cur) || (k === 'size' && TOOL[short(owner.type || '')] ? TOOL[short(owner.type)].size : [0, 0]);
                const mk = k === 'point' ? pointExpr : sizeExpr;
                const a = input(v[0], () => setProp(owner, key, mk(+a.value || 0, +b.value || 0)), 'number');
                const b = input(v[1], () => setProp(owner, key, mk(+a.value || 0, +b.value || 0)), 'number');
                break;
            }
            case 'color': {
                const c = document.createElement('input');
                c.type = 'color';
                c.value = hexColor(cur);
                c.addEventListener('change', () => setProp(owner, key, colorExpr(c.value)));
                ed.appendChild(c);
                const t = input(cur ?? '', v => setProp(owner, key, v.trim() || undefined));
                t.placeholder = '(predeterminado)';
                t.title = cur || '';
                break;
            }
            case 'font': {
                const f = cssFont(cur) || { family: 'Segoe UI', size: 9, bold: false, italic: false };
                const fam = input(f.family, () => apply());
                const size = input(f.size, () => apply(), 'number');
                size.style.maxWidth = '48px';
                size.step = '0.5';
                const bold = document.createElement('button');
                bold.textContent = 'N';
                bold.title = 'Negrita';
                bold.style.fontWeight = f.bold ? 'bold' : 'normal';
                bold.style.opacity = f.bold ? '1' : '.5';
                bold.addEventListener('click', () => { f.bold = !f.bold; apply(); });
                ed.appendChild(bold);
                const apply = () => setProp(owner, key, fontExpr(fam.value || 'Segoe UI', +size.value || 9, f.bold, f.italic));
                break;
            }
            case 'enum': {
                const s = document.createElement('select');
                const opts = ENUMS[key] || [];
                const curName = cur ? (/\.(\w+)$/.exec(cur) || [])[1] : DEFAULT_ENUM[key];
                s.innerHTML = opts.map(([n]) => `<option ${n === curName ? 'selected' : ''}>${n}</option>`).join('');
                s.addEventListener('change', () => {
                    const o = opts.find(([n]) => n === s.value);
                    setProp(owner, key, s.value === DEFAULT_ENUM[key] ? undefined : o[1]);
                });
                ed.appendChild(s);
                break;
            }
            case 'ref': {
                const s = document.createElement('select');
                const cands = visibleControls().filter(c => /Button/.test(c.type));
                s.innerHTML = '<option value="">(ninguno)</option>' + cands.map(c => `<option ${cur === 'this.' + c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
                s.addEventListener('change', () => setProp(owner, key, s.value ? 'this.' + s.value : undefined));
                ed.appendChild(s);
                break;
            }
            case 'items': {
                const ta = document.createElement('textarea');
                ta.value = itemsOf(owner).join('\n');
                ta.placeholder = 'Un elemento por línea';
                ta.addEventListener('change', () => mutate(() => setItems(owner, ta.value.split(/\r?\n/).filter(x => x !== ''))));
                ed.appendChild(ta);
                row.classList.add('wide');
                break;
            }
            default: {
                const i = input(cur ?? '', v => setProp(owner, key, v.trim() || undefined));
                i.title = 'Expresión C# (se copia tal cual al Designer.cs)';
            }
        }
        return row;
    }

    function rename(c, newName, inp) {
        if (newName === c.name) { return; }
        if (!/^[A-Za-z_]\w*$/.test(newName) || form.controls.some(o => o.name === newName) || newName === form.className) {
            vscode.postMessage({ type: 'error', message: `'${newName}' no es un nombre válido o ya está en uso.` });
            inp.value = c.name;
            return;
        }
        const old = c.name;
        const re = new RegExp(`\\bthis\\.${old}\\b`, 'g');
        mutate(() => {
            c.name = newName;
            form.controls.forEach(o => {
                if (o.parent === old) { o.parent = newName; }
                o.extra = o.extra.map(x => x.replace(re, 'this.' + newName).replace(new RegExp(`^${old}\\.`), newName + '.'));
                for (const k in o.props) { o.props[k] = o.props[k].replace(re, 'this.' + newName); }
            });
            for (const k in form.props) { form.props[k] = form.props[k].replace(re, 'this.' + newName); }
            form.extra = form.extra.map(x => x.replace(re, 'this.' + newName));
            sel = newName;
        });
    }

    function deleteSelected() {
        if (sel === FORM) { return; }
        const doomed = new Set([sel, ...descendants(sel)]);
        mutate(() => {
            form.controls = form.controls.filter(c => !doomed.has(c.name));
            const refs = [...doomed].map(n => 'this.' + n);
            for (const k in form.props) { if (refs.includes(form.props[k].trim())) { delete form.props[k]; } }
            sel = FORM;
        });
    }

    function zorder(front) {
        if (sel === FORM) { return; }
        const c = getCtl(sel);
        mutate(() => {
            form.controls.splice(form.controls.indexOf(c), 1);
            if (front) { form.controls.unshift(c); } else { form.controls.push(c); }
        });
    }

    function nudge(dx, dy, resize) {
        if (sel === FORM) { return; }
        const c = getCtl(sel);
        if (isComponent(c)) { return; }
        mutate(() => {
            if (resize) {
                const s = pair(c.props.Size) || [100, 23];
                c.props.Size = sizeExpr(Math.max(1, s[0] + dx), Math.max(1, s[1] + dy));
            } else {
                const l = pair(c.props.Location) || [0, 0];
                c.props.Location = pointExpr(l[0] + dx, l[1] + dy);
            }
        });
    }

    function copy() {
        if (sel === FORM) { return; }
        const names = new Set([sel, ...descendants(sel)]);
        clipboard = form.controls.filter(c => names.has(c.name)).map(c => JSON.parse(JSON.stringify(c)));
    }
    function paste() {
        if (!clipboard) { return; }
        mutate(() => {
            const map = new Map(), added = [];
            for (const src of clipboard) {
                const c = JSON.parse(JSON.stringify(src));
                c.name = uniqueName(short(c.type));
                map.set(src.name, c.name);
                form.controls.push(c);
                added.push([src.name, c]);
            }
            for (const [old, c] of added) {
                if (map.has(c.parent)) { c.parent = map.get(c.parent); }
                c.events = {};
                c.extra = c.extra.map(x => x.replace(new RegExp(`\\bthis\\.${old}\\b`, 'g'), 'this.' + c.name));
                if (decodeStr(c.props.Text) === old) { c.props.Text = encodeStr(c.name); }
            }
            // la copia principal va desplazada y al frente
            const main = added[0][1];
            const l = pair(main.props.Location);
            if (l) { main.props.Location = pointExpr(l[0] + 12, l[1] + 12); }
            form.controls.splice(form.controls.indexOf(main), 1);
            form.controls.unshift(main);
            sel = main.name;
        });
    }

    // ------------------------------------------------------------------ teclado y barra
    document.addEventListener('keydown', e => {
        const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
        if (e.key === 'F7') { e.preventDefault(); vscode.postMessage({ type: 'viewCode' }); return; }
        if (inField) { return; }
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); return; }
        if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(); deleteSelected(); return; }
        if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
        if (e.key === 'Delete') { e.preventDefault(); deleteSelected(); return; }
        if (e.key === 'Escape' && sel !== FORM) {
            const c = getCtl(sel);
            select(c && c.parent ? c.parent : FORM);
            return;
        }
        const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (arrows[e.key]) {
            e.preventDefault();
            const step = ctrl ? 1 : grid;
            nudge(arrows[e.key][0] * step, arrows[e.key][1] * step, e.shiftKey);
        }
    });

    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);
    $('btnFront').addEventListener('click', () => zorder(true));
    $('btnBack').addEventListener('click', () => zorder(false));
    $('btnCode').addEventListener('click', () => vscode.postMessage({ type: 'viewCode' }));
    $('selCombo').addEventListener('change', e => select(e.target.value));
    $('tabs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) { tab = b.dataset.tab; renderProps(); }
    });
    window.addEventListener('resize', () => renderSelection());
    surfaceScroll.addEventListener('scroll', () => renderSelection());

    window.addEventListener('message', e => {
        const m = e.data;
        if (m.type === 'load') {
            form = m.form;
            grid = m.gridSize || 4;
            if (sel !== FORM && !getCtl(sel)) { sel = FORM; }
            render();
        }
    });

    renderTools('');
    vscode.postMessage({ type: 'ready' });
})();
