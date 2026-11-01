# Cambios

## 0.2.1

- F5 en proyectos .NET Framework: se compila sin "Preferir 32 bits" (el depurador de VS Code solo depura procesos de 64 bits; antes fallaba con "Unable to start program"). Si el proyecto es x86 se ofrece iniciar sin depurar.

## 0.2.0

- Proyectos clásicos de .NET Framework: se compilan con el MSBuild de Visual Studio/Build Tools (corrige MSB4216/MSB4028 en GenerateResource), se depuran con el depurador `clr` y los archivos nuevos se agregan al `.csproj`.
- Nuevo ajuste `miniStudio.build.msbuildPath`.

## 0.1.0

- Primera versión: explorador de soluciones, compilar/ejecutar/depurar, plantillas y diseñador de Windows Forms.
