import * as fs from 'fs';
import * as path from 'path';
import { DForm, DControl, generateDesigner } from './designer/model';

/*
 * Programas de ejemplo listos para correr. Se crean sobre la plantilla de dotnet new
 * (console / winforms) y reemplazan Program.cs o Form1.cs + Form1.Designer.cs.
 * Los formularios se generan con el mismo escritor que usa el diseñador, así se pueden
 * abrir y modificar visualmente.
 */

export interface SampleInfo {
    id: string;
    title: string;
    detail: string;
    template: 'console' | 'winforms';
}

export const SAMPLES: SampleInfo[] = [
    { id: 'calculadora', title: 'Calculadora', detail: 'Windows Forms: botones, eventos compartidos y operaciones.', template: 'winforms' },
    { id: 'tareas', title: 'Lista de tareas', detail: 'Windows Forms: TextBox, ListBox, agregar y eliminar elementos.', template: 'winforms' },
    { id: 'adivina', title: 'Adivina el número', detail: 'Consola: Random, bucles y lectura del teclado.', template: 'console' },
    { id: 'tabla', title: 'Tabla de multiplicar', detail: 'Consola: for, formato de texto y validación de entrada.', template: 'console' },
];

export function applySample(id: string, projectDir: string, ns: string) {
    switch (id) {
        case 'calculadora': writeForm(projectDir, calculatorForm(ns), calculatorCode(ns)); break;
        case 'tareas': writeForm(projectDir, tasksForm(ns), tasksCode(ns)); break;
        case 'adivina': fs.writeFileSync(path.join(projectDir, 'Program.cs'), guessProgram(ns), 'utf8'); break;
        case 'tabla': fs.writeFileSync(path.join(projectDir, 'Program.cs'), tableProgram(ns), 'utf8'); break;
    }
}

function writeForm(dir: string, form: DForm, code: string) {
    fs.writeFileSync(path.join(dir, 'Form1.Designer.cs'), generateDesigner(form), 'utf8');
    fs.writeFileSync(path.join(dir, 'Form1.cs'), code, 'utf8');
}

// ---------------------------------------------------------------- helpers de formulario

const str = (s: string) => JSON.stringify(s);
const pt = (x: number, y: number) => `new System.Drawing.Point(${x}, ${y})`;
const sz = (w: number, h: number) => `new System.Drawing.Size(${w}, ${h})`;
const font = (size: number, bold = false) =>
    `new System.Drawing.Font("Segoe UI", ${size}F, ${bold ? 'System.Drawing.FontStyle.Bold' : 'System.Drawing.FontStyle.Regular'}, System.Drawing.GraphicsUnit.Point)`;

function ctl(type: string, name: string, props: Record<string, string>, events: Record<string, string> = {}, extra: string[] = []): DControl {
    return { name, type: `System.Windows.Forms.${type}`, ctorArgs: '', modifier: 'private', parent: null, props, events, extra };
}

function baseForm(ns: string, text: string, w: number, h: number): DForm {
    return {
        namespace: ns, fileScoped: false, preamble: '', className: 'Form1', extra: [], events: {}, controls: [],
        props: {
            AutoScaleDimensions: 'new System.Drawing.SizeF(8F, 20F)',
            AutoScaleMode: 'System.Windows.Forms.AutoScaleMode.Font',
            ClientSize: sz(w, h),
            Text: str(text),
            StartPosition: 'System.Windows.Forms.FormStartPosition.CenterScreen',
        },
    };
}

// ---------------------------------------------------------------- calculadora

function calculatorForm(ns: string): DForm {
    const f = baseForm(ns, 'Calculadora', 300, 380);
    f.props.FormBorderStyle = 'System.Windows.Forms.FormBorderStyle.FixedSingle';
    f.props.MaximizeBox = 'false';
    f.controls.push(ctl('TextBox', 'txtPantalla', {
        Font: font(20), Location: pt(12, 12), ReadOnly: 'true', Size: sz(276, 52), TabIndex: '0', Text: str('0'),
        TextAlign: 'System.Windows.Forms.HorizontalAlignment.Right',
    }));
    const rows = [['7', '8', '9', '/'], ['4', '5', '6', '*'], ['1', '2', '3', '-'], ['0', 'C', '=', '+']];
    const names: Record<string, string> = { '/': 'btnDividir', '*': 'btnMultiplicar', '-': 'btnRestar', '+': 'btnSumar', 'C': 'btnLimpiar', '=': 'btnIgual' };
    let tab = 1;
    rows.forEach((row, r) => row.forEach((k, c) => {
        const isDigit = /\d/.test(k);
        const handler = isDigit ? 'Digito_Click' : k === 'C' ? 'Limpiar_Click' : k === '=' ? 'Igual_Click' : 'Operador_Click';
        f.controls.push(ctl('Button', isDigit ? `btn${k}` : names[k], {
            Font: font(14, !isDigit), Location: pt(12 + c * 70, 76 + r * 72), Size: sz(64, 64),
            TabIndex: String(tab++), Text: str(k), UseVisualStyleBackColor: 'true',
        }, { Click: handler }));
    }));
    return f;
}

