import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { Workspace, ProjectInfo, namespaceFor, readCsproj, toIdentifier } from './projects';
import { applySample } from './samples';
import { dotnetCmd, dotnetEnv, explainDotnetError } from './dotnet';
import { generateDesigner } from './designer/model';

export function exec(cmd: string, args: string[], cwd: string): Promise<string> {
    // 'dotnet' se resuelve a la instalación que funciona (ver dotnet.ts) y sus errores se explican
    const isDotnet = cmd === 'dotnet';
    return new Promise((resolve, reject) => {
        execFile(isDotnet ? dotnetCmd() : cmd, args, { cwd, windowsHide: true, env: isDotnet ? dotnetEnv() : process.env }, (err, out, errOut) =>
            err ? reject(new Error(isDotnet ? explainDotnetError((errOut || out || err.message).trim()) : (errOut || out || err.message).trim())) : resolve(out));
    });
}

const NAME_RE = /^[\p{L}_][\p{L}\p{N}_.\-]*$/u;

export interface CreateOptions {
    template: 'console' | 'winforms' | 'classlib';
    lang: 'C#' | 'VB';
    name: string;
    solution?: string;       // agregar a esta .sln
    location?: string;       // o crear <location>/<name>/<name>.sln
    classicMain?: boolean;   // consola C#: Program con Main clásico
    framework?: string;      // net8.0, net9.0... (vacío = el del SDK)
    sample?: string;         // id de un ejemplo de samples.ts
}

/** Crea el proyecto (y la solución si hace falta) como Visual Studio. Devuelve el .csproj/.vbproj. */
export async function createProject(o: CreateOptions, output: vscode.OutputChannel): Promise<string> {
    if (!NAME_RE.test(o.name)) { throw new Error(`'${o.name}' no es un nombre de proyecto válido.`); }
    let slnFile: string;
    let projectDir: string;
    if (o.solution) {
        slnFile = o.solution;
        projectDir = path.join(path.dirname(o.solution), o.name);
    } else {
        if (!o.location) { throw new Error('Falta la ubicación del proyecto.'); }
        const solutionDir = path.join(o.location, o.name);
        if (fs.existsSync(solutionDir) && fs.readdirSync(solutionDir).length) {
            throw new Error(`La carpeta ${solutionDir} ya existe y no está vacía.`);
        }
        fs.mkdirSync(solutionDir, { recursive: true });
        projectDir = path.join(solutionDir, o.name);
        slnFile = path.join(solutionDir, `${o.name}.sln`);
    }
    if (fs.existsSync(projectDir)) { throw new Error(`Ya existe la carpeta ${projectDir}.`); }

    const args = ['new', o.template, '-n', o.name, '-o', projectDir, '-lang', o.lang];
    if (o.template === 'console' && o.lang === 'C#' && o.classicMain) { args.push('--use-program-main'); }
    if (o.framework) { args.push('-f', o.framework); }
    const projFile = path.join(projectDir, o.name + (o.lang === 'VB' ? '.vbproj' : '.csproj'));

    output.appendLine(`> dotnet ${args.join(' ')}`);
    output.appendLine(await exec('dotnet', args, path.dirname(projectDir)));
    if (!fs.existsSync(slnFile)) {
        output.appendLine(await exec('dotnet', ['new', 'sln', '-n', path.basename(slnFile, '.sln'), '-o', path.dirname(slnFile)], path.dirname(slnFile)));
    }
    output.appendLine(await exec('dotnet', ['sln', slnFile, 'add', projFile], path.dirname(slnFile)));
    if (o.sample) { applySample(o.sample, projectDir, toIdentifier(o.name, true), o.lang); }
    return projFile;
}

/** Versiones de .NET instaladas (net8.0, net9.0...), de la más nueva a la más vieja. */
export async function installedFrameworks(): Promise<string[]> {
    try {
        const out = await exec('dotnet', ['--list-sdks'], process.cwd());
        const majors = [...new Set(out.split(/\r?\n/).map(l => /^(\d+)\./.exec(l)?.[1]).filter(Boolean) as string[])];
        return majors.map(Number).filter(m => m >= 5).sort((a, b) => b - a).map(m => `net${m}.0`);
    } catch { return []; }
}

async function askItemName(title: string, def: string, ext: string, folder: string): Promise<string | undefined> {
    const name = await vscode.window.showInputBox({
        title, value: def, valueSelection: [0, def.length],
        validateInput: v => {
            const n = v.replace(new RegExp(`\\${ext}$`, 'i'), '');
            if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(n)) { return 'Debe ser un identificador de C# válido.'; }
            if (fs.existsSync(path.join(folder, n + ext))) { return `Ya existe ${n}${ext} en esta carpeta.`; }
            return undefined;
        },
    });
    return name?.replace(new RegExp(`\\${ext}$`, 'i'), '');
}

