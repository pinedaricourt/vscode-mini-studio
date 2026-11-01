import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DForm, parseDesigner, generateDesigner, matchBrace, eventArgsType } from './model';
import { codeFileFor, designerFileFor } from '../projects';
import { allowCode } from './openByDefault';

/** Un panel de diseñador por formulario. */
export class DesignerPanel {
    static readonly viewType = 'miniStudio.designer';
    private static readonly panels = new Map<string, DesignerPanel>();

    private lastWritten = '';
    private pending?: DForm;
    private timer?: NodeJS.Timeout;
    private readonly disposables: vscode.Disposable[] = [];

    static open(context: vscode.ExtensionContext, file: string) {
        const designer = designerFileFor(file);
        if (!fs.existsSync(designer)) {
            vscode.window.showErrorMessage(`No existe ${path.basename(designer)}; este archivo no es un formulario.`);
            return;
        }
        const key = designer.toLowerCase();
        const existing = DesignerPanel.panels.get(key);
        if (existing) { existing.panel.reveal(); return; }
        DesignerPanel.panels.set(key, new DesignerPanel(context, designer));
    }

    static activeCodeFile(): string | undefined {
        for (const p of DesignerPanel.panels.values()) {
            if (p.panel.active) { return codeFileFor(p.designerFile); }
        }
        return undefined;
    }

    private readonly panel: vscode.WebviewPanel;

    private constructor(private readonly context: vscode.ExtensionContext, private readonly designerFile: string) {
        const media = vscode.Uri.joinPath(context.extensionUri, 'media');
        this.panel = vscode.window.createWebviewPanel(DesignerPanel.viewType,
            `${path.basename(codeFileFor(designerFile))} [Diseño]`, vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
        this.panel.iconPath = new vscode.ThemeIcon('window');
        this.panel.webview.html = this.html(media);

        this.panel.webview.onDidReceiveMessage(m => this.onMessage(m), undefined, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(designerFile), path.basename(designerFile)));
        watcher.onDidChange(() => {
            const text = this.read();
            if (text !== undefined && text !== this.lastWritten && !this.pending) { this.load(text); }
        }, undefined, this.disposables);
        this.disposables.push(watcher);
    }

    private read(): string | undefined {
        try { return fs.readFileSync(this.designerFile, 'utf8'); } catch { return undefined; }
    }

    private load(text = this.read()) {
        if (text === undefined) { return; }
        const form = parseDesigner(text);
        this.panel.webview.postMessage({
            type: 'load', form,
            gridSize: vscode.workspace.getConfiguration('miniStudio').get<number>('designer.gridSize', 4),
        });
    }

    private async onMessage(m: any) {
        switch (m.type) {
            case 'ready': this.load(); break;
            case 'change': this.schedule(m.form); break;
            case 'createHandler': await this.flush(); await this.createHandler(m.handler, m.event); break;
            case 'viewCode': await this.flush(); await openCode(codeFileFor(this.designerFile)); break;
            case 'reload': this.load(); break;
            case 'error': vscode.window.showErrorMessage(m.message); break;
        }
    }

