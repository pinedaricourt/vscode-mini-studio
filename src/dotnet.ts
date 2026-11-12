import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';

/*
 * Localiza un 'dotnet' que funcione. En Linux es común que el 'dotnet' del PATH esté roto
 * (p. ej. "[/usr/lib/dotnet/host/fxr] does not exist ... libhostfxr.so", al mezclar los paquetes
 * de Ubuntu con los de Microsoft) mientras hay otra instalación sana en ~/.dotnet o /usr/share/dotnet.
 */

interface Resolved { cmd: string; root?: string; ok: boolean; error?: string; windowsDesktop?: boolean }
let resolved: Resolved | undefined;

function candidates(): string[] {
    const custom = vscode.workspace.getConfiguration('miniStudio').get<string>('dotnetPath', '').trim();
    const home = os.homedir();
    const list = [custom, 'dotnet'];
    if (process.platform === 'win32') {
        list.push(path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'dotnet', 'dotnet.exe'), path.join(home, '.dotnet', 'dotnet.exe'));
    } else {
        list.push(path.join(home, '.dotnet', 'dotnet'), '/usr/share/dotnet/dotnet', '/usr/lib/dotnet/dotnet', '/usr/lib64/dotnet/dotnet',
            '/usr/local/share/dotnet/dotnet', '/opt/dotnet/dotnet', '/snap/dotnet-sdk/current/dotnet', '/usr/local/bin/dotnet');
    }
    return [...new Set(list.filter(Boolean))];
}

/** Carpeta de la instalación (para DOTNET_ROOT), siguiendo enlaces simbólicos. */
function rootOf(cmd: string): string | undefined {
    try {
        const full = path.isAbsolute(cmd) ? cmd : undefined;
        return full ? path.dirname(fs.realpathSync(full)) : undefined;
    } catch { return undefined; }
}

/**
 * True si algún SDK listado trae Microsoft.NET.Sdk.WindowsDesktop (necesario para compilar Windows Forms).
 * El .NET que empaqueta Ubuntu (/usr/lib/dotnet, compilado por Canonical) no lo incluye; el de Microsoft sí.
 */
function hasWindowsDesktop(listSdks: string): boolean {
    for (const line of listSdks.split(/\r?\n/)) {
        const m = /^(\S+)\s+\[(.+)\]\s*$/.exec(line.trim());
        if (m && fs.existsSync(path.join(m[2], m[1], 'Sdks', 'Microsoft.NET.Sdk.WindowsDesktop'))) { return true; }
    }
    return false;
}

function probe(cmd: string): { ok: boolean; error?: string; root?: string; windowsDesktop?: boolean } {
    if (path.isAbsolute(cmd) && !fs.existsSync(cmd)) { return { ok: false }; }
    const root = rootOf(cmd);
    try {
        const out = execFileSync(cmd, ['--list-sdks'], {
            encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
            env: root ? { ...process.env, DOTNET_ROOT: root } : process.env,
        });
        return out.trim() ? { ok: true, root, windowsDesktop: hasWindowsDesktop(out) } : { ok: false, error: 'No hay ningún SDK de .NET instalado (solo el runtime).' };
    } catch (e) {
        const err = e as { stderr?: string; stdout?: string; message: string };
        return { ok: false, error: (err.stderr || err.stdout || err.message).toString().trim() };
    }
}

/**
 * Busca (una vez) un dotnet con SDK que funcione. Fuera de Windows prefiere uno que pueda compilar
 * Windows Forms (el de Microsoft, p. ej. ~/.dotnet) aunque el del PATH sea el de la distribución.
 */