function nextFreeName(folder: string, base: string, ext: string): string {
    for (let i = 1; ; i++) {
        if (!fs.existsSync(path.join(folder, `${base}${i}${ext}`))) { return `${base}${i}`; }
    }
}

function usingsFor(p: ProjectInfo, extra: string[] = []): string {
    if (readCsproj(p.file).implicitUsings) { return ''; }
    return ['System', 'System.Collections.Generic', 'System.Linq', 'System.Text', ...extra].map(u => `using ${u};`).join('\n') + '\n\n';
}

async function writeAndOpen(file: string, content: string) {
    fs.writeFileSync(file, content, 'utf8');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
}

const ITEM_TITLE = { class: 'Agregar clase', interface: 'Agregar interfaz', module: 'Agregar módulo' };
const ITEM_BASE = { class: 'Class', interface: 'IInterface', module: 'Module' };

export async function addClass(p: ProjectInfo, folder: string, kind: 'class' | 'interface' | 'module') {
    const vb = p.lang === 'vb';
    if (kind === 'module' && !vb) { vscode.window.showWarningMessage('Los módulos son de Visual Basic; en C# usa una clase static.'); return; }
    const ext = vb ? '.vb' : '.cs';
    const name = await askItemName(ITEM_TITLE[kind], nextFreeName(folder, ITEM_BASE[kind], ext), ext, folder);
    if (!name) { return; }
    const file = path.join(folder, name + ext);
    if (vb) {
        // En VB el espacio de nombres raíz lo pone el proyecto: los archivos no llevan Namespace
        const body = kind === 'module' ? `Module ${name}\n\nEnd Module\n`
            : kind === 'interface' ? `Public Interface ${name}\n\nEnd Interface\n` : `Public Class ${name}\n\nEnd Class\n`;
        await writeAndOpen(file, body);
    } else {
        await writeAndOpen(file,
            `${usingsFor(p)}namespace ${namespaceFor(p, folder)}\n{\n    internal ${kind} ${name}\n    {\n    }\n}\n`);
    }
    registerInLegacyProject(p, [{ file }]);
}

/**
 * Los proyectos clásicos de .NET Framework solo compilan los archivos listados en el .csproj,
 * así que hay que agregarlos como <Compile Include="..."/> (los SDK los incluyen solos).
 */