    private schedule(form: DForm) {
        this.pending = form;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), 250);
    }

    private async flush() {
        clearTimeout(this.timer);
        const form = this.pending;
        this.pending = undefined;
        if (!form) { return; }
        const text = generateDesigner(form);
        if (text === this.read()) { return; }
        this.lastWritten = text;
        // Si el Designer.cs está abierto en un editor, se edita el documento para no pisar el buffer
        const open = vscode.workspace.textDocuments.find(d => d.uri.fsPath.toLowerCase() === this.designerFile.toLowerCase());
        if (open) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(open.uri, new vscode.Range(0, 0, open.lineCount, 0), text);
            await vscode.workspace.applyEdit(edit);
            await open.save();
        } else {
            fs.writeFileSync(this.designerFile, text, 'utf8');
        }
    }

    /** Crea (si no existe) el método del evento en X.cs y lo abre, como al hacer doble clic en VS. */
    private async createHandler(handler: string, event: string) {
        const codeFile = codeFileFor(this.designerFile);
        const doc = await vscode.workspace.openTextDocument(codeFile);
        let text = doc.getText();
        const existing = new RegExp(`void\\s+${handler}\\s*\\(`).exec(text);
        let offset: number;
        if (existing) {
            offset = text.indexOf('{', existing.index) + 1;
        } else {
            const cls = parseDesigner(this.read() ?? '').className;
            const clsMatch = new RegExp(`\\bclass\\s+${cls}\\b`).exec(text);
            if (!clsMatch) { vscode.window.showErrorMessage(`No se encontró la clase ${cls} en ${path.basename(codeFile)}.`); return; }
            const close = matchBrace(text, text.indexOf('{', clsMatch.index));
            const lineStart = text.lastIndexOf('\n', close) + 1;
            const classIndent = text.slice(lineStart, close).match(/^\s*/)?.[0] ?? '';
            const ind = classIndent + '    ';
            const eol = text.includes('\r\n') ? '\r\n' : '\n';
            const args = shortenArgs(eventArgsType(event), text);
            const before = text.slice(0, lineStart).replace(/\s*$/, '');
            const method = `${eol}${eol}${ind}private void ${handler}(object sender, ${args} e)${eol}${ind}{${eol}${ind}    ${eol}${ind}}${eol}`;
            text = before + method + text.slice(lineStart);
            offset = before.length + method.indexOf('{') + 1;
            const edit = new vscode.WorkspaceEdit();
            edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
            await vscode.workspace.applyEdit(edit);
            await doc.save();
        }
        allowCode(codeFile);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
        const pos = doc.positionAt(offset).translate(1, 0);
        const line = doc.lineAt(Math.min(pos.line, doc.lineCount - 1));
        editor.selection = new vscode.Selection(line.range.end, line.range.end);
        editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
    }

    private html(media: vscode.Uri): string {
        const w = this.panel.webview;
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const css = w.asWebviewUri(vscode.Uri.joinPath(media, 'designer.css'));
        const js = w.asWebviewUri(vscode.Uri.joinPath(media, 'designer.js'));
        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${w.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>Diseñador</title>
</head>
<body>
<div id="app">
  <aside id="toolbox"><div class="pane-title">Cuadro de herramientas</div><input id="toolFilter" placeholder="Buscar..."><div id="tools"></div></aside>
  <main id="surfaceWrap">
    <div id="toolbar">
      <button id="btnUndo" title="Deshacer (Ctrl+Z)">↶</button><button id="btnRedo" title="Rehacer (Ctrl+Y)">↷</button>
      <span class="sep"></span>
      <button id="btnFront" title="Traer al frente">Al frente</button><button id="btnBack" title="Enviar al fondo">Al fondo</button>
      <span class="sep"></span>
      <button id="btnCode" title="Ver código (F7)">Ver código</button>
      <span id="status"></span>
    </div>
    <div id="surfaceScroll"><div id="formWin"><div id="formTitle"><span id="formTitleText"></span><span class="wbtns">─ ☐ ✕</span></div><div id="surface"></div><div id="formGrip" title="Cambiar el tamaño del formulario"></div></div><div id="tray"></div></div>
  </main>
  <aside id="props"><div class="pane-title">Propiedades</div><select id="selCombo"></select><div id="tabs"><button data-tab="props" class="on">Propiedades</button><button data-tab="events">⚡ Eventos</button></div><div id="grid"></div></aside>
</div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
    }

    private dispose() {
        this.flush();
        DesignerPanel.panels.delete(this.designerFile.toLowerCase());
        this.disposables.forEach(d => d.dispose());
    }
}

function shortenArgs(full: string, codeText: string): string {
    // Con usings implícitos de WinForms o using explícitos se puede escribir el nombre corto
    const ns = full.slice(0, full.lastIndexOf('.'));
    const short = full.slice(full.lastIndexOf('.') + 1);
    if (new RegExp(`using\\s+${ns.replace(/\./g, '\\.')}\\s*;`).test(codeText)) { return short; }
    if (/:\s*Form\b/.test(codeText) && (ns === 'System' || ns === 'System.Windows.Forms')) { return short; }
    return full;
}

async function openCode(file: string) {
    allowCode(file);
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
}
