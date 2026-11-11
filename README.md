# Mini Studio para .NET

Extensión de VS Code con un entorno **estilo Visual Studio** para crear, compilar, ejecutar y depurar
**aplicaciones de consola** y **Windows Forms** en **C# y Visual Basic**.

> Proyecto independiente: no está afiliado ni respaldado por Microsoft. Visual Studio, Visual Basic y Windows son marcas de Microsoft.

## Funciones

| Visual Studio | Mini Studio |
|---|---|
| Ventana de inicio / Archivo → Nuevo → Proyecto | **Página de inicio** (botón 🏠 del explorador o *Nuevo proyecto...*): plantillas de Consola, Windows Forms y Biblioteca de clases, y **ejemplos listos para correr** (Calculadora, Lista de tareas, Adivina el número, Tabla de multiplicar). Nombre, ubicación, versión de .NET y lenguaje, como en VS. Se abre sola en una ventana vacía |
| Explorador de soluciones | Vista propia en la barra lateral: solución → proyectos → Dependencias (NuGet y referencias) → carpetas y archivos; `Form1.Designer.cs` y `.resx` anidados bajo `Form1.cs` |
| Proyecto de inicio | Clic derecho → *Establecer como proyecto de inicio* (se marca en el árbol y en la barra de estado) |
| Debug / Release | Clic en la barra de estado para cambiar |
| Compilar (Ctrl+Shift+B) | `dotnet build` con salida en *Mini Studio: Compilación* y los errores en el panel **Problemas** (Lista de errores) |
| Iniciar sin depurar (Ctrl+F5) | Consola en la terminal integrada (o en una ventana aparte que espera una tecla, como VS); WinForms se lanza como proceso |
| Iniciar depuración (F5) | Depurador `coreclr` de la extensión C# de Microsoft (te ofrece instalarla si falta) |
| Detener (Shift+F5) | Cierra la app en ejecución |
| Agregar → Clase / Interfaz / Módulo (VB) / Windows Form / Carpeta | Clic derecho en un proyecto o carpeta; el espacio de nombres se calcula según la carpeta |
| Administrar paquetes NuGet | *Agregar paquete NuGet...* (`Id` o `Id@versión`) y quitar desde Dependencias |
| Diseñador de Windows Forms | Al abrir un formulario (desde cualquier explorador) sale el **diseñador**, como en VS. Ver código con **F7**; volver al diseño con **Shift+F7** |

### Visual Basic

Todo funciona igual en VB.NET: plantillas y ejemplos (elige *Visual Basic* en la página de inicio), Agregar clase,
interfaz, **módulo** y formulario, y el diseñador con `Form1.vb` + `Form1.Designer.vb`, escrito con la misma sintaxis
que Visual Studio (`Me.`, `New`, `True`, `Friend WithEvents`). Los eventos se manejan como en VB: doble clic en un
control crea `Private Sub Button1_Click(...) Handles Button1.Click`; quitar el evento o renombrar el control actualiza
el `Handles`.

### Simulador

Botón **▶ Simular** del diseñador (o clic derecho en un formulario → *Simular formulario*): el formulario se vuelve
interactivo (escribir en TextBox, marcar CheckBox, elegir en ComboBox, pulsar botones...) y te dice qué controlador
de C# se ejecutaría (`btn7.Click → Digito_Click()`). El código C# solo corre en la app real. Sirve para probar la
interfaz en cualquier sistema operativo. **Esc** para salir.

### Linux y macOS

- Apps de consola: compilar, ejecutar y depurar igual que en Windows.
- Windows Forms: se compilan sin el error NETSDK1100 y, si está instalado **Wine** (`sudo apt install wine64`),
  Ctrl+F5 las ejecuta con Wine (se compilan autocontenidas para win-x64, así que Wine no necesita tener .NET).
  Sin Wine, se ofrece el simulador. No se pueden depurar con F5 fuera de Windows.
- Proyectos clásicos de .NET Framework: con **Mono** (`msbuild` + `mono`) si está instalado.

