import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Workspace, SolutionInfo, ProjectInfo, readCsproj, isFormFile, norm } from './projects';

export type NodeKind = 'solution' | 'project' | 'dependencies' | 'package' | 'projectRef' | 'folder' | 'file' | 'form';

export class Node extends vscode.TreeItem {
    constructor(
        public readonly kind: NodeKind,
        label: string,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly fsPath: string | undefined,
        public readonly project?: ProjectInfo,
        public readonly solution?: SolutionInfo,
        public readonly refName?: string,       // nombre de paquete o ruta de referencia
    ) {
        super(label, collapsible);
        this.contextValue = kind;
        if (fsPath) { this.resourceUri = vscode.Uri.file(fsPath); }
    }
}

const HIDDEN_DIRS = new Set(['bin', 'obj', '.vs', '.vscode', '.git', 'node_modules']);

export class SolutionExplorer implements vscode.TreeDataProvider<Node> {
    private readonly emitter = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData = this.emitter.event;
    private ws: Workspace = { solutions: [], looseProjects: [], allProjects: [] };
    private startup?: string;

    setWorkspace(ws: Workspace, startup: string | undefined) {
        this.ws = ws;
        this.startup = startup;
        this.emitter.fire(undefined);
    }

    getTreeItem(n: Node) { return n; }

    getChildren(n?: Node): Node[] {
        if (!n) {
            const roots: Node[] = this.ws.solutions.map(s => this.solutionNode(s));
            roots.push(...this.ws.looseProjects.map(p => this.projectNode(p)));
            return roots;
        }
        switch (n.kind) {
            case 'solution': return n.solution!.projects.map(p => this.projectNode(p));
            case 'project': return [this.dependenciesNode(n.project!), ...this.dirChildren(n.project!, n.project!.dir)].filter(Boolean) as Node[];
            case 'dependencies': return this.dependencyChildren(n.project!);
            case 'folder': return this.dirChildren(n.project!, n.fsPath!);
            case 'form':
            case 'file': return this.nestedChildren(n.project!, n.fsPath!);
            default: return [];
        }
    }

    private solutionNode(s: SolutionInfo): Node {
        const count = s.projects.length;
        const n = new Node('solution', `Solución '${s.name}'`, vscode.TreeItemCollapsibleState.Expanded, s.file, undefined, s);
        n.description = `(${count} ${count === 1 ? 'proyecto' : 'proyectos'})`;
        n.iconPath = new vscode.ThemeIcon('folder-library');
        n.command = { command: 'vscode.open', title: 'Abrir', arguments: [vscode.Uri.file(s.file)] };
        return n;
    }

    private projectNode(p: ProjectInfo): Node {
        const isStartup = this.startup !== undefined && norm(p.file) === norm(this.startup);
        const n = new Node('project', p.name, vscode.TreeItemCollapsibleState.Collapsed, p.dir, p);
        const data = readCsproj(p.file);
        const kind = data.outputType === 'WinExe' ? (data.useWindowsForms ? 'Windows Forms' : 'Windows') : data.outputType === 'Exe' ? 'Consola' : 'Biblioteca';
        n.description = `${kind}${data.targetFramework ? ' · ' + data.targetFramework : ''}${data.legacy ? ' (clásico)' : ''}${isStartup ? ' · inicio' : ''}`;
        n.tooltip = p.file;
        n.iconPath = new vscode.ThemeIcon(isStartup ? 'debug-start' : 'project', isStartup ? new vscode.ThemeColor('debugIcon.startForeground') : undefined);
        n.contextValue = isStartup ? 'project.startup' : 'project';
        n.resourceUri = undefined;
        n.label = isStartup ? { label: p.name, highlights: [[0, p.name.length]] } : p.name;
        return n;
    }

    private dependenciesNode(p: ProjectInfo): Node {
        const n = new Node('dependencies', 'Dependencias', vscode.TreeItemCollapsibleState.Collapsed, undefined, p);
        n.iconPath = new vscode.ThemeIcon('references');
        return n;
    }

