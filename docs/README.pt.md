# Mini Studio para .NET

[Español](../README.md) | [English](README.en.md) | **Português**

Extensão do VS Code com um ambiente **no estilo do Visual Studio** para criar, compilar, executar e depurar
**aplicativos de console** e **Windows Forms** em **C# e Visual Basic**.

> Projeto independente: não é afiliado nem endossado pela Microsoft. Visual Studio, Visual Basic e Windows são marcas da Microsoft.

> Os menus e mensagens da extensão estão, por enquanto, em espanhol; esta página os explica em português.
> Dentro do VS Code, **Mini Studio: Documentação** (Paleta de Comandos ou menu **⋯** do Gerenciador de Soluções) abre este guia no idioma de exibição do seu VS Code.

## Funcionalidades

| Visual Studio | Mini Studio (nome do menu na extensão) |
|---|---|
| Janela inicial / Arquivo → Novo → Projeto | **Página inicial** (botão 🏠 do Gerenciador de Soluções ou *Nuevo proyecto...*): modelos de Console, Windows Forms e Biblioteca de classes, e **exemplos prontos para executar** (Calculadora, Lista de tarefas, Adivinhe o número, Tabuada). Nome, local, versão do .NET e linguagem, como no VS. Abre sozinha em uma janela vazia |
| Gerenciador de Soluções | Visão própria na barra lateral (**Explorador de soluciones**): solução → projetos → Dependências (NuGet e referências) → pastas e arquivos; `Form1.Designer.cs` e `.resx` aninhados sob `Form1.cs` |
| Projeto de inicialização | Clique direito → *Establecer como proyecto de inicio* (marcado na árvore e na barra de status) |
| Debug / Release | Clique na barra de status para alternar |
| Compilar (Ctrl+Shift+B) | `dotnet build` com saída em *Mini Studio: Compilación* e erros no painel **Problemas** (Lista de erros) |
| Iniciar sem depurar (Ctrl+F5) | Console no terminal integrado (ou em uma janela separada que espera uma tecla, como no VS); WinForms é iniciado como processo |
| Iniciar depuração (F5) | Depurador `coreclr` da extensão C# da Microsoft (oferece instalá-la se faltar) |
| Parar (Shift+F5) | Fecha o aplicativo em execução |
| Adicionar → Classe / Interface / Módulo (VB) / Windows Form / Pasta | Clique direito em um projeto ou pasta do Gerenciador de Soluções, ou no explorador normal do VS Code → *Mini Studio: Agregar* (*Agregar Windows Form...*, *Agregar clase...*). O namespace segue a pasta |
| Gerenciar pacotes NuGet | *Agregar paquete NuGet...* (`Id` ou `Id@versão`); remover em Dependências |
| Designer do Windows Forms | Ao abrir um formulário (de qualquer explorador) aparece o **designer**, como no VS. Ver código com **F7**; voltar ao design com **Shift+F7** |

### Visual Basic

Tudo funciona igual em VB.NET: modelos e exemplos (escolha *Visual Basic* na página inicial), Adicionar classe,
interface, **módulo** e formulário, e o designer com `Form1.vb` + `Form1.Designer.vb`, escrito com a mesma sintaxe
do Visual Studio (`Me.`, `New`, `True`, `Friend WithEvents`). Os eventos são tratados como em VB: clique duplo em um
controle cria `Private Sub Button1_Click(...) Handles Button1.Click`; remover o evento ou renomear o controle atualiza
o `Handles`.

### Simulador

Botão **▶ Simular** do designer (ou clique direito em um formulário → *Simular formulario*): o formulário fica
interativo (digitar em TextBox, marcar CheckBox, escolher em ComboBox, apertar botões...) e mostra qual
manipulador de evento seria executado (`btn7.Click → Digito_Click()`). O código só roda no aplicativo real. Serve para testar a
interface em qualquer sistema operacional. **Esc** para sair.

### Linux e macOS

- Aplicativos de console: compilar, executar e depurar igual ao Windows.
- Windows Forms: compilam sem o erro NETSDK1100 e, se o **Wine** estiver instalado (`sudo apt install wine64`),
  Ctrl+F5 os executa com o Wine (são compilados autocontidos para win-x64, então o Wine não precisa ter .NET).
  Sem Wine, é oferecido o simulador. Não podem ser depurados com F5 fora do Windows.
- **Windows Forms no Linux precisa do .NET da Microsoft.** O instalado pelo `apt` no Ubuntu (`/usr/lib/dotnet`) é
  compilado pela Canonical e não traz `Microsoft.NET.Sdk.WindowsDesktop`. Instale o da Microsoft na sua pasta pessoal
  (não mexe no do sistema) e o Mini Studio o usará automaticamente:
  `wget https://dot.net/v1/dotnet-install.sh -O ~/dotnet-install.sh && bash ~/dotnet-install.sh --channel 8.0`
