/*
 * Lectura y escritura de X.Designer.cs (InitializeComponent).
 *
 * Todas las propiedades se guardan como expresiones C# en crudo, así que lo que el
 * diseñador no entiende (FlatAppearance.BorderSize, Items.AddRange, etc.) se conserva
 * tal cual al volver a escribir el archivo.
 */

export interface DControl {
    name: string;
    type: string;                  // nombre completo: System.Windows.Forms.Button
    ctorArgs: string;              // "" o "this.components" (componentes no visuales)
    modifier: string;              // private, public...
    parent: string | null;         // null = el formulario
    props: Record<string, string>;
    events: Record<string, string>;
    extra: string[];               // sentencias que no son asignaciones (Items.AddRange...)
}

export interface DForm {
    namespace: string;
    fileScoped: boolean;
    preamble: string;              // usings y comentarios antes de 'namespace'
    className: string;
    props: Record<string, string>;
    events: Record<string, string>;
    extra: string[];
    controls: DControl[];
}

export const WINFORMS_TYPES = [
    'Button', 'Label', 'LinkLabel', 'TextBox', 'RichTextBox', 'MaskedTextBox', 'CheckBox', 'RadioButton', 'ComboBox', 'ListBox',
    'CheckedListBox', 'ListView', 'TreeView', 'PictureBox', 'Panel', 'GroupBox', 'FlowLayoutPanel', 'TableLayoutPanel', 'TabControl',
    'TabPage', 'SplitContainer', 'DataGridView', 'ProgressBar', 'NumericUpDown', 'DateTimePicker', 'MonthCalendar', 'TrackBar',
    'MenuStrip', 'StatusStrip', 'ToolStrip', 'Timer', 'ToolTip', 'OpenFileDialog', 'SaveFileDialog', 'ErrorProvider', 'NotifyIcon',
    'ColorDialog', 'FontDialog', 'FolderBrowserDialog', 'ImageList', 'ContextMenuStrip', 'HScrollBar', 'VScrollBar', 'DomainUpDown',
];

/** Tipos que el diseñador de VS envuelve en BeginInit/EndInit. */
const SUPPORT_INITIALIZE = new Set(['DataGridView', 'PictureBox', 'NumericUpDown', 'TrackBar', 'SplitContainer', 'ErrorProvider']);
export const CONTAINER_TYPES = new Set(['Panel', 'GroupBox', 'FlowLayoutPanel', 'TableLayoutPanel', 'TabPage', 'SplitContainer']);

export function shortType(t: string): string {
    return t.slice(t.lastIndexOf('.') + 1);
}

export function fullType(t: string): string {
    return !t.includes('.') && WINFORMS_TYPES.includes(t) ? `System.Windows.Forms.${t}` : t;
}

// ---------------------------------------------------------------------------
// Escáner de C# que respeta cadenas y comentarios
// ---------------------------------------------------------------------------

/** Recorre el código y llama a fn(i, ch) solo para caracteres fuera de cadenas/comentarios. */
function scan(text: string, from: number, fn: (i: number, ch: string) => boolean | void): void {
    let i = from;
    while (i < text.length) {
        const ch = text[i], nx = text[i + 1];
        if (ch === '/' && nx === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
        if (ch === '/' && nx === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
        if (ch === '@' && nx === '"' || ch === '$' && nx === '@' && text[i + 2] === '"' || ch === '@' && nx === '$' && text[i + 2] === '"') {
            i = text.indexOf('"', i) + 1;
            while (i < text.length) {
                if (text[i] === '"' && text[i + 1] === '"') { i += 2; continue; }
                if (text[i] === '"') { i++; break; }
                i++;
            }
            continue;
        }
        if (ch === '"' || ch === '\'') {
            i++;
            while (i < text.length && text[i] !== ch && text[i] !== '\n') { i += text[i] === '\\' ? 2 : 1; }
            i++;
            continue;
        }
        if (fn(i, ch) === true) { return; }
        i++;
    }
}

export function matchBrace(text: string, open: number): number {
    let depth = 0, found = -1;
    scan(text, open, (i, ch) => {
        if (ch === '{') { depth++; }
        else if (ch === '}' && --depth === 0) { found = i; return true; }
    });
    return found;
}

function stripComments(s: string): string {
    let out = '', last = 0;
    const cuts: [number, number][] = [];
    // marca los rangos de comentarios usando el escáner (lo que no visita y no es cadena)
    let i = 0;
    while (i < s.length) {
        if (s[i] === '"' || s[i] === '\'' || (s[i] === '@' && s[i + 1] === '"')) {
            const startQ = s[i] === '@' ? i + 1 : i;
            const q = s[startQ];
            let j = startQ + 1;
            const verbatim = s[i] === '@';
            while (j < s.length) {
                if (verbatim && s[j] === '"' && s[j + 1] === '"') { j += 2; continue; }
                if (!verbatim && s[j] === '\\') { j += 2; continue; }
                if (s[j] === q) { break; }
                j++;
            }
            i = j + 1;
            continue;
        }
        if (s[i] === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); cuts.push([i, e < 0 ? s.length : e]); i = e < 0 ? s.length : e; continue; }
        if (s[i] === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); const end = e < 0 ? s.length : e + 2; cuts.push([i, end]); i = end; continue; }
        i++;
    }
    for (const [a, b] of cuts) { out += s.slice(last, a); last = b; }
    return out + s.slice(last);
}

