// Pruebas del lector/escritor de Designer.cs:  npm test
import * as assert from 'assert';
import { parseDesigner, generateDesigner, DControl } from '../designer/model';

const TEMPLATE = `﻿namespace WfTest;

partial class Form1
{
    private System.ComponentModel.IContainer components = null;

    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.ClientSize = new System.Drawing.Size(800, 450);
        this.Text = "Form1";
    }
}
`;

// Formato que genera Visual Studio 2022 para .NET 8 (sin this., nombres cortos)
const VS2022 = `namespace Demo
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            button1 = new Button();
            groupBox1 = new GroupBox();
            checkBox1 = new CheckBox();
            comboBox1 = new ComboBox();
            timer1 = new System.Windows.Forms.Timer(components);
            groupBox1.SuspendLayout();
            SuspendLayout();
            //
            // button1
            //
            button1.FlatAppearance.BorderSize = 0;
            button1.Location = new Point(12, 12);
            button1.Name = "button1";
            button1.Size = new Size(94, 29);
            button1.TabIndex = 0;
            button1.Text = "Hola; \\"mundo\\"";
            button1.UseVisualStyleBackColor = true;
            button1.Click += button1_Click;
            //
            // groupBox1
            //
            groupBox1.Controls.Add(checkBox1);
            groupBox1.Location = new Point(12, 60);
            groupBox1.Name = "groupBox1";
            groupBox1.Size = new Size(250, 125);
            groupBox1.TabIndex = 1;
            groupBox1.TabStop = false;
            groupBox1.Text = "Opciones";
            //
            // checkBox1
            //
            checkBox1.AutoSize = true;
            checkBox1.Location = new Point(6, 26);
            checkBox1.Name = "checkBox1";
            checkBox1.Size = new Size(101, 24);
            checkBox1.TabIndex = 0;
            checkBox1.Text = "checkBox1";
            checkBox1.CheckedChanged += new System.EventHandler(this.checkBox1_CheckedChanged);
            //
            // comboBox1
            //
            comboBox1.FormattingEnabled = true;
            comboBox1.Items.AddRange(new object[] { "Uno", "Dos; tres", "Cuatro" });
            comboBox1.Location = new Point(300, 12);
            comboBox1.Name = "comboBox1";
            comboBox1.Size = new Size(151, 28);
            comboBox1.TabIndex = 2;
            //
            // timer1
            //
            timer1.Interval = 500;
            timer1.Tick += timer1_Tick;
            //
            // MainForm
            //
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 450);
            Controls.Add(comboBox1);
            Controls.Add(groupBox1);
            Controls.Add(button1);
            Name = "MainForm";
            Text = "Principal";
            Load += MainForm_Load;
            groupBox1.ResumeLayout(false);
            groupBox1.PerformLayout();
            ResumeLayout(false);
        }

        private Button button1;
        private GroupBox groupBox1;
        private CheckBox checkBox1;
        private ComboBox comboBox1;
        private System.Windows.Forms.Timer timer1;
    }
}
`;

let failures = 0;
function test(name: string, fn: () => void) {
    try { fn(); console.log(`ok   ${name}`); }
    catch (e) { failures++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
}

test('plantilla de dotnet new winforms', () => {
    const f = parseDesigner(TEMPLATE);
    assert.strictEqual(f.namespace, 'WfTest');
    assert.strictEqual(f.fileScoped, true);
    assert.strictEqual(f.className, 'Form1');
    assert.strictEqual(f.props.ClientSize, 'new System.Drawing.Size(800, 450)');
    assert.strictEqual(f.props.Text, '"Form1"');
    assert.strictEqual(f.controls.length, 0);
    assert.ok(!generateDesigner(f).includes('﻿'));
});

test('formato VS 2022 (.NET 8)', () => {
    const f = parseDesigner(VS2022);
    assert.strictEqual(f.fileScoped, false);
    assert.strictEqual(f.className, 'MainForm');
    assert.deepStrictEqual(f.controls.map(c => c.name), ['button1', 'groupBox1', 'checkBox1', 'comboBox1', 'timer1']);
    const get = (n: string) => f.controls.find(c => c.name === n) as DControl;
    assert.strictEqual(get('button1').type, 'System.Windows.Forms.Button');
    assert.strictEqual(get('button1').props.Text, '"Hola; \\"mundo\\""');
    assert.strictEqual(get('button1').props['FlatAppearance.BorderSize'], '0');
    assert.strictEqual(get('button1').events.Click, 'button1_Click');
    assert.strictEqual(get('checkBox1').parent, 'groupBox1');
    assert.strictEqual(get('checkBox1').events.CheckedChanged, 'checkBox1_CheckedChanged');
    assert.strictEqual(get('timer1').ctorArgs, 'components');
    assert.strictEqual(get('comboBox1').extra.length, 1);
    assert.ok(get('comboBox1').extra[0].includes('"Dos; tres"'));
    assert.strictEqual(f.events.Load, 'MainForm_Load');
    assert.strictEqual(f.props.AutoScaleDimensions, 'new SizeF(8F, 20F)');
});

test('ida y vuelta estable', () => {
    const once = generateDesigner(parseDesigner(VS2022));
    const twice = generateDesigner(parseDesigner(once));
    assert.strictEqual(twice, once);
    assert.ok(once.includes('this.groupBox1.Controls.Add(this.checkBox1);'));
    assert.ok(once.includes('this.Controls.Add(this.comboBox1);'));
    assert.ok(once.includes('this.timer1.Tick += new System.EventHandler(this.timer1_Tick);'));
    assert.ok(once.includes('private System.Windows.Forms.Timer timer1;'));
});

if (process.argv[2]) {
    // modo herramienta: node designerModel.test.js <Designer.cs> → reescribe con un formulario de ejemplo
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const file = process.argv[2];
    const f = parseDesigner(fs.readFileSync(file, 'utf8'));
    const g = parseDesigner(VS2022);
    f.controls = g.controls;
    f.controls.forEach(c => { if (c.ctorArgs === 'components') { c.ctorArgs = 'this.components'; } });
    f.events = { Load: 'Form1_Load' };
    f.props.Text = '"Prueba Mini Studio"';
    fs.writeFileSync(file, generateDesigner(f));
    console.log(`reescrito ${file}`);
}

if (failures) { process.exitCode = 1; }