    private dependencyChildren(p: ProjectInfo): Node[] {
        const data = readCsproj(p.file);
        const out: Node[] = [];
        const fwName = data.legacy ? `.NET Framework ${data.targetFramework.replace(/^net(\d)(\d)(\d?)$/, (_, a, b, c) => [a, b, c].filter(Boolean).join('.'))}`
            : data.useWindowsForms ? 'Microsoft.WindowsDesktop.App.WindowsForms' : 'Microsoft.NETCore.App';
        const fw = new Node('package', fwName, vscode.TreeItemCollapsibleState.None, undefined, p);
        fw.contextValue = 'framework';
        fw.description = 'Marco';
        fw.iconPath = new vscode.ThemeIcon('library');
        out.push(fw);
        for (const r of data.projectRefs) {
            const n = new Node('projectRef', path.basename(r).replace(/\.(cs|vb)proj$/i, ''), vscode.TreeItemCollapsibleState.None, undefined, p, undefined, r);
            n.description = 'Proyecto';
            n.iconPath = new vscode.ThemeIcon('project');
            out.push(n);
        }
        for (const pkg of data.packages) {
            const n = new Node('package', pkg.name, vscode.TreeItemCollapsibleState.None, undefined, p, undefined, pkg.name);
            n.description = pkg.version ? `NuGet ${pkg.version}` : 'NuGet';
            n.iconPath = new vscode.ThemeIcon('package');
            out.push(n);
        }
        return out;
    }

    private dirChildren(p: ProjectInfo, dir: string): Node[] {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
        const names = new Set(entries.map(e => e.name.toLowerCase()));
        const folders: Node[] = [];
        const files: Node[] = [];
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (HIDDEN_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) { continue; }
                // otra carpeta de proyecto anidada: no la mostramos dentro de este
                if (fs.readdirSync(full).some(f => /\.(cs|vb)proj$/i.test(f))) { continue; }
                const n = new Node('folder', e.name, vscode.TreeItemCollapsibleState.Collapsed, full, p);
                n.iconPath = vscode.ThemeIcon.Folder;
                folders.push(n);
            } else {
                if (/\.(cs|vb)proj(\.user)?$/i.test(e.name) || /\.sln$/i.test(e.name)) { continue; }
                // X.Designer.cs y X.resx se anidan bajo X.cs como en Visual Studio
                const m = /^(.*)\.(Designer\.cs|resx)$/i.exec(e.name);
                if (m && names.has((m[1] + '.cs').toLowerCase())) { continue; }
                files.push(this.fileNode(p, full));
            }
        }
        const byName = (a: Node, b: Node) => String(a.label).localeCompare(String(b.label));
        return [...folders.sort(byName), ...files.sort(byName)];
    }

    private fileNode(p: ProjectInfo, full: string): Node {
        const base = path.basename(full);
        const stem = full.replace(/\.cs$/i, '');
        const hasNested = /\.cs$/i.test(full) && (fs.existsSync(stem + '.Designer.cs') || fs.existsSync(stem + '.resx'));
        const form = isFormFile(full);
        const n = new Node(form ? 'form' : 'file', base, hasNested ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, full, p);
        if (form) {
            n.iconPath = new vscode.ThemeIcon('window');
            n.command = { command: 'miniStudio.openDesigner', title: 'Ver diseñador', arguments: [n] };
            n.tooltip = `${full}\nClic: diseñador · Clic derecho → Ver código`;
        } else {
            n.command = { command: 'vscode.open', title: 'Abrir', arguments: [vscode.Uri.file(full)] };
        }
        return n;
    }

    private nestedChildren(p: ProjectInfo, file: string): Node[] {
        const stem = file.replace(/\.cs$/i, '');
        return [stem + '.Designer.cs', stem + '.resx'].filter(f => fs.existsSync(f)).map(f => {
            const n = new Node('file', path.basename(f), vscode.TreeItemCollapsibleState.None, f, p);
            n.command = { command: 'vscode.open', title: 'Abrir', arguments: [vscode.Uri.file(f)] };
            return n;
        });
    }
}
