import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { Workspace, ProjectInfo, namespaceFor, readCsproj, toIdentifier } from './projects';

export function exec(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd, windowsHide: true }, (err, out, errOut) =>
            err ? reject(new Error((errOut || out || err.message).trim())) : resolve(out));
    });
}

interface ProjectTemplate { label: string; detail: string; id: string; lang: 'C#' | 'VB' }

const PROJECT_TEMPLATES: ProjectTemplate[] = [
    { label: '$(terminal) Aplicación de consola (C#)', detail: 'Una app que se ejecuta en la línea de comandos.', id: 'console', lang: 'C#' },
    { label: '$(window) Aplicación de Windows Forms (C#)', detail: 'Una app de escritorio con formularios y diseñador visual.', id: 'winforms', lang: 'C#' },
    { label: '$(library) Biblioteca de clases (C#)', detail: 'Un proyecto .dll para compartir código entre proyectos.', id: 'classlib', lang: 'C#' },
    { label: '$(terminal) Aplicación de consola (Visual Basic)', detail: 'App de consola en VB.NET.', id: 'console', lang: 'VB' },
    { label: '$(window) Aplicación de Windows Forms (Visual Basic)', detail: 'App de escritorio en VB.NET (sin diseñador de Mini Studio).', id: 'winforms', lang: 'VB' },
];

const NAME_RE = /^[\p{L}_][\p{L}\p{N}_.\-]*$/u;

/** Asistente "Crear un proyecto" estilo Visual Studio. Devuelve el .csproj creado. */
export async function newProject(ws: Workspace, output: vscode.OutputChannel): Promise<string | undefined> {
    const tpl = await vscode.window.showQuickPick(PROJECT_TEMPLATES, { title: 'Crear un proyecto nuevo', placeHolder: 'Elige una plantilla' });
    if (!tpl) { return; }

    let topLevel = true;
    if (tpl.id === 'console' && tpl.lang === 'C#') {
        const style = await vscode.window.showQuickPick([
            { label: 'Método Main clásico', detail: 'class Program { static void Main(string[] args) ... } — como en los libros y en clase', classic: true },
            { label: 'Instrucciones de nivel superior', detail: 'Program.cs sin clase ni Main (estilo moderno)', classic: false },
        ], { title: 'Estilo de Program.cs' });
        if (!style) { return; }
        topLevel = !style.classic;
    }

    const name = await vscode.window.showInputBox({
        title: 'Nombre del proyecto', value: tpl.id === 'winforms' ? 'WinFormsApp1' : tpl.id === 'console' ? 'ConsoleApp1' : 'ClassLibrary1',
        validateInput: v => NAME_RE.test(v) ? undefined : 'Nombre no válido (usa letras, números, _ . -).',
    });
    if (!name) { return; }

    // ¿Agregar a la solución abierta o crear una nueva?
    let slnFile: string | undefined;
    let projectDir: string;
    const existing = ws.solutions[0];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let addToExisting = false;
    if (existing) {
        const pick = await vscode.window.showQuickPick([
            { label: `Agregar a la solución '${existing.name}'`, add: true },
            { label: 'Crear una solución nueva', add: false },
        ], { title: 'Solución' });
        if (!pick) { return; }
        addToExisting = pick.add;
    }
    if (addToExisting) {
        slnFile = existing.file;
        projectDir = path.join(existing.dir, name);
    } else {
        const loc = await vscode.window.showOpenDialog({
            title: 'Ubicación', canSelectFolders: true, canSelectFiles: false, openLabel: 'Crear aquí',
            defaultUri: root ? vscode.Uri.file(root) : undefined,
        });
        if (!loc?.[0]) { return; }
        const solutionDir = path.join(loc[0].fsPath, name);
        if (fs.existsSync(solutionDir) && fs.readdirSync(solutionDir).length) {
            vscode.window.showErrorMessage(`La carpeta ${solutionDir} ya existe y no está vacía.`);
            return;
        }
        fs.mkdirSync(solutionDir, { recursive: true });
        projectDir = path.join(solutionDir, name);
        slnFile = path.join(solutionDir, `${name}.sln`);
    }
    if (fs.existsSync(projectDir)) {
        vscode.window.showErrorMessage(`Ya existe la carpeta ${projectDir}.`);
        return;
    }

    const args = ['new', tpl.id, '-n', name, '-o', projectDir, '-lang', tpl.lang];
    if (tpl.id === 'console' && tpl.lang === 'C#' && !topLevel) { args.push('--use-program-main'); }
    const projExt = tpl.lang === 'VB' ? '.vbproj' : '.csproj';
    const projFile = path.join(projectDir, name + projExt);

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Creando ${name}...` }, async () => {
        output.appendLine(`> dotnet ${args.join(' ')}`);
        output.appendLine(await exec('dotnet', args, path.dirname(projectDir)));
        if (!fs.existsSync(slnFile!)) {
            output.appendLine(await exec('dotnet', ['new', 'sln', '-n', name, '-o', path.dirname(slnFile!)], path.dirname(slnFile!)));
        }
        output.appendLine(await exec('dotnet', ['sln', slnFile!, 'add', projFile], path.dirname(slnFile!)));
    });
    return projFile;
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

export async function addClass(p: ProjectInfo, folder: string, kind: 'class' | 'interface') {
    if (p.lang !== 'cs') { vscode.window.showWarningMessage('Las plantillas de elementos solo están disponibles para C#.'); return; }
    const ext = '.cs';
    const name = await askItemName(kind === 'class' ? 'Agregar clase' : 'Agregar interfaz',
        nextFreeName(folder, kind === 'class' ? 'Class' : 'IInterface', ext), ext, folder);
    if (!name) { return; }
    const ns = namespaceFor(p, folder);
    const file = path.join(folder, name + ext);
    await writeAndOpen(file,
        `${usingsFor(p)}namespace ${ns}\n{\n    internal ${kind} ${name}\n    {\n    }\n}\n`);
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
    if (p.lang !== 'cs') { vscode.window.showWarningMessage('El diseñador de Mini Studio solo admite formularios en C#.'); return; }
    const data = readCsproj(p.file);
    if (!data.useWindowsForms && !data.legacy) {
        const pick = await vscode.window.showWarningMessage(
            `El proyecto ${p.name} no tiene <UseWindowsForms>. ¿Activarlo? (cambia también el TargetFramework a -windows si hace falta)`, 'Activar', 'Cancelar');
        if (pick !== 'Activar') { return; }
        enableWindowsForms(p.file);
    }
    const name = await askItemName('Agregar Windows Form', nextFreeName(folder, 'Form', '.cs'), '.cs', folder);
    if (!name) { return; }
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
