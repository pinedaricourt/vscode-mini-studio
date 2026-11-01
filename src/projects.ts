import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile, execFileSync } from 'child_process';

export interface ProjectInfo {
    name: string;
    file: string;          // ruta absoluta del .csproj/.vbproj
    dir: string;
    lang: 'cs' | 'vb';
}

export interface SolutionInfo {
    name: string;
    file: string;
    dir: string;
    projects: ProjectInfo[];
}

export interface Workspace {
    solutions: SolutionInfo[];
    looseProjects: ProjectInfo[];   // proyectos que no están en ninguna .sln
    allProjects: ProjectInfo[];
}

export interface CsprojData {
    legacy: boolean;               // proyecto clásico de .NET Framework (no SDK)
    outputType: string;            // Exe, WinExe, Library
    targetFramework: string;
    useWindowsForms: boolean;
    implicitUsings: boolean;
    rootNamespace?: string;
    packages: { name: string; version: string }[];
    projectRefs: string[];         // rutas absolutas
}

const EXCLUDE = '**/{bin,obj,node_modules,.git,.vs}/**';

export async function discover(): Promise<Workspace> {
    const [slnUris, projUris] = await Promise.all([
        vscode.workspace.findFiles('**/*.sln', EXCLUDE),
        vscode.workspace.findFiles('**/*.{csproj,vbproj}', EXCLUDE),
    ]);
    const allProjects = projUris.map(u => toProject(u.fsPath)).sort((a, b) => a.name.localeCompare(b.name));
    const byPath = new Map(allProjects.map(p => [norm(p.file), p]));
    const inSolution = new Set<string>();

    const solutions: SolutionInfo[] = [];
    for (const u of slnUris) {
        const file = u.fsPath;
        const dir = path.dirname(file);
        const projects: ProjectInfo[] = [];
        for (const rel of parseSlnProjects(file)) {
            const abs = path.resolve(dir, rel);
            const p = byPath.get(norm(abs)) ?? (fs.existsSync(abs) ? toProject(abs) : undefined);
            if (p) { projects.push(p); inSolution.add(norm(p.file)); }
        }
        solutions.push({ name: path.basename(file, '.sln'), file, dir, projects });
    }
    solutions.sort((a, b) => a.name.localeCompare(b.name));
    const looseProjects = allProjects.filter(p => !inSolution.has(norm(p.file)));
    return { solutions, looseProjects, allProjects };
}

function toProject(file: string): ProjectInfo {
    return {
        name: path.basename(file).replace(/\.(cs|vb)proj$/i, ''),
        file,
        dir: path.dirname(file),
        lang: file.toLowerCase().endsWith('.vbproj') ? 'vb' : 'cs',
    };
}

export function norm(p: string): string {
    return path.normalize(p).toLowerCase();
}

function parseSlnProjects(file: string): string[] {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out: string[] = [];
    const re = /^Project\("\{[^}]+\}"\)\s*=\s*"[^"]*",\s*"([^"]+\.(?:cs|vb)proj)"/gmi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) { out.push(m[1].replace(/\\/g, path.sep)); }
    return out;
}

export function readCsproj(file: string): CsprojData {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* vacío */ }
    const tag = (name: string) => {
        const m = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'i').exec(text);
        return m ? m[1] : undefined;
    };
    const packages: { name: string; version: string }[] = [];
    const pkgRe = /<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/gi;
    let m: RegExpExecArray | null;
    while ((m = pkgRe.exec(text))) { packages.push({ name: m[1], version: m[2] ?? '' }); }
    const projectRefs: string[] = [];
    const refRe = /<ProjectReference\s+Include="([^"]+)"/gi;
    while ((m = refRe.exec(text))) { projectRefs.push(path.resolve(path.dirname(file), m[1].replace(/\\/g, path.sep))); }
    const legacy = !isSdkStyle(text);
    const fxVersion = tag('TargetFrameworkVersion');
    return {
        legacy,
        outputType: tag('OutputType') ?? 'Library',
        targetFramework: tag('TargetFramework') ?? tag('TargetFrameworks')?.split(';')[0]
            ?? (fxVersion ? 'net' + fxVersion.replace(/^v/i, '').replace(/\./g, '') : ''),
        useWindowsForms: /^true$/i.test(tag('UseWindowsForms') ?? '') || legacy && /<Reference\s+Include="System\.Windows\.Forms"/i.test(text),
        implicitUsings: /^(enable|true)$/i.test(tag('ImplicitUsings') ?? ''),
        rootNamespace: tag('RootNamespace'),
        packages,
        projectRefs,
    };
}

function isSdkStyle(text: string): boolean {
    return /<Project[^>]*\sSdk\s*=/i.test(text) || /<Import\s+Project="Sdk\.props"/i.test(text) || /<Sdk\s+Name=/i.test(text);
}

/** True si el proyecto es del formato clásico de .NET Framework (sin Sdk="..."). */
export function isLegacyProject(file: string): boolean {
    try { return !isSdkStyle(fs.readFileSync(file, 'utf8')); } catch { return false; }
}

/** True si el .sln o .csproj necesita el MSBuild de Visual Studio (algún proyecto clásico). */
export function needsVsMsbuild(target: string): boolean {
    if (/\.sln$/i.test(target)) {
        const dir = path.dirname(target);
        return parseSlnProjects(target).some(rel => isLegacyProject(path.resolve(dir, rel)));
    }
    return isLegacyProject(target);
}

let vsMsbuild: string | null | undefined;