function calculatorCode(ns: string): string {
    return `using System;
using System.Windows.Forms;

namespace ${ns}
{
    public partial class Form1 : Form
    {
        private double acumulado;
        private string operador = "";
        private bool nuevoNumero = true;

        public Form1()
        {
            InitializeComponent();
        }

        private void Digito_Click(object sender, EventArgs e)
        {
            var digito = ((Button)sender).Text;
            if (nuevoNumero || txtPantalla.Text == "0")
            {
                txtPantalla.Text = digito;
                nuevoNumero = false;
            }
            else
            {
                txtPantalla.Text += digito;
            }
        }

        private void Operador_Click(object sender, EventArgs e)
        {
            Calcular();
            operador = ((Button)sender).Text;
            nuevoNumero = true;
        }

        private void Igual_Click(object sender, EventArgs e)
        {
            Calcular();
            operador = "";
            nuevoNumero = true;
        }

        private void Limpiar_Click(object sender, EventArgs e)
        {
            acumulado = 0;
            operador = "";
            txtPantalla.Text = "0";
            nuevoNumero = true;
        }

        private void Calcular()
        {
            double actual = double.Parse(txtPantalla.Text);
            switch (operador)
            {
                case "+": acumulado += actual; break;
                case "-": acumulado -= actual; break;
                case "*": acumulado *= actual; break;
                case "/":
                    if (actual == 0)
                    {
                        MessageBox.Show("No se puede dividir entre cero.", "Calculadora", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    acumulado /= actual;
                    break;
                default: acumulado = actual; break;
            }
            txtPantalla.Text = acumulado.ToString();
        }
    }
}
`;
}

// ---------------------------------------------------------------- lista de tareas

function tasksForm(ns: string): DForm {
    const f = baseForm(ns, 'Lista de tareas', 420, 420);
    f.props.AcceptButton = 'this.btnAgregar';
    f.controls.push(
        ctl('Label', 'lblNueva', { AutoSize: 'true', Location: pt(12, 15), Size: sz(95, 20), TabIndex: '0', Text: str('Nueva tarea:') }),
        ctl('TextBox', 'txtTarea', { Location: pt(12, 40), Size: sz(290, 27), TabIndex: '1' }),
        ctl('Button', 'btnAgregar', { Location: pt(310, 39), Size: sz(98, 29), TabIndex: '2', Text: str('Agregar'), UseVisualStyleBackColor: 'true' }, { Click: 'btnAgregar_Click' }),
        ctl('ListBox', 'lstTareas', { FormattingEnabled: 'true', Location: pt(12, 80), Size: sz(396, 264), TabIndex: '3' }, { SelectedIndexChanged: 'lstTareas_SelectedIndexChanged' }),
        ctl('Button', 'btnEliminar', { Enabled: 'false', Location: pt(12, 355), Size: sz(180, 32), TabIndex: '4', Text: str('Eliminar seleccionada'), UseVisualStyleBackColor: 'true' }, { Click: 'btnEliminar_Click' }),
        ctl('Label', 'lblContador', { AutoSize: 'true', Location: pt(300, 361), Size: sz(70, 20), TabIndex: '5', Text: str('0 tareas') }),
    );
    return f;
}

function tasksCode(ns: string): string {
    return `using System;
using System.Windows.Forms;

namespace ${ns}
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private void btnAgregar_Click(object sender, EventArgs e)
        {
            var tarea = txtTarea.Text.Trim();
            if (tarea.Length == 0)
            {
                MessageBox.Show("Escribe una tarea primero.", "Lista de tareas");
                return;
            }
            lstTareas.Items.Add(tarea);
            txtTarea.Clear();
            txtTarea.Focus();
            ActualizarContador();
        }

        private void btnEliminar_Click(object sender, EventArgs e)
        {
            if (lstTareas.SelectedIndex >= 0)
            {
                lstTareas.Items.RemoveAt(lstTareas.SelectedIndex);
                ActualizarContador();
            }
        }

        private void lstTareas_SelectedIndexChanged(object sender, EventArgs e)
        {
            btnEliminar.Enabled = lstTareas.SelectedIndex >= 0;
        }

        private void ActualizarContador()
        {
            int n = lstTareas.Items.Count;
            lblContador.Text = n == 1 ? "1 tarea" : n + " tareas";
        }
    }
}
`;
}

// ---------------------------------------------------------------- consola

function guessProgram(ns: string): string {
    return `using System;

namespace ${ns}
{
    internal class Program
    {
        static void Main(string[] args)
        {
            var azar = new Random();
            int secreto = azar.Next(1, 101);
            int intentos = 0;

            Console.WriteLine("Estoy pensando en un número del 1 al 100. ¡Adivínalo!");
            while (true)
            {
                Console.Write("Tu número: ");
                if (!int.TryParse(Console.ReadLine(), out int n))
                {
                    Console.WriteLine("Eso no es un número.");
                    continue;
                }
                intentos++;
                if (n < secreto) Console.WriteLine("Más alto...");
                else if (n > secreto) Console.WriteLine("Más bajo...");
                else
                {
                    Console.WriteLine($"¡Correcto! Lo lograste en {intentos} intentos.");
                    break;
                }
            }
        }
    }
}
`;
}

function tableProgram(ns: string): string {
    return `using System;

namespace ${ns}
{
    internal class Program
    {
        static void Main(string[] args)
        {
            int numero;
            Console.Write("¿Qué tabla quieres ver? ");
            while (!int.TryParse(Console.ReadLine(), out numero))
            {
                Console.Write("Escribe un número entero: ");
            }

            Console.WriteLine();
            for (int i = 1; i <= 12; i++)
            {
                Console.WriteLine($"{numero,3} x {i,2} = {numero * i,5}");
            }
        }
    }
}
`;
}