### Diseñador de formularios

- Cuadro de herramientas: Button, Label, LinkLabel, TextBox, RichTextBox, MaskedTextBox, CheckBox, RadioButton, ComboBox,
  ListBox, CheckedListBox, PictureBox, ProgressBar, NumericUpDown, DateTimePicker, TrackBar, Panel, GroupBox,
  FlowLayoutPanel, DataGridView y componentes (Timer, ToolTip, OpenFileDialog, SaveFileDialog, ErrorProvider).
- Arrastrar para colocar, mover y redimensionar (8 tiradores) con cuadrícula; soltar dentro de Panel/GroupBox anida el control.
- Ventana de propiedades por categorías (texto, colores, fuente, Dock, Items de listas, etc.) y propiedades libres en C#.
- **Doble clic en un control** crea el controlador del evento predeterminado (`button1_Click`) en `Form1.cs` y lo abre,
  igual que en Visual Studio. Pestaña ⚡ Eventos para el resto.
- Deshacer/rehacer (Ctrl+Z / Ctrl+Y), copiar/cortar/pegar, Supr, flechas para mover (Shift+flechas para redimensionar).
- Guarda automáticamente en `Form1.Designer.cs` con el mismo formato que VS. Lo que el diseñador no entiende
  (por ejemplo `FlatAppearance.BorderSize` o `Items.AddRange`) se conserva tal cual, así que puedes abrir
  formularios creados en Visual Studio.

## Requisitos

- [SDK de .NET](https://dotnet.microsoft.com/download) 6 o superior (`dotnet` en el PATH).
- Windows para ejecutar apps de Windows Forms.
- Para depurar con F5: extensión **C#** (`ms-dotnettools.csharp`).
- Para proyectos **clásicos de .NET Framework** (los `.csproj` de Visual Studio con `TargetFrameworkVersion`, p. ej. 4.7.2):
  Visual Studio o *Build Tools para Visual Studio*. Mini Studio usa su `MSBuild.exe` automáticamente, porque
  `dotnet build` no puede generar los `.resx` de esos proyectos (error MSB4216). También se depuran (tipo `clr`) y las
  clases/formularios nuevos se registran en el `.csproj`.

## Instalación

Desde VS Code: abre **Extensiones** (Ctrl+Shift+X), busca **Mini Studio para .NET** e instala. O en la paleta (Ctrl+P):

```
ext install ManuelPinedaRicourt.mini-studio
```

También puedes descargar el `.vsix` de [Releases](https://github.com/pinedaricourt/vscode-mini-studio/releases) e instalarlo con
`code --install-extension mini-studio-<versión>.vsix`.

## Desarrollo

```bash
npm install
npm run watch     # compila en modo observación
npm test          # pruebas del lector/escritor de Designer.cs
```

Pulsa F5 en VS Code con esta carpeta abierta para lanzar una ventana de prueba con la extensión
(con Mini Studio instalado, F5 lo toma la extensión solo si la carpeta contiene proyectos .NET).

## Configuración

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `miniStudio.console.runIn` | `integratedTerminal` | `externalWindow` abre una consola aparte que espera una tecla al terminar |
| `miniStudio.build.verbosity` | `minimal` | Detalle de `dotnet build` |
| `miniStudio.build.msbuildPath` | (vacío) | MSBuild.exe para proyectos .NET Framework; vacío = se busca con vswhere |
| `miniStudio.build.saveAllBeforeBuild` | `true` | Guardar todo antes de compilar |
| `miniStudio.designer.openByDefault` | `true` | Abrir los formularios en el diseñador en vez de como código |
| `miniStudio.startPage.showOnStartup` | `true` | Mostrar la página de inicio en ventanas vacías |
| `miniStudio.designer.gridSize` | `4` | Cuadrícula del diseñador (px) |

## Limitaciones

- El diseñador regenera `InitializeComponent`; no edita recursos `.resx` (imágenes) ni TabControl/MenuStrip visualmente
  (se conservan si ya existen).

## Licencia

MIT
