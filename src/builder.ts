import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { needsVsMsbuild, findVsMsbuild } from './projects';
import { dotnetCmd, dotnetEnv, explainDotnetError } from './dotnet';

export type BuildKind = 'build' | 'rebuild' | 'clean';

const VERB: Record<BuildKind, string> = { build: 'Compilar', rebuild: 'Recompilar', clean: 'Limpiar' };

// ruta(línea,col[,línea2,col2]): error CS1002: mensaje [proyecto]
const DIAG_RE = /^\s*(.+?)\((\d+),(\d+)(?:,(\d+),(\d+))?\)\s*:\s*(error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/;
// MSBUILD : error MSB1009: ...   /   C:\x\proj.csproj : error NU1101: ...
const GLOBAL_DIAG_RE = /^\s*(.+?)\s*:\s*(error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/;

export class Builder {
    private busy = false;
    readonly output = vscode.window.createOutputChannel('Mini Studio: Compilación');
    readonly diagnostics = vscode.languages.createDiagnosticCollection('miniStudio');

    get isBusy() { return this.busy; }

    /** Compila un .sln o .csproj. Devuelve true si no hubo errores. 'props' son propiedades MSBuild extra (Nombre=valor). */
    async run(kind: BuildKind, target: string, configuration: string, status: (text: string | undefined) => void, props: string[] = []): Promise<boolean> {
        if (this.busy) {
            vscode.window.showWarningMessage('Ya hay una compilación en curso.');
            return false;
        }
        const cfg = vscode.workspace.getConfiguration('miniStudio');
        if (cfg.get<boolean>('build.saveAllBeforeBuild', true)) { await vscode.workspace.saveAll(false); }

        this.busy = true;
        this.diagnostics.clear();
        this.output.clear();
        this.output.show(true);
        const started = Date.now();
        const name = path.basename(target);
        this.output.appendLine(`------ ${VERB[kind]} iniciado: ${name}, Configuración: ${configuration} ------`);
        status(`$(sync~spin) ${VERB[kind]}...`);

        // Los proyectos clásicos de .NET Framework (sin Sdk="...") no compilan bien con 'dotnet build'
        // (p. ej. MSB4216 al generar los .resx): se usa el MSBuild de Visual Studio si está instalado.
        const verbosity = `-v:${cfg.get<string>('build.verbosity', 'minimal')}`;
        let cmd = dotnetCmd();
        let args: string[];
        const vs = needsVsMsbuild(target) ? findVsMsbuild() : undefined;
        if (vs) {
            cmd = vs;
            const t = kind === 'build' ? 'Build' : kind === 'rebuild' ? 'Rebuild' : 'Clean';
            args = [target, `-t:${t}`, `-p:Configuration=${configuration}`, '-nologo', verbosity, '-clp:NoSummary', '-m'];
            if (kind !== 'clean') { args.push('-restore'); }
            this.output.appendLine(`(Proyecto de .NET Framework: se usa ${vs})`);
        } else {
            if (needsVsMsbuild(target)) {
                this.output.appendLine('Aviso: este es un proyecto clásico de .NET Framework y no se encontró el MSBuild de Visual Studio/Build Tools; ' +
                    "'dotnet build' puede fallar (MSB4216). Instala 'Build Tools para Visual Studio' o configura miniStudio.build.msbuildPath.");
            }
            args = [kind === 'rebuild' ? 'build' : kind, target, '-c', configuration, '-nologo', verbosity, '-clp:NoSummary'];
            if (kind === 'rebuild') { args.push('--no-incremental'); }
        }
        if (process.platform !== 'win32' && !vs && !props.some(p => p.startsWith('EnableWindowsTargeting'))) { props = [...props, 'EnableWindowsTargeting=true']; }
        args.push(...props.map(p => `-p:${p}`));

        const byFile = new Map<string, vscode.Diagnostic[]>();
        const seen = new Set<string>();
        let errors = 0, warnings = 0;
        let brokenDotnet = '';
        const handleLine = (line: string) => {
            this.output.appendLine(line);
            if (/hostfxr|host[\\/]fxr|Microsoft\.NET\.Sdk\.WindowsDesktop/i.test(line)) { brokenDotnet = line; }
            const d = parseDiagnostic(line, path.dirname(target));
            if (!d) { return; }
            const key = `${d.file}|${d.diag.range.start.line}|${d.diag.range.start.character}|${d.diag.code}|${d.diag.message}`;
            if (seen.has(key)) { return; }
            seen.add(key);
            if (d.diag.severity === vscode.DiagnosticSeverity.Error) { errors++; } else { warnings++; }
            const list = byFile.get(d.file) ?? [];
            list.push(d.diag);
            byFile.set(d.file, list);
            this.diagnostics.set(vscode.Uri.file(d.file), list);
        };

        const code = await new Promise<number>(resolve => {
            const child = spawn(cmd, args, { cwd: path.dirname(target), windowsHide: true, env: dotnetEnv({ DOTNET_CLI_UI_LANGUAGE: process.env.DOTNET_CLI_UI_LANGUAGE ?? 'es' }) });
            const pipe = (stream: NodeJS.ReadableStream) => {
                let buf = '';
                stream.on('data', (chunk: Buffer) => {
                    buf += chunk.toString('utf8');
                    const lines = buf.split(/\r?\n/);
                    buf = lines.pop() ?? '';
                    lines.forEach(handleLine);
                });
                stream.on('end', () => { if (buf) { handleLine(buf); } });
            };
            pipe(child.stdout);
            pipe(child.stderr);
            child.on('error', err => {
                this.output.appendLine(explainDotnetError(`No se pudo ejecutar '${cmd}': ${err.message}`));
                resolve(-1);
            });
            child.on('close', c => resolve(c ?? -1));
        });

        if (brokenDotnet) {
            const msg = explainDotnetError(brokenDotnet);
            this.output.appendLine('');
            this.output.appendLine(msg);
            vscode.window.showErrorMessage(msg.split('\n')[0]);
        }
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        const ok = code === 0 && errors === 0;
        this.output.appendLine('');
        this.output.appendLine(`========== ${VERB[kind]}: ${ok ? 'correcto' : 'con errores'} · ${errors} error(es), ${warnings} advertencia(s) · ${secs} s ==========`);
        this.busy = false;
        status(undefined);

        if (!ok) {
            if (errors > 0) { vscode.commands.executeCommand('workbench.actions.view.problems'); }
            vscode.window.showErrorMessage(`${VERB[kind]} con errores (${errors} error(es)). Revisa la Lista de errores (Problemas).`);
        } else {
            vscode.window.setStatusBarMessage(`$(check) ${VERB[kind]}: correcto (${secs} s)`, 5000);
        }
        return ok;
    }
}

export function parseDiagnostic(line: string, baseDir: string): { file: string; diag: vscode.Diagnostic } | undefined {
    let m = DIAG_RE.exec(line);
    if (m) {
        const [, file, l1, c1, l2, c2, sev, code, msg] = m;
        const start = new vscode.Position(+l1 - 1, Math.max(0, +c1 - 1));
        const end = l2 ? new vscode.Position(+l2 - 1, Math.max(0, +c2 - 1)) : start.translate(0, 1);
        return { file: path.resolve(baseDir, file), diag: makeDiag(new vscode.Range(start, end), msg, sev, code) };
    }
    m = GLOBAL_DIAG_RE.exec(line);
    if (m) {
        const [, origin, sev, code, msg, proj] = m;
        const file = /\.(cs|vb)proj$|\.sln$/i.test(origin) ? origin : proj;
        if (!file) { return undefined; }
        return { file: path.resolve(baseDir, file), diag: makeDiag(new vscode.Range(0, 0, 0, 1), msg, sev, code) };
    }
    return undefined;
}

function makeDiag(range: vscode.Range, msg: string, sev: string, code: string): vscode.Diagnostic {
    const d = new vscode.Diagnostic(range, msg, sev === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    d.code = code;
    d.source = 'dotnet build';
    return d;
}
