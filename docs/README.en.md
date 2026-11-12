# Mini Studio for .NET

[Español](../README.md) | **English** | [Português](README.pt.md)

A VS Code extension with a **Visual Studio–style** environment to create, build, run and debug
**console apps** and **Windows Forms** apps in **C# and Visual Basic**.

> Independent project: not affiliated with or endorsed by Microsoft. Visual Studio, Visual Basic and Windows are trademarks of Microsoft.

> The extension's menus and messages are currently in Spanish; this page explains them in English.
> Inside VS Code, **Mini Studio: Documentation** (Command Palette or the **⋯** menu of the Solution Explorer) opens this guide in your VS Code display language.

## Features

| Visual Studio | Mini Studio (menu name in the extension) |
|---|---|
| Start window / File → New → Project | **Start page** (🏠 button in the Solution Explorer, or *Nuevo proyecto...*): Console, Windows Forms and Class Library templates, plus **ready-to-run samples** (Calculator, To-do list, Guess the number, Multiplication table). Name, location, .NET version and language, as in VS. Opens automatically in an empty window |
| Solution Explorer | Its own view in the side bar (**Explorador de soluciones**): solution → projects → Dependencies (NuGet and references) → folders and files; `Form1.Designer.cs` and `.resx` nested under `Form1.cs` |
| Startup project | Right click → *Establecer como proyecto de inicio* (shown in the tree and in the status bar) |
| Debug / Release | Click the status bar to switch |
| Build (Ctrl+Shift+B) | `dotnet build`, with output in *Mini Studio: Compilación* and errors in the **Problems** panel (Error List) |
| Start Without Debugging (Ctrl+F5) | Console apps run in the integrated terminal (or in a separate window that waits for a key, like VS); WinForms apps start as a process |
| Start Debugging (F5) | `coreclr` debugger from Microsoft's C# extension (offered for install if missing) |
| Stop (Shift+F5) | Closes the running app |
| Add → Class / Interface / Module (VB) / Windows Form / Folder | Right click a project or folder in the Solution Explorer, or in the normal VS Code Explorer → *Mini Studio: Agregar* (*Agregar Windows Form...*, *Agregar clase...*). The namespace follows the folder |
| Manage NuGet packages | *Agregar paquete NuGet...* (`Id` or `Id@version`); remove from Dependencies |
| Windows Forms Designer | Opening a form (from any explorer) shows the **designer**, as in VS. View code with **F7**; back to design with **Shift+F7** |

### Visual Basic

Everything works the same in VB.NET: templates and samples (choose *Visual Basic* on the start page), Add class,
interface, **module** and form, and the designer with `Form1.vb` + `Form1.Designer.vb`, written with the same syntax
as Visual Studio (`Me.`, `New`, `True`, `Friend WithEvents`). Events are handled the VB way: double-clicking a
control creates `Private Sub Button1_Click(...) Handles Button1.Click`; removing the event or renaming the control updates
the `Handles` clause.

### Simulator

The designer's **▶ Simular** button (or right click a form → *Simular formulario*) makes the form
interactive (type in a TextBox, tick a CheckBox, pick from a ComboBox, press buttons...) and tells you which
event handler would run (`btn7.Click → Digito_Click()`). Your code only runs in the real app. It lets you try the
UI on any operating system. **Esc** to leave.

### Linux and macOS

