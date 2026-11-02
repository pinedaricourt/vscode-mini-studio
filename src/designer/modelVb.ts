/*
 * Lectura y escritura de X.Designer.vb (Visual Basic).
 *
 * Igual que en C#, las propiedades se guardan como expresiones en crudo (aquí, en sintaxis VB:
 * Me., New, True/False, "texto" con "" para comillas, 9.0! para Single...).
 * Diferencia importante: en VB los eventos NO van en el Designer.vb; los controles se declaran
 * "Friend WithEvents" y los métodos del código usan "Handles Button1.Click" (ver parseVbHandles).
 */
import type { DForm, DControl } from './model';
import { fullType, shortType, SUPPORT_INITIALIZE } from './model';

// ---------------------------------------------------------------------------
// Separar sentencias VB (línea a línea, con continuaciones " _" y paréntesis abiertos)
// ---------------------------------------------------------------------------

function splitVbStatements(body: string): string[] {
    const out: string[] = [];
    let cur = '';
    let depth = 0;
    for (const rawLine of body.split(/\r?\n/)) {
        // quitar el comentario (' fuera de cadenas) y medir paréntesis/llaves
        let line = '', inStr = false;
        for (let i = 0; i < rawLine.length; i++) {
            const ch = rawLine[i];
            if (ch === '"') {
                if (inStr && rawLine[i + 1] === '"') { line += '""'; i++; continue; }
                inStr = !inStr;
            } else if (!inStr) {
                if (ch === '\'') { break; }
                if (/^REM\s/i.test(rawLine.slice(i)) && !line.trim()) { break; }
                if (ch === '(' || ch === '{') { depth++; }
                if (ch === ')' || ch === '}') { depth--; }
            }
            line += ch;
        }
        line = line.trimEnd();
        const cont = / _$/.test(line);
        if (cont) { line = line.slice(0, -2); }
        cur += (cur ? ' ' : '') + line.trim();
        if (!cont && depth <= 0 && !/[,(&{]$/.test(cur)) {
            if (cur.trim()) { out.push(cur.trim()); }
            cur = '';
            depth = 0;
        }
    }
    if (cur.trim()) { out.push(cur.trim()); }
    return out;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function parseVbDesigner(text: string): DForm {
    const nsMatch = /^\s*Namespace\s+([\w.]+)\s*$/mi.exec(text);
    const clsMatch = /^\s*(?:Partial\s+)?(?:(?:Public|Friend|Private)\s+)?(?:Partial\s+)?Class\s+(\w+)/mi.exec(text);
    const inh = /^\s*Inherits\s+([\w.]+)\s*$/mi.exec(text);
    const preambleEnd = Math.min(...[nsMatch?.index, text.search(/^\s*<Global\.Microsoft\.VisualBasic\.CompilerServices\.DesignerGenerated/mi), clsMatch?.index]
        .filter((x): x is number => x !== undefined && x >= 0));
    const preamble = isFinite(preambleEnd) ? text.slice(0, preambleEnd).replace(/^﻿/, '').trim() : '';

    // Friend WithEvents Button1 As System.Windows.Forms.Button
    const fields = new Map<string, { type: string; modifier: string }>();
    const fieldRe = /^\s*(Friend|Private|Public|Protected(?:\s+Friend)?)\s+(?:WithEvents\s+)?(\w+)\s+As\s+([\w.]+)\s*$/gmi;
    let m: RegExpExecArray | null;
    while ((m = fieldRe.exec(text))) {
        if (!/^components$/i.test(m[2])) { fields.set(m[2], { type: m[3], modifier: m[1] }); }
    }
    const fieldOf = (n: string) => [...fields.entries()].find(([k]) => k.toLowerCase() === n.toLowerCase());

    const form: DForm = {
        lang: 'vb', vbInherits: inh?.[1] ?? 'System.Windows.Forms.Form',
        namespace: nsMatch?.[1] ?? '', fileScoped: false, preamble, className: clsMatch?.[1] ?? 'Form1',
        props: {}, events: {}, extra: [], controls: [],
    };

    const start = /Sub\s+InitializeComponent\s*\(\s*\)/i.exec(text);
    if (!start) { return form; }
    const bodyStart = text.indexOf('\n', start.index) + 1;
    const end = /^\s*End\s+Sub\b/mi.exec(text.slice(bodyStart));
    const statements = splitVbStatements(text.slice(bodyStart, end ? bodyStart + end.index : undefined));

    const controls = new Map<string, DControl>();
    const ctl = (n: string) => controls.get(n.toLowerCase());

    for (const raw of statements) {
        const s = raw.replace(/^Me\./i, '');
        if (/^(\w+\.)?(SuspendLayout|ResumeLayout|PerformLayout)\s*\(/i.test(s)) { continue; }
        if (/ISupportInitialize/i.test(s) && /\.(BeginInit|EndInit)\s*\(\s*\)$/i.test(s)) { continue; }
        if (/^components\s*=/i.test(s)) { continue; }

        let mm = /^(\w+)\s*=\s*New\s+([\w.]+)\s*\(([\s\S]*)\)$/i.exec(s);
        if (mm && fieldOf(mm[1])) {
            const [name, f] = fieldOf(mm[1])!;
            const c: DControl = {
                name, type: fullType(f.type.includes('.') ? f.type : mm[2]), ctorArgs: mm[3].trim(), modifier: f.modifier,
                parent: null, props: {}, events: {}, extra: [],
            };
            controls.set(name.toLowerCase(), c);
            form.controls.push(c);
            continue;
        }
        mm = /^(?:(\w+)\.)?Controls\.Add\(\s*(?:Me\.)?(\w+)\s*\)$/i.exec(s);
        if (mm && ctl(mm[2])) {
            ctl(mm[2])!.parent = mm[1] && ctl(mm[1]) ? ctl(mm[1])!.name : null;
            continue;
        }
        // AddHandler Me.Button1.Click, AddressOf Me.Button1_Click (poco común en el diseñador, pero válido)
        mm = /^AddHandler\s+(?:Me\.)?(?:(\w+)\.)?(\w+)\s*,\s*AddressOf\s+(?:Me\.)?(\w+)$/i.exec(s);
        if (mm) {
            if (mm[1] && ctl(mm[1])) { ctl(mm[1])!.events[mm[2]] = mm[3]; } else if (!mm[1]) { form.events[mm[2]] = mm[3]; }
            continue;
        }
        mm = /^(\w+)\.([\w.]+)\s*=\s*([\s\S]+)$/.exec(s);
        if (mm && ctl(mm[1])) {
            if (!/^Name$/i.test(mm[2])) { ctl(mm[1])!.props[mm[2]] = mm[3].trim(); }
            continue;
        }
        mm = /^([\w.]+)\s*=\s*([\s\S]+)$/.exec(s);
        if (mm && !ctl(mm[1].split('.')[0])) {
            if (!/^Name$/i.test(mm[1])) { form.props[mm[1]] = mm[2].trim(); }
            continue;
        }
        const owner = /^(\w+)\./.exec(s)?.[1];
        const target = owner && ctl(owner);
        const normalized = raw.replace(/^(?!Me\.)(\w+)\./, (all, w) => ctl(w) ? `Me.${all}` : all);
        if (target) { target.extra.push(normalized); } else { form.extra.push(raw); }
    }

    for (const [name, f] of fields) {
        if (!ctl(name)) {
            form.controls.push({ name, type: fullType(f.type), ctorArgs: '', modifier: f.modifier, parent: null, props: {}, events: {}, extra: ['__fieldOnly'] });
        }
    }
    return form;
}

/**
 * Eventos declarados en el código VB con "Handles": Sub Button1_Click(...) Handles Button1.Click, Button2.Click
 * owner = null para el formulario (Handles MyBase.Load / Me.Load).
 */
export function parseVbHandles(code: string): { owner: string | null; event: string; handler: string }[] {
    const out: { owner: string | null; event: string; handler: string }[] = [];
    const joined = code.replace(/ _\r?\n\s*/g, ' ');
    const re = /\bSub\s+(\w+)\s*\([^)]*\)\s*Handles[ \t]+([\w., \t]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(joined))) {
        for (const part of m[2].split(',')) {
            const pm = /^\s*(\w+)\.(\w+)\s*$/.exec(part);
            if (!pm) { continue; }
            const owner = /^(Me|MyBase|MyClass)$/i.test(pm[1]) ? null : pm[1];
            out.push({ owner, event: pm[2], handler: m[1] });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export function generateVbDesigner(form: DForm): string {
    const ns = !!form.namespace;
    const ind = ns ? '    ' : '';
    const I2 = ind + '    ', I3 = ind + '        ';
    const visible = form.controls.filter(c => !c.extra.includes('__fieldOnly'));
    const body: string[] = [];
    const st = (s: string) => body.push(I3 + s.replace(/\n/g, '\n' + I3));
    const childrenOf = (parent: string | null) => visible.filter(c => c.parent === parent && !c.ctorArgs);
    const initTypes = visible.filter(c => SUPPORT_INITIALIZE.has(shortType(c.type)));
    const layoutContainers = visible.filter(c => childrenOf(c.name).length > 0);

    st('Me.components = New System.ComponentModel.Container()');
    for (const c of visible) { st(`Me.${c.name} = New ${c.type}(${c.ctorArgs})`); }
    for (const c of layoutContainers) { st(`Me.${c.name}.SuspendLayout()`); }
    for (const c of initTypes) { st(`CType(Me.${c.name}, System.ComponentModel.ISupportInitialize).BeginInit()`); }
    st('Me.SuspendLayout()');

    for (const c of visible) {
        body.push(`${I3}'`, `${I3}'${c.name}`, `${I3}'`);
        const props: [string, string][] = Object.entries(c.props);
        if (!c.ctorArgs) { props.push(['Name', `"${c.name}"`]); }
        emitSorted(props, c.name, childrenOf(c.name), st);
        for (const x of c.extra) { st(x); }
    }

    body.push(`${I3}'`, `${I3}'${form.className}`, `${I3}'`);
    const fprops: [string, string][] = [...Object.entries(form.props), ['Name', `"${form.className}"`]];
    emitSorted(fprops, '', childrenOf(null), st);
    for (const x of form.extra) { st(x); }
    for (const c of initTypes) { st(`CType(Me.${c.name}, System.ComponentModel.ISupportInitialize).EndInit()`); }
    for (const c of layoutContainers) {
        st(`Me.${c.name}.ResumeLayout(False)`);
        st(`Me.${c.name}.PerformLayout()`);
    }
    st('Me.ResumeLayout(False)');
    st('Me.PerformLayout()');

    const fields = form.controls.map(c => `${I2}${vbModifier(c.modifier)} WithEvents ${c.name} As ${c.type}`);

    const cls = [
        `${ind}<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>`,
        `${ind}Partial Class ${form.className}`,
        `${I2}Inherits ${form.vbInherits ?? 'System.Windows.Forms.Form'}`,
        '',
        `${I2}'Form overrides dispose to clean up the component list.`,
        `${I2}<System.Diagnostics.DebuggerNonUserCode()>`,
        `${I2}Protected Overrides Sub Dispose(ByVal disposing As Boolean)`,
        `${I3}Try`,
        `${I3}    If disposing AndAlso components IsNot Nothing Then`,
        `${I3}        components.Dispose()`,
        `${I3}    End If`,
        `${I3}Finally`,
        `${I3}    MyBase.Dispose(disposing)`,
        `${I3}End Try`,
        `${I2}End Sub`,
        '',
        `${I2}'Required by the Windows Form Designer`,
        `${I2}Private components As System.ComponentModel.IContainer`,
        '',
        `${I2}'NOTE: The following procedure is required by the Windows Form Designer`,
        `${I2}'It can be modified using the Windows Form Designer.`,
        `${I2}'Do not modify it using the code editor.`,
        `${I2}<System.Diagnostics.DebuggerStepThrough()>`,
        `${I2}Private Sub InitializeComponent()`,
        ...body,
        `${I2}End Sub`,
        ...(fields.length ? ['', ...fields] : []),
        '',
        `${ind}End Class`,
    ];
    const pre = form.preamble ? form.preamble.replace(/\s*$/, '') + '\n\n' : '';
    return ns
        ? `${pre}Namespace ${form.namespace}\n${cls.join('\n')}\nEnd Namespace\n`
        : `${pre}${cls.join('\n')}\n`;
}

function vbModifier(m: string): string {
    const k = m.toLowerCase();
    return k === 'private' ? 'Private' : k === 'public' ? 'Public' : k.startsWith('protected') ? 'Protected' : 'Friend';
}

function emitSorted(props: [string, string][], owner: string, kids: DControl[], st: (s: string) => void) {
    const target = owner ? `Me.${owner}.` : 'Me.';
    const all: [string, () => void][] = props.map(([k, v]) => [k, () => st(`${target}${k} = ${v}`)]);
    if (kids.length) {
        all.push(['Controls', () => kids.forEach(k => st(`${target}Controls.Add(Me.${k.name})`))]);
    }
    all.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).forEach(([, f]) => f());
}