function splitStatements(body: string): string[] {
    const out: string[] = [];
    let start = 0, depth = 0;
    scan(body, 0, (i, ch) => {
        if (ch === '(' || ch === '{' || ch === '[') { depth++; }
        else if (ch === ')' || ch === '}' || ch === ']') { depth--; }
        else if (ch === ';' && depth === 0) {
            const st = stripComments(body.slice(start, i)).trim();
            if (st) { out.push(st); }
            start = i + 1;
        }
    });
    return out;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function parseDesigner(text: string): DForm {
    const nsMatch = /^\s*namespace\s+([\w.]+)\s*(;|\{)?/m.exec(text);
    const namespace = nsMatch?.[1] ?? 'WinFormsApp';
    const fileScoped = nsMatch?.[2] === ';';
    const preamble = nsMatch ? text.slice(0, nsMatch.index).replace(/^\s+/, '') : '';
    const clsMatch = /\bpartial\s+class\s+(\w+)/.exec(text);
    const className = clsMatch?.[1] ?? 'Form1';

    // campos de la clase:  private System.Windows.Forms.Button button1;
    const fields = new Map<string, { type: string; modifier: string }>();
    const fieldRe = /^\s*(private|internal|public|protected(?:\s+internal)?)\s+([\w.]+)\s+(\w+)\s*;/gm;
    let m: RegExpExecArray | null;
    while ((m = fieldRe.exec(text))) {
        if (m[3] !== 'components') { fields.set(m[3], { type: m[2], modifier: m[1] }); }
    }

    const form: DForm = { namespace, fileScoped, preamble, className, props: {}, events: {}, extra: [], controls: [] };
    const initIdx = text.search(/void\s+InitializeComponent\s*\(\s*\)/);
    if (initIdx < 0) { return form; }
    const open = text.indexOf('{', initIdx);
    const close = matchBrace(text, open);
    const statements = splitStatements(text.slice(open + 1, close));

    const controls = new Map<string, DControl>();
    const ctl = (n: string) => controls.get(n);

    for (const raw of statements) {
        const s = raw.replace(/^this\./, '');
        if (/^(\w+\.)?(SuspendLayout|ResumeLayout|PerformLayout)\s*\(/.test(s)) { continue; }
        if (/ISupportInitialize/.test(s) && /\.(BeginInit|EndInit)\s*\(\s*\)$/.test(s)) { continue; }
        if (/^components\s*=/.test(s)) { continue; }

        let mm = /^(\w+)\s*=\s*new\s+([\w.]+)\s*\(([\s\S]*)\)$/.exec(s);
        if (mm && (fields.has(mm[1]) || /^[a-z_]/.test(mm[1]) && !/^(ClientSize|AutoScaleDimensions)$/.test(mm[1]))) {
            const f = fields.get(mm[1]);
            const c: DControl = {
                name: mm[1], type: fullType(f?.type ?? mm[2]), ctorArgs: mm[3].trim(), modifier: f?.modifier ?? 'private',
                parent: null, props: {}, events: {}, extra: [],
            };
            controls.set(c.name, c);
            form.controls.push(c);
            continue;
        }
        mm = /^(?:(\w+)\.)?Controls\.Add\(\s*(?:this\.)?(\w+)\s*\)$/.exec(s);
        if (mm && ctl(mm[2])) {
            ctl(mm[2])!.parent = mm[1] && ctl(mm[1]) ? mm[1] : null;
            continue;
        }
        mm = /^(\w+)\.([\w.]+)\s*\+=\s*([\s\S]+)$/.exec(s);
        if (mm && ctl(mm[1])) { ctl(mm[1])!.events[mm[2]] = handlerName(mm[3]); continue; }
        mm = /^(\w+)\.([\w.]+)\s*=\s*([\s\S]+)$/.exec(s);
        if (mm && ctl(mm[1])) {
            if (mm[2] !== 'Name') { ctl(mm[1])!.props[mm[2]] = mm[3].trim(); }
            continue;
        }
        mm = /^(\w+)\s*\+=\s*([\s\S]+)$/.exec(s);
        if (mm) { form.events[mm[1]] = handlerName(mm[2]); continue; }
        mm = /^([\w.]+)\s*=\s*([\s\S]+)$/.exec(s);
        if (mm && !ctl(mm[1].split('.')[0])) {
            if (mm[1] !== 'Name') { form.props[mm[1]] = mm[2].trim(); }
            continue;
        }
        const owner = /^(\w+)\./.exec(s)?.[1];
        if (owner && ctl(owner)) { ctl(owner)!.extra.push(raw); } else { form.extra.push(raw); }
    }

    // campos declarados pero nunca creados en InitializeComponent: se conservan
    for (const [name, f] of fields) {
        if (!controls.has(name)) {
            form.controls.push({ name, type: fullType(f.type), ctorArgs: '', modifier: f.modifier, parent: null, props: {}, events: {}, extra: ['__fieldOnly'] });
        }
    }
    return form;
}

function handlerName(expr: string): string {
    const m = /(?:new\s+[\w.<>]+\s*\(\s*)?(?:this\.)?(\w+)\s*\)?\s*$/.exec(expr.trim());
    return m ? m[1] : expr.trim();
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export function generateDesigner(form: DForm): string {
    const ind = form.fileScoped ? '' : '    ';
    const I2 = ind + '    ', I3 = ind + '        ';
    const visible = form.controls.filter(c => !c.extra.includes('__fieldOnly'));
    const body: string[] = [];
    const st = (s: string) => body.push(I3 + s.replace(/\n/g, '\n' + I3));
    const childrenOf = (parent: string | null) => visible.filter(c => c.parent === parent && !c.ctorArgs);
    const initTypes = visible.filter(c => SUPPORT_INITIALIZE.has(shortType(c.type)));
    const layoutContainers = visible.filter(c => childrenOf(c.name).length > 0);

    st('this.components = new System.ComponentModel.Container();');
    for (const c of visible) { st(`this.${c.name} = new ${c.type}(${c.ctorArgs});`); }
    for (const c of layoutContainers) { st(`this.${c.name}.SuspendLayout();`); }
    for (const c of initTypes) { st(`((System.ComponentModel.ISupportInitialize)(this.${c.name})).BeginInit();`); }
    st('this.SuspendLayout();');

    for (const c of visible) {
        body.push(`${I3}// `, `${I3}// ${c.name}`, `${I3}// `);
        const props: [string, string][] = Object.entries(c.props);
        if (!c.ctorArgs) { props.push(['Name', JSON.stringify(c.name)]); }
        const kids = childrenOf(c.name);
        emitSorted(props, c.name, kids, st);
        for (const x of c.extra) { st(x + ';'); }
        for (const [ev, h] of Object.entries(c.events)) { st(`this.${c.name}.${ev} += new ${eventHandlerType(ev)}(this.${h});`); }
    }

    body.push(`${I3}// `, `${I3}// ${form.className}`, `${I3}// `);
    const fprops: [string, string][] = [...Object.entries(form.props), ['Name', JSON.stringify(form.className)]];
    emitSorted(fprops, '', childrenOf(null), st);
    for (const x of form.extra) { st(x + ';'); }
    for (const [ev, h] of Object.entries(form.events)) { st(`this.${ev} += new ${eventHandlerType(ev)}(this.${h});`); }
    for (const c of initTypes) { st(`((System.ComponentModel.ISupportInitialize)(this.${c.name})).EndInit();`); }
    for (const c of layoutContainers) {
        st(`this.${c.name}.ResumeLayout(false);`);
        st(`this.${c.name}.PerformLayout();`);
    }
    st('this.ResumeLayout(false);');
    st('this.PerformLayout();');

    const fields = form.controls.map(c => `${I2}${c.modifier} ${c.type} ${c.name};`);

    const cls = [
        `${ind}partial class ${form.className}`,
        `${ind}{`,
        `${I2}/// <summary>`,
        `${I2}///  Required designer variable.`,
        `${I2}/// </summary>`,
        `${I2}private System.ComponentModel.IContainer components = null;`,
        '',
        `${I2}/// <summary>`,
        `${I2}///  Clean up any resources being used.`,
        `${I2}/// </summary>`,
        `${I2}/// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>`,
        `${I2}protected override void Dispose(bool disposing)`,
        `${I2}{`,
        `${I3}if (disposing && (components != null))`,
        `${I3}{`,
        `${I3}    components.Dispose();`,
        `${I3}}`,
        `${I3}base.Dispose(disposing);`,
        `${I2}}`,
        '',
        `${I2}#region Windows Form Designer generated code`,
        '',
        `${I2}/// <summary>`,
        `${I2}///  Required method for Designer support - do not modify`,
        `${I2}///  the contents of this method with the code editor.`,
        `${I2}/// </summary>`,
        `${I2}private void InitializeComponent()`,
        `${I2}{`,
        ...body,
        `${I2}}`,
        '',
        `${I2}#endregion`,
        ...(fields.length ? ['', ...fields] : []),
        `${ind}}`,
    ];
    const pre = form.preamble ? form.preamble.replace(/\s*$/, '') + '\n\n' : '';
    return form.fileScoped
        ? `${pre}namespace ${form.namespace};\n\n${cls.join('\n')}\n`
        : `${pre}namespace ${form.namespace}\n{\n${cls.join('\n')}\n}\n`;
}

/** Emite propiedades en orden alfabético como VS, con Controls.Add donde toca. */
function emitSorted(props: [string, string][], owner: string, kids: DControl[], st: (s: string) => void) {
    const target = owner ? `this.${owner}.` : 'this.';
    const all: [string, () => void][] = props.map(([k, v]) => [k, () => st(`${target}${k} = ${v};`)]);
    if (kids.length) {
        all.push(['Controls', () => kids.forEach(k => st(`${target}Controls.Add(this.${k.name});`))]);
    }
    all.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).forEach(([, f]) => f());
}

const EVENT_ARGS: Record<string, string> = {
    KeyPress: 'KeyPress', KeyDown: 'Key', KeyUp: 'Key',
    MouseClick: 'Mouse', MouseDoubleClick: 'Mouse', MouseDown: 'Mouse', MouseUp: 'Mouse', MouseMove: 'Mouse', MouseWheel: 'Mouse',
    FormClosing: 'FormClosing', FormClosed: 'FormClosed', Paint: 'Paint',
    CellClick: 'DataGridViewCell', CellContentClick: 'DataGridViewCell', CellDoubleClick: 'DataGridViewCell', CellValueChanged: 'DataGridViewCell',
    Validating: 'Cancel', FileOk: 'Cancel', LinkClicked: 'LinkLabelLinkClicked', Popup: 'Popup', MaskInputRejected: 'MaskInputRejected',
};

export function eventArgsType(ev: string): string {
    const a = EVENT_ARGS[ev];
    if (!a) { return 'System.EventArgs'; }
    if (a === 'Cancel') { return 'System.ComponentModel.CancelEventArgs'; }
    return `System.Windows.Forms.${a}EventArgs`;
}

export function eventHandlerType(ev: string): string {
    const a = EVENT_ARGS[ev];
    if (!a) { return 'System.EventHandler'; }
    if (a === 'Cancel') { return 'System.ComponentModel.CancelEventHandler'; }
    return `System.Windows.Forms.${a}EventHandler`;
}
