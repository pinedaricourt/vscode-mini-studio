import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess, execFile } from 'child_process';
import { ProjectInfo, getTargetInfo, TargetInfo, isLegacyProject, isWindowsDesktop, which } from './projects';
import { dotnetCmd, dotnetEnv } from './dotnet';

/** Lanza y detiene la app del proyecto de inicio (sin depurador o con el depurador de C#). */
export class Runner {
    private child?: ChildProcess;
    private terminal?: vscode.Terminal;
    readonly output = vscode.window.createOutputChannel('Mini Studio: Aplicación');
    private readonly runningEmitter = new vscode.EventEmitter<boolean>();
    readonly onDidChangeRunning = this.runningEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.window.onDidCloseTerminal(t => {
            if (t === this.terminal) { this.terminal = undefined; this.fire(); }
        }));
    }

    get isRunning() { return !!this.child || !!this.terminal; }

    private fire() {
        vscode.commands.executeCommand('setContext', 'miniStudio.appRunning', this.isRunning);
        this.runningEmitter.fire(this.isRunning);
    }

    async resolveTarget(p: ProjectInfo, configuration: string, props: string[] = []): Promise<TargetInfo | undefined> {
        let info: TargetInfo;
        try {
            info = await getTargetInfo(p, configuration, props);
        } catch (e) {
            vscode.window.showErrorMessage(`No se pudo leer la salida del proyecto ${p.name}: ${(e as Error).message}`);
            return undefined;
        }
        if (/^library$/i.test(info.outputType)) {
            vscode.window.showErrorMessage(`'${p.name}' es una biblioteca de clases y no se puede iniciar directamente. Establece como proyecto de inicio una app de consola o de Windows Forms.`);
            return undefined;
        }
        if (!info.targetPath || !fs.existsSync(info.targetPath)) {
            vscode.window.showErrorMessage(`No se encontró el ensamblado compilado: ${info.targetPath || '(vacío)'}`);
            return undefined;
        }
        return info;
    }

    /** Ctrl+F5 */
    async startWithoutDebugging(p: ProjectInfo, info: TargetInfo) {
        await this.stop();
        let { cmd, args } = launchCommand(info.targetPath);
        const isConsole = /^exe$/i.test(info.outputType);

        // Fuera de Windows, las apps de escritorio de Windows se corren con Wine (o Mono si es .NET Framework)
        if (process.platform !== 'win32' && !isConsole && isWindowsDesktop(p.file)) {
            const launcher = foreignLauncher(p, info);
            if (!launcher) {
                const pick = await vscode.window.showWarningMessage(
                    `${p.name} es una app de Windows Forms. Para ejecutarla en ${process.platform === 'darwin' ? 'macOS' : 'Linux'} instala Wine` +
                    `${isLegacyProject(p.file) ? ' o Mono' : ''} (p. ej. 'sudo apt install wine64'). Mientras tanto puedes probar la interfaz en el simulador.`,
                    'Abrir simulador', 'Cómo instalar Wine');
                if (pick === 'Abrir simulador') { vscode.commands.executeCommand('miniStudio.previewForm', p.file); }
                if (pick === 'Cómo instalar Wine') { vscode.env.openExternal(vscode.Uri.parse('https://wiki.winehq.org/Download')); }
                return;
            }
            ({ cmd, args } = launcher);
        }

        if (isConsole) {
            const runIn = vscode.workspace.getConfiguration('miniStudio').get<string>('console.runIn', 'integratedTerminal');
            if (runIn === 'externalWindow' && process.platform === 'win32') {
                this.startExternalConsole(p, cmd, args);
                return;
            }
            this.terminal = vscode.window.createTerminal({ name: `▶ ${p.name}`, shellPath: cmd, shellArgs: args, cwd: p.dir, env: dotnetEnv(), iconPath: new vscode.ThemeIcon('run') });
            this.terminal.show();
            this.fire();
            return;
        }

        // Windows Forms / WinExe: se lanza como proceso y su salida va al canal de salida
        this.output.clear();
        this.output.appendLine(`> ${cmd} ${args.join(' ')}`);
        const child = spawn(cmd, args, { cwd: p.dir, env: dotnetEnv() });
        this.child = child;
        child.stdout?.on('data', (d: Buffer) => this.output.append(d.toString('utf8')));
        child.stderr?.on('data', (d: Buffer) => { this.output.append(d.toString('utf8')); this.output.show(true); });
        child.on('error', err => vscode.window.showErrorMessage(`No se pudo iniciar ${p.name}: ${err.message}`));
        child.on('exit', code => {
            this.output.appendLine(`\nEl programa '${p.name}' terminó con código ${code ?? '?'}.`);
            if (this.child === child) { this.child = undefined; this.fire(); }
        });
        this.fire();
    }

    private startExternalConsole(p: ProjectInfo, cmd: string, args: string[]) {
        const script = path.join(os.tmpdir(), `ministudio-run-${process.pid}.cmd`);
        const quoted = [cmd, ...args].map(a => `"${a}"`).join(' ');
        fs.writeFileSync(script, [
            '@echo off',
            `title ${p.name.replace(/[&|<>^]/g, '')}`,
            `cd /d "${p.dir}"`,
            quoted,
            'echo.',
            `echo El programa termino con codigo %errorlevel%. Presione una tecla para cerrar esta ventana . . .`,
            'pause >nul',
        ].join('\r\n'));
        spawn('cmd.exe', ['/c', 'start', '""', `"${script}"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
    }

    /** F5 */
    async startDebugging(p: ProjectInfo, info: TargetInfo, folder: vscode.WorkspaceFolder | undefined) {
        if (process.platform !== 'win32' && isWindowsDesktop(p.file) && !/^exe$/i.test(info.outputType)) {
            vscode.window.showInformationMessage('Fuera de Windows no se puede depurar una app de Windows Forms; se ejecuta sin depurador (Wine/Mono).');
            await this.startWithoutDebugging(p, info);
            return;
        }
        if (!vscode.extensions.getExtension('ms-dotnettools.csharp')) {
            const pick = await vscode.window.showWarningMessage(
                'Para depurar (F5) se necesita la extensión C# de Microsoft. ¿Instalarla ahora? (Mientras tanto puedes usar Ctrl+F5 para iniciar sin depurar.)',
                'Instalar', 'Iniciar sin depurar');
            if (pick === 'Instalar') { await vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-dotnettools.csharp'); }
            else if (pick === 'Iniciar sin depurar') { await this.startWithoutDebugging(p, info); }
            return;
        }
        const isConsole = /^exe$/i.test(info.outputType);
        await vscode.debug.startDebugging(folder, {
            name: `Mini Studio: ${p.name}`,
            // .NET Framework (TargetPath .exe de un proyecto clásico) usa el depurador 'clr'
            type: isLegacyProject(p.file) ? 'clr' : 'coreclr',
            request: 'launch',
            program: info.targetPath,
            cwd: p.dir,
            console: isConsole ? 'integratedTerminal' : 'internalConsole',
            stopAtEntry: false,
            justMyCode: true,
        });
    }

    async stop() {
        if (this.terminal) { this.terminal.dispose(); this.terminal = undefined; }
        const child = this.child;
        this.child = undefined;
        if (child?.pid) {
            if (process.platform === 'win32') {
                await new Promise<void>(r => execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => r()));
            } else {
                child.kill();
            }
        }
        this.fire();
    }
}

/** Wine para apps .NET (autocontenidas win-x64) o Mono/Wine para .NET Framework. */
function foreignLauncher(p: ProjectInfo, info: TargetInfo): { cmd: string; args: string[] } | undefined {
    const wine = which('wine') ?? which('wine64');
    if (isLegacyProject(p.file)) {
        const mono = which('mono');
        if (mono) { return { cmd: mono, args: [info.targetPath] }; }
        return wine ? { cmd: wine, args: [info.targetPath] } : undefined;
    }
    const exe = info.targetPath.replace(/\.dll$/i, '.exe');
    return wine && fs.existsSync(exe) ? { cmd: wine, args: [exe] } : undefined;
}

function launchCommand(targetPath: string): { cmd: string; args: string[] } {
    // En .NET (Core/5+) TargetPath es el .dll; en .NET Framework es el .exe
    return /\.dll$/i.test(targetPath) ? { cmd: dotnetCmd(), args: [targetPath] } : { cmd: targetPath, args: [] };
}