- Console apps: build, run and debug just like on Windows.
- Windows Forms: they build without error NETSDK1100 and, if **Wine** is installed (`sudo apt install wine64`),
  Ctrl+F5 runs them with Wine (they are built self-contained for win-x64, so Wine doesn't need .NET).
  Without Wine, the simulator is offered. They can't be debugged with F5 outside Windows.
- **Windows Forms on Linux needs Microsoft's .NET.** The one installed by `apt` on Ubuntu (`/usr/lib/dotnet`) is
  built by Canonical and doesn't include `Microsoft.NET.Sdk.WindowsDesktop`. Install Microsoft's in your home folder
  (it doesn't touch the system one) and Mini Studio will use it automatically:
  `wget https://dot.net/v1/dotnet-install.sh -O ~/dotnet-install.sh && bash ~/dotnet-install.sh --channel 8.0`
- The first time Wine starts it may print `err:ole:start_rpcss` / `err:rpc` lines: they are harmless.
- Classic .NET Framework projects: with **Mono** (`msbuild` + `mono`) if installed.
- If `dotnet` fails with *"[/usr/lib/dotnet/host/fxr] does not exist ... libhostfxr.so"*, the .NET installation is
  incomplete or mixed (Ubuntu + Microsoft packages). Mini Studio looks for another working `dotnet` (`~/.dotnet`,
  `/usr/share/dotnet`...) and, if there is none, tells you how to fix it:
  `sudo apt remove 'dotnet*' 'aspnetcore*' 'netstandard*' && sudo apt install dotnet-sdk-8.0`.
  You can also set the path in the `miniStudio.dotnetPath` setting.

### Form designer

- Toolbox: Button, Label, LinkLabel, TextBox, RichTextBox, MaskedTextBox, CheckBox, RadioButton, ComboBox,
  ListBox, CheckedListBox, PictureBox, ProgressBar, NumericUpDown, DateTimePicker, TrackBar, Panel, GroupBox,
  FlowLayoutPanel, DataGridView and components (Timer, ToolTip, OpenFileDialog, SaveFileDialog, ErrorProvider).
- Drag to place, move and resize (8 handles) on a grid; dropping inside a Panel/GroupBox nests the control.
- Properties window by category (text, colors, font, Dock, list Items, etc.) plus free-form properties.
- **Double-click a control** to create the default event handler (`button1_Click`) in `Form1.cs` and open it,
  just like Visual Studio. ⚡ Events tab for the rest.
- Undo/redo (Ctrl+Z / Ctrl+Y), copy/cut/paste, Del, arrow keys to move (Shift+arrows to resize).
- Saves automatically to `Form1.Designer.cs` in the same format as VS. Anything the designer doesn't understand
  (for example `FlatAppearance.BorderSize` or `Items.AddRange`) is kept as is, so you can open
  forms created in Visual Studio.

## Requirements

- [.NET SDK](https://dotnet.microsoft.com/download) 6 or later (`dotnet` on the PATH).
- Windows (or Linux with Wine) to run Windows Forms apps.
- To debug with F5: the **C#** extension (`ms-dotnettools.csharp`).
- For **classic .NET Framework** projects (Visual Studio `.csproj` files with `TargetFrameworkVersion`, e.g. 4.7.2):
  Visual Studio or *Build Tools for Visual Studio*. Mini Studio uses its `MSBuild.exe` automatically, because
  `dotnet build` can't generate the `.resx` files of those projects (error MSB4216). They can also be debugged (`clr` type) and
  new classes/forms are registered in the `.csproj`.

## Installation

In VS Code: open **Extensions** (Ctrl+Shift+X), search for **Mini Studio para .NET** and install. Or in the Quick Open (Ctrl+P):

```
ext install ManuelPinedaRicourt.mini-studio
```

You can also download the `.vsix` from [Releases](https://github.com/pinedaricourt/vscode-mini-studio/releases) and install it with
`code --install-extension mini-studio-<version>.vsix`.

## Settings

| Setting | Default | Description |
|---|---|---|
| `miniStudio.dotnetPath` | (empty) | Path to the `dotnet` to use; empty = find one that works |
| `miniStudio.console.runIn` | `integratedTerminal` | `externalWindow` opens a separate console that waits for a key when done |
| `miniStudio.build.verbosity` | `minimal` | `dotnet build` verbosity |
| `miniStudio.build.msbuildPath` | (empty) | MSBuild.exe for .NET Framework projects; empty = found with vswhere |
| `miniStudio.build.saveAllBeforeBuild` | `true` | Save all before building |
| `miniStudio.designer.openByDefault` | `true` | Open forms in the designer instead of as code |
| `miniStudio.startPage.showOnStartup` | `true` | Show the start page in empty windows |
| `miniStudio.designer.gridSize` | `4` | Designer grid (px) |

## Limitations

- The designer regenerates `InitializeComponent`; it doesn't edit `.resx` resources (images) or TabControl/MenuStrip visually
  (they are kept if they already exist).

## License

MIT