export function resolveDotnet(force = false): Resolved {
    if (resolved && !force) { return resolved; }
    let firstError: string | undefined;
    let fallback: Resolved | undefined;
    const custom = vscode.workspace.getConfiguration('miniStudio').get<string>('dotnetPath', '').trim();
    for (const c of candidates()) {
        const r = probe(c);
        if (r.ok) {
            const found: Resolved = { cmd: c, root: c === 'dotnet' ? undefined : r.root, ok: true, windowsDesktop: r.windowsDesktop };
            // el ajuste del usuario manda; en Windows cualquier SDK sirve
            if (c === custom || process.platform === 'win32' || r.windowsDesktop) { return resolved = found; }
            fallback = fallback ?? found;
        } else if (r.error && !firstError) { firstError = r.error; }
    }
    if (fallback) { return resolved = fallback; }
    return resolved = { cmd: 'dotnet', ok: false, error: firstError ?? 'No se encontró el comando dotnet.' };
}

/** Texto para cuando el .NET instalado no puede compilar Windows Forms (p. ej. el paquete de Ubuntu). */
export const NO_WINDOWS_DESKTOP =
    'Tu .NET no puede compilar Windows Forms: es el que empaqueta la distribución (p. ej. Ubuntu, en /usr/lib/dotnet), '
    + 'que no incluye Microsoft.NET.Sdk.WindowsDesktop. Instala el .NET de Microsoft en tu carpeta personal (no toca el del sistema): '
    + 'wget https://dot.net/v1/dotnet-install.sh -O ~/dotnet-install.sh && bash ~/dotnet-install.sh --channel 8.0 '
    + '— y luego Recargar ventana: Mini Studio usa ~/.dotnet automáticamente para los proyectos Windows Forms. '
    + 'Las apps de consola sí funcionan con el .NET actual.';

/** True si el dotnet elegido puede compilar proyectos de Windows Forms. */
export function canBuildWindowsDesktop(): boolean {
    const r = resolveDotnet();
    return process.platform === 'win32' || !!r.windowsDesktop;
}

/** Ejecutable de dotnet a usar en todos los comandos. */
export function dotnetCmd(): string {
    return resolveDotnet().cmd;
}

/** Entorno para los procesos de dotnet (DOTNET_ROOT apuntando a la instalación elegida). */
export function dotnetEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const r = resolveDotnet();
    return { ...process.env, ...(r.root ? { DOTNET_ROOT: r.root } : {}), ...extra };
}

/** Convierte los errores típicos de una instalación rota de .NET en un mensaje con la solución. */
export function explainDotnetError(message: string): string {
    if (/Microsoft\.NET\.Sdk\.WindowsDesktop/i.test(message)) { return NO_WINDOWS_DESKTOP + '\n\nDetalle: ' + message; }
    if (/hostfxr|host[\\/]fxr|0x80008083|0x8000809b|0x80008081/i.test(message)) {
        return 'La instalación de .NET está incompleta o mezclada (falta host/fxr). En Ubuntu suele pasar al combinar los paquetes '
            + 'de Ubuntu con los de Microsoft. Solución: sudo apt remove \'dotnet*\' \'aspnetcore*\' \'netstandard*\' && sudo apt install dotnet-sdk-8.0 '
            + '(o instala con el script dotnet-install.sh en ~/.dotnet) y luego Recargar ventana. '
            + 'También puedes indicar la ruta de un dotnet que funcione en el ajuste miniStudio.dotnetPath.\n\nDetalle: ' + message;
    }
    if (/ENOENT|not found|no se reconoce|command not found/i.test(message) && !/\.(cs|vb)proj/i.test(message)) {
        return 'No se encontró el SDK de .NET. Instálalo (https://dotnet.microsoft.com/download) o indica su ruta en el ajuste miniStudio.dotnetPath.\n\nDetalle: ' + message;
    }
    return message;
}

/** Avisa al iniciar si no hay un .NET utilizable, con acceso directo al ajuste. */
export async function warnIfDotnetBroken() {
    const r = resolveDotnet();
    if (r.ok) { return; }
    const pick = await vscode.window.showErrorMessage(`Mini Studio: ${explainDotnetError(r.error ?? '').split('\n')[0]}`, 'Configurar ruta de dotnet', 'Reintentar');
    if (pick === 'Configurar ruta de dotnet') { vscode.commands.executeCommand('workbench.action.openSettings', 'miniStudio.dotnetPath'); }
    if (pick === 'Reintentar') { resolveDotnet(true); await warnIfDotnetBroken(); }
}
