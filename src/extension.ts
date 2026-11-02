import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { discover, Workspace, ProjectInfo, readCsproj, findProjectForPath, isFormFile, codeFileFor, norm, isLegacyProject, getTargetInfo, runsAs32Bit, wineBuildProps } from './projects';
import { SolutionExplorer, Node } from './solutionExplorer';
import { Builder, BuildKind } from './builder';
import { Runner } from './runner';
import * as templates from './templates';
import { DesignerPanel } from './designer/designerPanel';
import { StartPage } from './startPage';
import { allowCode, registerOpenByDefault } from './designer/openByDefault';

const CONFIGS = ['Debug', 'Release'];

export function activate(context: vscode.ExtensionContext) {
    const explorer = new SolutionExplorer();
    const builder = new Builder();
    const runner = new Runner(context);
    const general = vscode.window.createOutputChannel('Mini Studio');
    let ws: Workspace = { solutions: [], looseProjects: [], allProjects: [] };

    const tree = vscode.window.createTreeView('miniStudio.solutionExplorer', { treeDataProvider: explorer, showCollapseAll: true });
    context.subscriptions.push(tree, builder.output, builder.diagnostics, runner.output, general);

    // ------------------------------------------------------------- estado
    const configuration = () => context.workspaceState.get<string>('configuration', 'Debug');
    const startupFile = () => context.workspaceState.get<string>('startupProject');

    const sbBuild = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sbBuild.command = 'miniStudio.buildSolution';
    sbBuild.text = '$(tools) Compilar';
    sbBuild.tooltip = 'Compilar solución (Ctrl+Shift+B)';
    const sbConfig = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    sbConfig.command = 'miniStudio.toggleConfiguration';
    sbConfig.tooltip = 'Configuración de compilación (clic para cambiar)';
    const sbStart = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    sbStart.command = 'miniStudio.startDebugging';
    const sbRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    sbRun.command = 'miniStudio.startWithoutDebugging';
    sbRun.text = '$(run)';
    sbRun.tooltip = 'Iniciar sin depurar (Ctrl+F5)';
    const sbStop = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    sbStop.command = 'miniStudio.stop';
    sbStop.text = '$(debug-stop)';
    sbStop.tooltip = 'Detener la aplicación (Shift+F5)';
    sbStop.color = new vscode.ThemeColor('debugIcon.stopForeground');
    context.subscriptions.push(sbBuild, sbConfig, sbStart, sbRun, sbStop);

    function startupProject(): ProjectInfo | undefined {
        const s = startupFile();
        return s ? ws.allProjects.find(p => norm(p.file) === norm(s)) : undefined;
    }

    function updateStatus(busyText?: string) {
        const has = ws.allProjects.length > 0;
        vscode.commands.executeCommand('setContext', 'miniStudio.hasProjects', has);
        if (!has) { [sbBuild, sbConfig, sbStart, sbRun, sbStop].forEach(i => i.hide()); return; }
        sbBuild.text = busyText ?? '$(tools) Compilar';
        sbConfig.text = `$(gear) ${configuration()}`;
        const sp = startupProject();
        sbStart.text = `$(debug-start) ${sp ? sp.name : 'Iniciar'}`;
        sbStart.tooltip = sp ? `Iniciar depuración de ${sp.name} (F5) — clic derecho en un proyecto del explorador para cambiarlo` : 'Iniciar depuración (F5)';
        [sbBuild, sbConfig, sbStart, sbRun].forEach(i => i.show());
        if (runner.isRunning) { sbStop.show(); } else { sbStop.hide(); }
    }
    runner.onDidChangeRunning(() => updateStatus());

    // ------------------------------------------------------------- descubrimiento
    let refreshTimer: NodeJS.Timeout | undefined;
    async function refresh() {
        ws = await discover();
        // proyecto de inicio por defecto: el primer ejecutable
        if (!startupProject()) {
            const exe = ws.allProjects.find(p => /exe/i.test(readCsproj(p.file).outputType)) ?? ws.allProjects[0];
            await context.workspaceState.update('startupProject', exe?.file);
        }
        explorer.setWorkspace(ws, startupFile());
        updateStatus();
        updateFormContext();
        if (ws.solutions.length) { StartPage.remember(context, ws.solutions[0].file); }
    }
    const scheduleRefresh = (uri?: vscode.Uri) => {
        if (uri && /[\\/](bin|obj|\.git|\.vs)[\\/]/i.test(uri.fsPath)) { return; }
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 300);
    };
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    watcher.onDidChange(u => { if (/\.(sln|csproj|vbproj)$/i.test(u.fsPath)) { scheduleRefresh(u); } });
    context.subscriptions.push(watcher, vscode.workspace.onDidChangeWorkspaceFolders(() => refresh()));

    function updateFormContext() {
        const f = vscode.window.activeTextEditor?.document.uri.fsPath;
        vscode.commands.executeCommand('setContext', 'miniStudio.isFormFile', !!f && isFormFile(codeFileFor(f)));
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateFormContext));
    registerOpenByDefault(context, file => DesignerPanel.open(context, file));

    // ------------------------------------------------------------- utilidades de comandos
    /** Proyecto a partir del nodo del árbol, del archivo activo o preguntando. */
    async function resolveProject(n?: Node): Promise<ProjectInfo | undefined> {
        if (n?.project) { return n.project; }
        const active = vscode.window.activeTextEditor?.document.uri.fsPath;
        const fromActive = active ? findProjectForPath(ws, active) : undefined;
        if (fromActive) { return fromActive; }
        if (ws.allProjects.length === 1) { return ws.allProjects[0]; }
        const pick = await vscode.window.showQuickPick(ws.allProjects.map(p => ({ label: p.name, description: p.file, p })), { title: 'Elige un proyecto' });
        return pick?.p;
    }

    function folderOf(n: Node | undefined, p: ProjectInfo): string {
        if (n?.kind === 'folder' && n.fsPath) { return n.fsPath; }
        const active = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!n && active && findProjectForPath(ws, active) === p) { return path.dirname(active); }
        return p.dir;
    }

    function buildTarget(): string | undefined {
        if (ws.solutions.length) { return ws.solutions[0].file; }
        return startupProject()?.file ?? ws.allProjects[0]?.file;
    }

    async function build(kind: BuildKind, target: string | undefined, props: string[] = []) {
        if (!target) { vscode.window.showWarningMessage('No hay ninguna solución ni proyecto para compilar.'); return false; }
        return builder.run(kind, target, configuration(), t => updateStatus(t), props);
    }

    async function ensureStartup(): Promise<ProjectInfo | undefined> {
        let p = startupProject();
        if (!p) {
            const exes = ws.allProjects.filter(x => /exe/i.test(readCsproj(x.file).outputType));
            if (!exes.length) { vscode.window.showWarningMessage('No hay ningún proyecto ejecutable (consola o Windows Forms).'); return; }
            p = exes[0];
            await context.workspaceState.update('startupProject', p.file);
            refresh();
        }
        return p;
    }

    async function start(debug: boolean) {
        const p = await ensureStartup();
        if (!p) { return; }
        if (builder.isBusy) { return; }
        // El depurador de la extensión C# solo depura procesos de .NET Framework de 64 bits, y los
        // proyectos clásicos traen "Preferir 32 bits" activado: para F5 se compila sin esa preferencia.
        // Fuera de Windows, WinForms se compila autocontenida para win-x64 y se corre con Wine
        const props: string[] = wineBuildProps(p);
        if (debug && isLegacyProject(p.file) && process.platform === 'win32') {
            if (/<PlatformTarget>\s*x86\s*<\/PlatformTarget>/i.test(fs.readFileSync(p.file, 'utf8'))) {
                const pick = await vscode.window.showWarningMessage(
                    `${p.name} está configurado como x86 (32 bits) y el depurador de VS Code solo depura .NET Framework de 64 bits. ` +
                    'Cambia el destino de plataforma a AnyCPU o x64, o ejecútalo sin depurar.', 'Iniciar sin depurar');
                if (pick) { await start(false); }
                return;
            }
            props.push('Prefer32Bit=false');
        }
        // Cambiar Prefer32Bit no invalida la compilación incremental: si el .exe actual es de 32 bits, se recompila.
        let kind: BuildKind = 'build';
        if (props.includes('Prefer32Bit=false')) {
            const prev = await getTargetInfo(p, configuration(), props).catch(() => undefined);
            if (prev && runsAs32Bit(prev.targetPath)) { kind = 'rebuild'; }
        }
        if (!await build(kind, p.file, props)) { return; }
        const info = await runner.resolveTarget(p, configuration(), props);
        if (!info) { return; }
        if (debug) { await runner.startDebugging(p, info, vscode.workspace.getWorkspaceFolder(vscode.Uri.file(p.file))); }
        else { await runner.startWithoutDebugging(p, info); }
    }

    const reg = (id: string, fn: (...a: any[]) => any) =>
        context.subscriptions.push(vscode.commands.registerCommand(id, async (...a) => {
            try { await fn(...a); } catch (e) { vscode.window.showErrorMessage((e as Error).message); }
        }));

    // ------------------------------------------------------------- comandos
    reg('miniStudio.refresh', refresh);

    const showStart = () => StartPage.show(context, general, () => ws.solutions[0]?.file);
    reg('miniStudio.newProject', showStart);
    reg('miniStudio.startPage', showStart);

    /** Abre el archivo principal de un proyecto recién creado: el diseñador si es un formulario. */
    reg('miniStudio.openMainFile', async (file: string) => {
        await refresh();
        const proj = findProjectForPath(ws, file);
        if (proj && /exe/i.test(readCsproj(proj.file).outputType)) { await context.workspaceState.update('startupProject', proj.file); await refresh(); }
        if (isFormFile(file)) { DesignerPanel.open(context, file); }
        else { allowCode(file); await vscode.window.showTextDocument(vscode.Uri.file(file)); }
    });

    /** Simulador: abre el formulario principal del proyecto (o el indicado) en modo vista previa. */
    reg('miniStudio.previewForm', async (arg?: string | Node | vscode.Uri) => {
        let file = typeof arg === 'string' ? arg : arg instanceof vscode.Uri ? arg.fsPath : arg?.fsPath ?? arg?.project?.file;
        file = file ?? DesignerPanel.activeCodeFile() ?? vscode.window.activeTextEditor?.document.uri.fsPath ?? startupProject()?.file;
        if (!file) { return; }
        if (/\.(cs|vb)proj$/i.test(file) || fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            const proj = /\.(cs|vb)proj$/i.test(file) ? file : findProjectForPath(ws, path.join(file, 'x'))?.file;
            file = proj ? mainFormOf(path.dirname(proj)) : undefined;
            if (!file) { vscode.window.showWarningMessage('Este proyecto no tiene formularios que simular.'); return; }
        }
        if (!isFormFile(codeFileFor(file))) { vscode.window.showWarningMessage('El simulador funciona con formularios de Windows Forms (Form1.cs / Form1.vb).'); return; }
        DesignerPanel.open(context, codeFileFor(file), true);
    });

    reg('miniStudio.buildSolution', () => build('build', buildTarget()));
    reg('miniStudio.rebuildSolution', () => build('rebuild', buildTarget()));
    reg('miniStudio.cleanSolution', () => build('clean', buildTarget()));
    reg('miniStudio.buildProject', async (n?: Node) => build('build', (await resolveProject(n))?.file));
    reg('miniStudio.rebuildProject', async (n?: Node) => build('rebuild', (await resolveProject(n))?.file));
    reg('miniStudio.cleanProject', async (n?: Node) => build('clean', (await resolveProject(n))?.file));

    reg('miniStudio.startDebugging', () => start(true));
    reg('miniStudio.startWithoutDebugging', () => start(false));
    reg('miniStudio.stop', () => runner.stop());

    reg('miniStudio.setStartupProject', async (n?: Node) => {
        const p = await resolveProject(n);
        if (!p) { return; }
        await context.workspaceState.update('startupProject', p.file);
        await refresh();
    });
    reg('miniStudio.selectStartupProject', async () => {
        const pick = await vscode.window.showQuickPick(ws.allProjects.map(p => ({
            label: p.name, description: readCsproj(p.file).outputType, detail: p.file, p,
        })), { title: 'Proyecto de inicio' });
        if (pick) { await context.workspaceState.update('startupProject', pick.p.file); await refresh(); }
    });
    reg('miniStudio.toggleConfiguration', async () => {
        const next = CONFIGS[(CONFIGS.indexOf(configuration()) + 1) % CONFIGS.length];
        await context.workspaceState.update('configuration', next);
        updateStatus();
    });

    reg('miniStudio.addClass', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addClass(p, folderOf(n, p), 'class'); }
    });
    reg('miniStudio.addInterface', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addClass(p, folderOf(n, p), 'interface'); }
    });
    reg('miniStudio.addModule', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addClass(p, folderOf(n, p), 'module'); }
    });
    reg('miniStudio.addForm', async (n?: Node) => {
        const p = await resolveProject(n);
        if (!p) { return; }
        const file = await templates.addForm(p, folderOf(n, p));
        if (file) { await refresh(); DesignerPanel.open(context, file); }
    });
    reg('miniStudio.addFolder', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addFolder(n?.kind === 'folder' && n.fsPath ? n.fsPath : p.dir); }
    });
    reg('miniStudio.addPackage', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addPackage(p, general); explorer.setWorkspace(ws, startupFile()); }
    });
    reg('miniStudio.addProjectReference', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await templates.addProjectReference(ws, p, general); explorer.setWorkspace(ws, startupFile()); }
    });
    reg('miniStudio.removeReference', async (n?: Node) => {
        if (!n?.project || !n.refName) { return; }
        const ok = await vscode.window.showWarningMessage(`¿Quitar '${n.label}' de ${n.project.name}?`, { modal: true }, 'Quitar');
        if (ok) { await templates.removeReference(n.project, n.kind === 'package' ? 'package' : 'projectRef', n.refName, general); explorer.setWorkspace(ws, startupFile()); }
    });

    reg('miniStudio.openDesigner', (arg?: Node | vscode.Uri) => {
        const file = arg instanceof vscode.Uri ? arg.fsPath : arg?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!file) { return; }
        DesignerPanel.open(context, codeFileFor(file));
    });
    reg('miniStudio.viewCode', async (arg?: Node) => {
        const file = arg?.fsPath ?? DesignerPanel.activeCodeFile();
        if (file) { allowCode(codeFileFor(file)); await vscode.window.showTextDocument(vscode.Uri.file(codeFileFor(file))); }
    });
    reg('miniStudio.openProjectFile', async (n?: Node) => {
        const p = await resolveProject(n);
        if (p) { await vscode.window.showTextDocument(vscode.Uri.file(p.file)); }
    });
    reg('miniStudio.revealInOS', (n?: Node) => {
        const target = n?.kind === 'solution' ? n.solution!.file : n?.fsPath;
        if (target) { vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target)); }
    });
    reg('miniStudio.deleteItem', async (n?: Node) => {
        if (!n?.fsPath) { return; }
        const related = n.kind === 'form' || /\.(cs|vb)$/i.test(n.fsPath)
            ? [n.fsPath.replace(/\.(cs|vb)$/i, '.Designer.$1'), n.fsPath.replace(/\.(cs|vb)$/i, '.resx')].filter(f => f !== n.fsPath && fs.existsSync(f))
            : [];
        const names = [n.fsPath, ...related].map(f => path.basename(f)).join(', ');
        const ok = await vscode.window.showWarningMessage(`¿Enviar a la papelera: ${names}?`, { modal: true }, 'Eliminar');
        if (!ok) { return; }
        for (const f of [n.fsPath, ...related]) {
            await vscode.workspace.fs.delete(vscode.Uri.file(f), { recursive: true, useTrash: true });
        }
        await refresh();
    });

    refresh().then(async () => {
        // proyecto recién creado desde la página de inicio: abrir su archivo principal
        const pending = StartPage.takePendingFile(context);
        if (pending && fs.existsSync(pending)) { await vscode.commands.executeCommand('miniStudio.openMainFile', pending); }
    });
    // ventana vacía: mostrar la página de inicio, como la ventana de inicio de Visual Studio
    if (!vscode.workspace.workspaceFolders?.length && vscode.workspace.getConfiguration('miniStudio').get<boolean>('startPage.showOnStartup', true)) {
        showStart();
    }
}

/** Formulario principal: el de Application.Run(new X()) en Program.cs, o el primero que haya. */
function mainFormOf(dir: string): string | undefined {
    const program = ['Program.cs', 'Program.vb'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    // C#: Application.Run(new Form1())  ·  VB: Application.Run(Form1) / Application.Run(New Form1)
    const m = program ? /Application\.Run\(\s*(?:new\s+)?([\w.]+)\s*[()]/i.exec(fs.readFileSync(program, 'utf8')) : null;
    const forms: string[] = [];
    const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (!/^(bin|obj|\..*)$/i.test(e.name)) { walk(full); } }
            else if (isFormFile(full)) { forms.push(full); }
        }
    };
    walk(dir);
    const wanted = m?.[1].split('.').pop();
    return forms.find(f => path.basename(f).replace(/\.(cs|vb)$/i, '').toLowerCase() === wanted?.toLowerCase()) ?? forms[0];
}

export function deactivate() { /* nada */ }