function registerInLegacyProject(p: ProjectInfo, items: { file: string; subType?: string; dependentUpon?: string }[]) {
    if (!readCsproj(p.file).legacy) { return; }
    let text = fs.readFileSync(p.file, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = items.map(i => {
        const rel = path.relative(p.dir, i.file).replace(/\//g, '\\');
        const inner = [i.subType && `<SubType>${i.subType}</SubType>`, i.dependentUpon && `<DependentUpon>${i.dependentUpon}</DependentUpon>`].filter(Boolean);
        return inner.length
            ? `    <Compile Include="${rel}">${eol}${inner.map(x => `      ${x}`).join(eol)}${eol}    </Compile>`
            : `    <Compile Include="${rel}" />`;
    }).join(eol);
    const m = /<ItemGroup>\s*<Compile\s/i.exec(text);
    if (m) {
        const at = m.index + '<ItemGroup>'.length;
        text = text.slice(0, at) + eol + lines + text.slice(at);
    } else {
        const at = text.lastIndexOf('</Project>');
        text = text.slice(0, at) + `  <ItemGroup>${eol}${lines}${eol}  </ItemGroup>${eol}` + text.slice(at);
    }
    fs.writeFileSync(p.file, text, 'utf8');
}

export async function addForm(p: ProjectInfo, folder: string): Promise<string | undefined> {
    const vb = p.lang === 'vb';
    const data = readCsproj(p.file);
    if (!data.useWindowsForms && !data.legacy) {
        const pick = await vscode.window.showWarningMessage(
            `El proyecto ${p.name} no tiene <UseWindowsForms>. ¿Activarlo? (cambia también el TargetFramework a -windows si hace falta)`, 'Activar', 'Cancelar');
        if (pick !== 'Activar') { return; }
        enableWindowsForms(p.file);
    }
    const ext = vb ? '.vb' : '.cs';
    const name = await askItemName('Agregar Windows Form', nextFreeName(folder, 'Form', ext), ext, folder);
    if (!name) { return; }
    if (vb) {
        const code = path.join(folder, `${name}.vb`);
        const designer = path.join(folder, `${name}.Designer.vb`);
        fs.writeFileSync(code, `Public Class ${name}\n\nEnd Class\n`, 'utf8');
        fs.writeFileSync(designer, emptyVbDesigner(name), 'utf8');
        registerInLegacyProject(p, [{ file: code, subType: 'Form' }, { file: designer, dependentUpon: `${name}.vb` }]);
        return code;
    }
    const ns = namespaceFor(p, folder);
    const code = path.join(folder, `${name}.cs`);
    const designer = path.join(folder, `${name}.Designer.cs`);
    const usings = readCsproj(p.file).implicitUsings ? '' :
        ['System', 'System.Collections.Generic', 'System.ComponentModel', 'System.Data', 'System.Drawing', 'System.Linq', 'System.Text', 'System.Windows.Forms']
            .map(u => `using ${u};`).join('\n') + '\n\n';
    fs.writeFileSync(code,
        `${usings}namespace ${ns}\n{\n    public partial class ${name} : Form\n    {\n        public ${name}()\n        {\n            InitializeComponent();\n        }\n    }\n}\n`, 'utf8');
    fs.writeFileSync(designer, emptyDesigner(ns, name), 'utf8');
    registerInLegacyProject(p, [{ file: code, subType: 'Form' }, { file: designer, dependentUpon: `${name}.cs` }]);
    return code;
}

export function emptyVbDesigner(cls: string): string {
    return generateDesigner({
        lang: 'vb', namespace: '', fileScoped: false, preamble: '', className: cls, events: {}, extra: [], controls: [],
        props: {
            AutoScaleDimensions: 'New System.Drawing.SizeF(8.0!, 20.0!)',
            AutoScaleMode: 'System.Windows.Forms.AutoScaleMode.Font',
            ClientSize: 'New System.Drawing.Size(800, 450)',
            Text: `"${cls}"`,
        },
    });
}

export function emptyDesigner(ns: string, cls: string): string {
    return `namespace ${ns}
{
    partial class ${cls}
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(800, 450);
            this.Text = "${cls}";
        }

        #endregion
    }
}
`;
}

function enableWindowsForms(file: string) {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/<TargetFramework>\s*(net\d+\.\d+)\s*<\/TargetFramework>/i, '<TargetFramework>$1-windows</TargetFramework>');
    if (!/<UseWindowsForms>/i.test(text)) {
        text = text.replace(/<\/TargetFramework>/i, '</TargetFramework>\n    <UseWindowsForms>true</UseWindowsForms>');
    }
    fs.writeFileSync(file, text, 'utf8');
}

export async function addFolder(parent: string) {
    const name = await vscode.window.showInputBox({
        title: 'Nueva carpeta', value: 'NewFolder',
        validateInput: v => !v || /[<>:"/\\|?*]/.test(v) ? 'Nombre no válido.' : fs.existsSync(path.join(parent, v)) ? 'Ya existe.' : undefined,
    });
    if (name) { fs.mkdirSync(path.join(parent, name)); }
}

export async function addPackage(p: ProjectInfo, output: vscode.OutputChannel) {
    const id = await vscode.window.showInputBox({ title: `Agregar paquete NuGet a ${p.name}`, prompt: 'Id del paquete (opcional: Id@versión)', placeHolder: 'Newtonsoft.Json' });
    if (!id) { return; }
    const [pkg, version] = id.split('@');
    const args = ['add', p.file, 'package', pkg.trim(), ...(version ? ['--version', version.trim()] : [])];
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Instalando ${pkg}...` }, async () => {
        try {
            output.appendLine(`> dotnet ${args.join(' ')}`);
            output.appendLine(await exec('dotnet', args, p.dir));
            vscode.window.showInformationMessage(`Paquete ${pkg} agregado a ${p.name}.`);
        } catch (e) {
            output.appendLine((e as Error).message);
            output.show(true);
            vscode.window.showErrorMessage(`No se pudo agregar ${pkg}. Mira la salida para más detalles.`);
        }
    });
}

export async function addProjectReference(ws: Workspace, p: ProjectInfo, output: vscode.OutputChannel) {
    const current = new Set(readCsproj(p.file).projectRefs.map(r => r.toLowerCase()));
    const candidates = ws.allProjects.filter(o => o.file !== p.file && !current.has(o.file.toLowerCase()));
    if (!candidates.length) { vscode.window.showInformationMessage('No hay otros proyectos para referenciar.'); return; }
    const picks = await vscode.window.showQuickPick(candidates.map(c => ({ label: c.name, description: c.file, c })),
        { title: `Agregar referencia de proyecto a ${p.name}`, canPickMany: true });
    if (!picks?.length) { return; }
    try {
        output.appendLine(await exec('dotnet', ['add', p.file, 'reference', ...picks.map(x => x.c.file)], p.dir));
    } catch (e) { vscode.window.showErrorMessage((e as Error).message); }
}

export async function removeReference(p: ProjectInfo, kind: 'package' | 'projectRef', ref: string, output: vscode.OutputChannel) {
    const args = kind === 'package' ? ['remove', p.file, 'package', ref] : ['remove', p.file, 'reference', ref];
    try { output.appendLine(await exec('dotnet', args, p.dir)); }
    catch (e) { vscode.window.showErrorMessage((e as Error).message); }
}

export { toIdentifier };
