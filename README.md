# Mini Studio para .NET

Extensión de VS Code que lo convierte en un **mini Visual Studio Community** para crear, compilar, ejecutar y depurar
**aplicaciones de consola** y **Windows Forms** en C# (y proyectos VB.NET para compilar/ejecutar).

## Funciones

| Visual Studio | Mini Studio |
|---|---|
| Archivo → Nuevo → Proyecto | **Nuevo proyecto...**: Consola (con `Main` clásico o instrucciones de nivel superior), Windows Forms, Biblioteca de clases. Crea la solución `.sln` como VS |
| Explorador de soluciones | Vista propia en la barra lateral: solución → proyectos → Dependencias (NuGet y referencias) → carpetas y archivos; `Form1.Designer.cs` y `.resx` anidados bajo `Form1.cs` |
| Proyecto de inicio | Clic derecho → *Establecer como proyecto de inicio* (se marca en el árbol y en la barra de estado) |
| Debug / Release | Clic en la barra de estado para cambiar |
| Compilar (Ctrl+Shift+B) | `dotnet build` con salida en *Mini Studio: Compilación* y los errores en el panel **Problemas** (Lista de errores) |
| Iniciar sin depurar (Ctrl+F5) | Consola en la terminal integrada (o en una ventana aparte que espera una tecla, como VS); WinForms se lanza como proceso |
| Iniciar depuración (F5) | Depurador `coreclr` de la extensión C# de Microsoft (te ofrece instalarla si falta) |
| Detener (Shift+F5) | Cierra la app en ejecución |
| Agregar → Clase / Interfaz / Windows Form / Carpeta | Clic derecho en un proyecto o carpeta; el espacio de nombres se calcula según la carpeta |
| Administrar paquetes NuGet | *Agregar paquete NuGet...* (`Id` o `Id@versión`) y quitar desde Dependencias |
| Diseñador de Windows Forms | Clic en un formulario o **Shift+F7**. Ver código con **F7** |

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

Descarga el `.vsix` de [Releases](https://github.com/pinedaricourt/vscode-mini-studio/releases) e instálalo:

```bash
code --install-extension mini-studio-0.2.1.vsix
```

O desde el código fuente:

```bash
npm install
npm run package
```

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
| `miniStudio.designer.gridSize` | `4` | Cuadrícula del diseñador (px) |

## Limitaciones

- El diseñador regenera `InitializeComponent`; no edita recursos `.resx` (imágenes) ni TabControl/MenuStrip visualmente
  (se conservan si ya existen).
- Formularios en VB.NET se compilan y ejecutan, pero no se abren en el diseñador.

## Licencia

MIT
