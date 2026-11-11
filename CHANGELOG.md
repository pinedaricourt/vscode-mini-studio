# Cambios

## 0.5.2

- Publisher del Marketplace: ManuelPinedaRicourt.

## 0.5.1

- Primera publicación en el Marketplace de Visual Studio: descripción, categorías y página de la extensión.

## 0.5.0

- Visual Basic: diseñador de formularios para `Form1.vb` / `Form1.Designer.vb` (sintaxis de Visual Studio), eventos con `Handles` (crear, quitar y renombrar), Agregar clase/interfaz/módulo/formulario en VB, ejemplos en VB y elección de lenguaje para los ejemplos en la página de inicio.

## 0.4.0

- Página de inicio estilo Visual Studio para crear programas: plantillas (consola, Windows Forms, biblioteca) y ejemplos listos para correr (Calculadora, Lista de tareas, Adivina el número, Tabla de multiplicar), con nombre, ubicación, versión de .NET y lenguaje. Recientes y abrir solución/carpeta.
- Simulador: modo **▶ Simular** en el diseñador para probar la interfaz sin compilar.
- Linux/macOS: Windows Forms se compila (EnableWindowsTargeting) y se ejecuta con Wine; .NET Framework con Mono; si no hay, se ofrece el simulador.

## 0.3.0

- Los formularios se abren en el diseñador por defecto, también desde el explorador normal de VS Code. El código se abre con F7 / Ver código, al hacer doble clic en un control o desde Problemas / Ir a definición. Ajuste `miniStudio.designer.openByDefault`.

## 0.2.1

- F5 en proyectos .NET Framework: se compila sin "Preferir 32 bits" (el depurador de VS Code solo depura procesos de 64 bits; antes fallaba con "Unable to start program"). Si el proyecto es x86 se ofrece iniciar sin depurar.

## 0.2.0

- Proyectos clásicos de .NET Framework: se compilan con el MSBuild de Visual Studio/Build Tools (corrige MSB4216/MSB4028 en GenerateResource), se depuran con el depurador `clr` y los archivos nuevos se agregan al `.csproj`.
- Nuevo ajuste `miniStudio.build.msbuildPath`.

## 0.1.0

- Primera versión: explorador de soluciones, compilar/ejecutar/depurar, plantillas y diseñador de Windows Forms.
