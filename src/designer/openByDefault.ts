import * as vscode from 'vscode';
import { isFormFile } from '../projects';

/*
 * Como en Visual Studio: al abrir un formulario (Form1.cs) se muestra el diseñador y el código
 * solo cuando se pide (F7, "Ver código", doble clic en un control...).
 *
 * VS Code no permite elegir editor según el contenido del archivo, así que se intercepta la
 * apertura: si un Form1.cs se abre "en frío" (cursor al inicio, nadie pidió el código) se cierra
 * esa pestaña y se abre el diseñador. Si se llega desde un error de Problemas o "Ir a definición"
 * el cursor está en otra posición y se respeta el código.
 */

const allowed = new Set<string>();
const key = (p: string) => p.toLowerCase();

/** Marca que el código de este archivo se abre a propósito (no redirigir al diseñador). */
export function allowCode(file: string) {
    allowed.add(key(file));
}

export function registerOpenByDefault(context: vscode.ExtensionContext, openDesigner: (file: string) => void) {
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(d => allowed.delete(key(d.uri.fsPath))),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || editor.document.uri.scheme !== 'file') { return; }
            if (!vscode.workspace.getConfiguration('miniStudio').get<boolean>('designer.openByDefault', true)) { return; }
            const file = editor.document.uri.fsPath;
            if (allowed.has(key(file)) || !isFormFile(file)) { return; }
            // dejar que VS Code aplique la posición (Problemas, Ir a definición...) antes de decidir
            setTimeout(() => {
                if (vscode.window.activeTextEditor !== editor) { return; }
                const sel = editor.selection;
                if (!sel.isEmpty || sel.active.line !== 0 || sel.active.character !== 0) { allowed.add(key(file)); return; }
                redirect(editor, openDesigner);
            }, 60);
        }),
    );
}

async function redirect(editor: vscode.TextEditor, openDesigner: (file: string) => void) {
    const uri = editor.document.uri;
    const tab = vscode.window.tabGroups.all.flatMap(g => g.tabs)
        .find(t => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri.toString() && t.group.viewColumn === editor.viewColumn);
    // si el archivo tiene cambios sin guardar, no se cierra: se deja como código
    if (editor.document.isDirty) { allowed.add(key(uri.fsPath)); return; }
    if (tab) { await vscode.window.tabGroups.close(tab, true); }
    openDesigner(uri.fsPath);
}