- Na primeira vez, o Wine pode mostrar linhas `err:ole:start_rpcss` / `err:rpc`: são inofensivas.
- Projetos clássicos do .NET Framework: com **Mono** (`msbuild` + `mono`), se estiver instalado.
- Se o `dotnet` falhar com *"[/usr/lib/dotnet/host/fxr] does not exist ... libhostfxr.so"*, a instalação do .NET está
  incompleta ou misturada (pacotes do Ubuntu + Microsoft). O Mini Studio procura outro `dotnet` que funcione (`~/.dotnet`,
  `/usr/share/dotnet`...) e, se não houver, explica como corrigir:
  `sudo apt remove 'dotnet*' 'aspnetcore*' 'netstandard*' && sudo apt install dotnet-sdk-8.0`.
  Também é possível definir o caminho na configuração `miniStudio.dotnetPath`.

### Designer de formulários

- Caixa de ferramentas: Button, Label, LinkLabel, TextBox, RichTextBox, MaskedTextBox, CheckBox, RadioButton, ComboBox,
  ListBox, CheckedListBox, PictureBox, ProgressBar, NumericUpDown, DateTimePicker, TrackBar, Panel, GroupBox,
  FlowLayoutPanel, DataGridView e componentes (Timer, ToolTip, OpenFileDialog, SaveFileDialog, ErrorProvider).
- Arrastar para posicionar, mover e redimensionar (8 alças) com grade; soltar dentro de Panel/GroupBox aninha o controle.
- Janela de propriedades por categoria (texto, cores, fonte, Dock, Items de listas etc.) e propriedades livres.
- **Clique duplo em um controle** cria o manipulador do evento padrão (`button1_Click`) em `Form1.cs` e o abre,
  como no Visual Studio. Aba ⚡ Eventos para os demais.
- Desfazer/refazer (Ctrl+Z / Ctrl+Y), copiar/recortar/colar, Del, setas para mover (Shift+setas para redimensionar).
- Salva automaticamente em `Form1.Designer.cs` no mesmo formato do VS. O que o designer não entende
  (por exemplo `FlatAppearance.BorderSize` ou `Items.AddRange`) é mantido como está, então você pode abrir
  formulários criados no Visual Studio.

## Requisitos

- [SDK do .NET](https://dotnet.microsoft.com/download) 6 ou superior (`dotnet` no PATH).
- Windows (ou Linux com Wine) para executar aplicativos Windows Forms.
- Para depurar com F5: extensão **C#** (`ms-dotnettools.csharp`).
- Para projetos **clássicos do .NET Framework** (os `.csproj` do Visual Studio com `TargetFrameworkVersion`, ex.: 4.7.2):
  Visual Studio ou *Build Tools para Visual Studio*. O Mini Studio usa o `MSBuild.exe` dele automaticamente, porque
  `dotnet build` não consegue gerar os `.resx` desses projetos (erro MSB4216). Também podem ser depurados (tipo `clr`) e
  as novas classes/formulários são registrados no `.csproj`.

## Instalação

No VS Code: abra **Extensões** (Ctrl+Shift+X), pesquise **Mini Studio para .NET** e instale. Ou no Quick Open (Ctrl+P):

```
ext install ManuelPinedaRicourt.mini-studio
```

Também é possível baixar o `.vsix` em [Releases](https://github.com/pinedaricourt/vscode-mini-studio/releases) e instalá-lo com
`code --install-extension mini-studio-<versão>.vsix`.

## Configurações

| Configuração | Padrão | Descrição |
|---|---|---|
| `miniStudio.dotnetPath` | (vazio) | Caminho do `dotnet` a usar; vazio = procura um que funcione |
| `miniStudio.console.runIn` | `integratedTerminal` | `externalWindow` abre um console separado que espera uma tecla ao terminar |
| `miniStudio.build.verbosity` | `minimal` | Nível de detalhe do `dotnet build` |
| `miniStudio.build.msbuildPath` | (vazio) | MSBuild.exe para projetos .NET Framework; vazio = procurado com vswhere |
| `miniStudio.build.saveAllBeforeBuild` | `true` | Salvar tudo antes de compilar |
| `miniStudio.designer.openByDefault` | `true` | Abrir os formulários no designer em vez de como código |
| `miniStudio.startPage.showOnStartup` | `true` | Mostrar a página inicial em janelas vazias |
| `miniStudio.designer.gridSize` | `4` | Grade do designer (px) |

## Limitações

- O designer regenera `InitializeComponent`; não edita recursos `.resx` (imagens) nem TabControl/MenuStrip visualmente
  (são mantidos se já existirem).

## Licença

MIT