/** Ruta a MSBuild.exe de Visual Studio / Build Tools (vía vswhere), o undefined si no hay. */
export function findVsMsbuild(): string | undefined {
    if (vsMsbuild !== undefined) { return vsMsbuild ?? undefined; }
    vsMsbuild = null;
    const custom = vscode.workspace.getConfiguration('miniStudio').get<string>('build.msbuildPath');
    if (custom && fs.existsSync(custom)) { return vsMsbuild = custom; }
    const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (fs.existsSync(vswhere)) {
        try {
            const out = execFileSync(vswhere,
                ['-latest', '-products', '*', '-requires', 'Microsoft.Component.MSBuild', '-find', 'MSBuild\\**\\Bin\\MSBuild.exe'],
                { encoding: 'utf8', windowsHide: true });
            const first = out.split(/\r?\n/).map(s => s.trim()).find(s => s && fs.existsSync(s));
            if (first) { vsMsbuild = first; }
        } catch { /* sin Visual Studio */ }
    }
    return vsMsbuild ?? undefined;
}

/** Espacio de nombres raíz del proyecto (como lo calcula MSBuild). */
export function rootNamespace(p: ProjectInfo): string {
    return readCsproj(p.file).rootNamespace ?? toIdentifier(p.name, true);
}

/** Espacio de nombres para un archivo dentro de una subcarpeta del proyecto. */
export function namespaceFor(p: ProjectInfo, folder: string): string {
    const rel = path.relative(p.dir, folder);
    const parts = rel && !rel.startsWith('..') ? rel.split(path.sep).map(s => toIdentifier(s, false)) : [];
    return [rootNamespace(p), ...parts].join('.');
}

export function toIdentifier(name: string, dotted: boolean): string {
    const segs = (dotted ? name.split('.') : [name]).map(s => {
        let id = s.replace(/[^\p{L}\p{N}_]/gu, '_');
        if (!id || /^\p{N}/u.test(id)) { id = '_' + id; }
        return id;
    });
    return segs.join('.');
}

export function findProjectForPath(ws: Workspace, file: string): ProjectInfo | undefined {
    const f = norm(file);
    let best: ProjectInfo | undefined;
    for (const p of ws.allProjects) {
        const d = norm(p.dir) + path.sep;
        if (f.startsWith(d) && (!best || p.dir.length > best.dir.length)) { best = p; }
    }
    return best;
}

export interface TargetInfo {
    targetPath: string;
    outputType: string;
}

const targetCache = new Map<string, { mtime: number; info: TargetInfo }>();

/** Pregunta a MSBuild dónde queda el ensamblado de salida. */
export async function getTargetInfo(p: ProjectInfo, configuration: string): Promise<TargetInfo> {
    const key = `${norm(p.file)}|${configuration}`;
    const mtime = fs.statSync(p.file).mtimeMs;
    const cached = targetCache.get(key);
    if (cached && cached.mtime === mtime) { return cached.info; }

    const vs = isLegacyProject(p.file) ? findVsMsbuild() : undefined;
    const [cmd, pre] = vs ? [vs, []] : ['dotnet', ['msbuild']];
    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(cmd, [...pre, p.file, '-nologo', '-getProperty:TargetPath', '-getProperty:OutputType', `-p:Configuration=${configuration}`],
            { cwd: p.dir, windowsHide: true }, (err, out, errOut) => err ? reject(new Error(errOut || out || err.message)) : resolve(out));
    });
    const json = JSON.parse(stdout);
    const info: TargetInfo = { targetPath: json.Properties.TargetPath, outputType: json.Properties.OutputType };
    targetCache.set(key, { mtime, info });
    return info;
}

/**
 * Lee la cabecera CLR del ensamblado y dice si se ejecutará como proceso de 32 bits
 * (flags 32BITREQUIRED o 32BITPREFERRED, o PE32 sin ILONLY). undefined si no se puede leer.
 */
export function runsAs32Bit(file: string): boolean | undefined {
    let b: Buffer;
    try { b = fs.readFileSync(file); } catch { return undefined; }
    try {
        const pe = b.readUInt32LE(0x3c);
        if (b.readUInt32LE(pe) !== 0x4550) { return undefined; }
        const sections = b.readUInt16LE(pe + 6);
        const optSize = b.readUInt16LE(pe + 20);
        const opt = pe + 24;
        const pe32plus = b.readUInt16LE(opt) === 0x20b;
        if (pe32plus) { return false; }
        const cliDir = opt + 96 + 14 * 8;
        const cliRva = b.readUInt32LE(cliDir);
        if (!cliRva) { return true; }
        const secTable = opt + optSize;
        for (let i = 0; i < sections; i++) {
            const s = secTable + i * 40;
            const va = b.readUInt32LE(s + 12), size = b.readUInt32LE(s + 8), raw = b.readUInt32LE(s + 20);
            if (cliRva >= va && cliRva < va + size) {
                const flags = b.readUInt32LE(raw + (cliRva - va) + 16);
                const ilOnly = (flags & 0x1) !== 0, req32 = (flags & 0x2) !== 0, pref32 = (flags & 0x20000) !== 0;
                return req32 || pref32 || !ilOnly;
            }
        }
    } catch { /* cabecera inesperada */ }
    return undefined;
}

/** True si X.cs es un formulario (tiene X.Designer.cs al lado). */
export function isFormFile(file: string): boolean {
    if (!/\.cs$/i.test(file) || /\.Designer\.cs$/i.test(file)) { return false; }
    const designer = file.replace(/\.cs$/i, '.Designer.cs');
    if (!fs.existsSync(designer)) { return false; }
    try {
        return /\bInitializeComponent\s*\(/.test(fs.readFileSync(designer, 'utf8'));
    } catch { return false; }
}

export function designerFileFor(file: string): string {
    return /\.Designer\.cs$/i.test(file) ? file : file.replace(/\.cs$/i, '.Designer.cs');
}

export function codeFileFor(file: string): string {
    return file.replace(/\.Designer\.cs$/i, '.cs');
}
