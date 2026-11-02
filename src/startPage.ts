import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createProject, installedFrameworks, CreateOptions } from './templates';
import { SAMPLES } from './samples';

const RECENT_KEY = 'miniStudio.recent';
const PENDING_KEY = 'miniStudio.openAfterLoad';

/** Página de inicio estilo Visual Studio: crear proyectos (plantillas y ejemplos) y abrir recientes. */
export class StartPage {
    private static current?: StartPage;
    private readonly panel: vscode.WebviewPanel;

    static show(context: vscode.ExtensionContext, output: vscode.OutputChannel, currentSolution: () => string | undefined) {
        if (StartPage.current) { StartPage.current.panel.reveal(); return; }
        StartPage.current = new StartPage(context, output, currentSolution);
    }

    /** Guarda una solución en la lista de recientes. */
    static remember(context: vscode.ExtensionContext, sln: string) {
        const list = context.globalState.get<string[]>(RECENT_KEY, []).filter(x => x.toLowerCase() !== sln.toLowerCase());
        context.globalState.update(RECENT_KEY, [sln, ...list].slice(0, 12));
    }

    /** Si al abrir esta carpeta había un archivo pendiente (proyecto recién creado), lo devuelve y lo olvida. */
    static takePendingFile(context: vscode.ExtensionContext): string | undefined {
        const pending = context.globalState.get<{ folder: string; file: string }>(PENDING_KEY);
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (pending && folders.some(f => f.uri.fsPath.toLowerCase() === pending.folder.toLowerCase())) {
            context.globalState.update(PENDING_KEY, undefined);
            return pending.file;
        }
        return undefined;
    }

    private constructor(private readonly context: vscode.ExtensionContext, private readonly output: vscode.OutputChannel,
        private readonly currentSolution: () => string | undefined) {
        this.panel = vscode.window.createWebviewPanel('miniStudio.start', 'Mini Studio: Inicio', vscode.ViewColumn.Active,
            { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] });
        this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
        this.panel.webview.html = this.html();
        this.panel.onDidDispose(() => { StartPage.current = undefined; });
        this.panel.webview.onDidReceiveMessage(m => this.onMessage(m));
    }

    private async onMessage(m: any) {
        const post = (msg: any) => this.panel.webview.postMessage(msg);
        switch (m.type) {
            case 'ready': {
                const recent = this.context.globalState.get<string[]>(RECENT_KEY, []).filter(f => fs.existsSync(f));
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                post({
                    type: 'init',
                    frameworks: await installedFrameworks(),
                    recent: recent.map(f => ({ name: path.basename(f).replace(/\.(sln|csproj|vbproj)$/i, ''), path: f })),
                    location: root ?? path.join(os.homedir(), 'source', 'repos'),
                    solution: this.currentSolution(),
                    samples: SAMPLES,
                    windows: process.platform === 'win32',
                });
                break;
            }
            case 'browse': {
                const r = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Seleccionar carpeta', defaultUri: m.current ? vscode.Uri.file(m.current) : undefined });
                if (r?.[0]) { post({ type: 'location', path: r[0].fsPath }); }
                break;
            }
            case 'create': await this.create(m.options as CreateOptions); break;
            case 'openFolder': vscode.commands.executeCommand('workbench.action.files.openFolder'); break;
            case 'openSolution': {
                const r = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Soluciones y proyectos': ['sln', 'csproj', 'vbproj'] }, openLabel: 'Abrir' });
                if (r?.[0]) { await this.openContaining(r[0].fsPath, undefined); }
                break;
            }
            case 'openRecent': await this.openContaining(m.path, undefined); break;
        }
    }

    private async create(o: CreateOptions) {
        let proj: string;
        try {
            if (!o.solution) { fs.mkdirSync(o.location!, { recursive: true }); }
            proj = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Creando ${o.name}...` },
                () => createProject(o, this.output));
        } catch (e) {
            this.panel.webview.postMessage({ type: 'error', message: (e as Error).message });
            return;
        }
        const sln = o.solution ?? path.join(o.location!, o.name, `${o.name}.sln`);
        StartPage.remember(this.context, sln);
        const dir = path.dirname(proj);
        const main = ['Form1.cs', 'Program.cs', 'Program.vb', 'Form1.vb', 'Class1.cs', 'Class1.vb'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
        this.panel.dispose();
        await this.openContaining(sln, main);
    }

    /** Abre la carpeta de la solución (o la revela si ya está en el área de trabajo) y luego el archivo principal. */
    private async openContaining(file: string, mainFile: string | undefined) {
        const folder = path.dirname(file);
        const inWorkspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
        if (inWorkspace) {
            await vscode.commands.executeCommand('miniStudio.refresh');
            if (mainFile) { await vscode.commands.executeCommand('miniStudio.openMainFile', mainFile); }
            return;
        }
        if (mainFile) { await this.context.globalState.update(PENDING_KEY, { folder, file: mainFile }); }
        const empty = !vscode.workspace.workspaceFolders?.length;
        let newWindow = false;
        if (!empty) {
            const pick = await vscode.window.showInformationMessage(`Abrir ${path.basename(folder)}`, 'En esta ventana', 'En una ventana nueva');
            if (!pick) { return; }
            newWindow = pick === 'En una ventana nueva';
        }
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: newWindow });
    }

    private html(): string {
        const w = this.panel.webview;
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const css = w.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'start.css'));
        const js = w.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'start.js'));
        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>Mini Studio: Inicio</title>
</head>
<body>
<div id="app">
  <section id="gallery">
    <h1>Crear un proyecto nuevo</h1>
    <div id="filters"></div>
    <div id="cards"></div>
  </section>
  <section id="config" hidden>
    <button id="back" class="link">← Atrás</button>
    <h1>Configure su nuevo proyecto</h1>
    <p id="cfgTitle" class="muted"></p>
    <label>Nombre del proyecto<input id="name" spellcheck="false"></label>
    <label id="locRow">Ubicación<span class="row"><input id="location" spellcheck="false"><button id="browse">Examinar...</button></span></label>
    <label id="slnRow" class="check" hidden><input type="checkbox" id="addToSln"> <span id="slnLabel"></span></label>
    <label id="fwRow">Framework<select id="framework"></select></label>
    <label id="langRow">Lenguaje<select id="lang"><option>C#</option><option value="VB">Visual Basic</option></select></label>
    <label id="mainRow" class="check"><input type="checkbox" id="classicMain" checked> Usar método Main clásico (class Program { static void Main... })</label>
    <p id="path" class="muted"></p>
    <p id="error" class="error" hidden></p>
    <div class="actions"><button id="create" class="primary">Crear</button></div>
  </section>
  <aside id="side">
    <h2>Introducción</h2>
    <button class="big" id="openSolution"><span>📂</span><div><b>Abrir una solución o proyecto</b><small>Archivo .sln o .csproj</small></div></button>
    <button class="big" id="openFolder"><span>🗀</span><div><b>Abrir una carpeta</b><small>Buscar proyectos .NET dentro</small></div></button>
    <h2>Abrir recientes</h2>
    <div id="recent"><p class="muted">Todavía no hay soluciones recientes.</p></div>
  </aside>
</div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
    }
}
