import * as assert from 'assert';
import * as proxyquire from 'proxyquire';
import { MockingUtils, MockingExec } from './MockingUtils';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

const mockedExec = new MockingExec();
const mockedCommands = MockingUtils.mockedCommands();

import { Messages } from '../../ui/messages';
import { DafnyCommands } from '../../commands';
import VerificationGutterStatusView from '../../ui/verificationGutterStatusView';
import { DocumentSymbol } from 'vscode';

const mockedWorkspace = MockingUtils.mockedWorkspace();
const mockedVsCode = {
  window: {
    activeTerminal: null as any,
    activeTextEditor: null as any
  },
  commands: {
    registerCommand(command: string, callback: () => void): vscode.Disposable {
      return mockedCommands.registerCommand(command, callback);
    }
  },
  workspace: mockedWorkspace,
  '@global': true
};
const CompileCommands = proxyquire('../../ui/compileCommands', {
  'vscode': mockedVsCode
}).default;

const { DafnyInstaller } = proxyquire('../../language/dafnyInstallation', {
  'child_process': proxyquire('child_process', {
    exec: mockedExec.stub
  }),
  vscode: mockedVsCode
});

suite('Compiler invocation', () => {
  test('Check command creation', async () => {
    const context = MockingUtils.mockedContext();
    CompileCommands.createAndRegister(context);
    assert.strictEqual(true, DafnyCommands.Compile in mockedCommands.registeredCommands);
    assert.strictEqual(true, DafnyCommands.CompileAndRun in mockedCommands.registeredCommands);
    assert.strictEqual(true, DafnyCommands.CompileCustomArgs in mockedCommands.registeredCommands);
    const checkpoints = {
      accessedSave: false,
      accessedIsUntitled: false,
      accessedShow: false
    };

    mockedVsCode.window.activeTextEditor = {
      document: {
        get isUntitled() {
          checkpoints.accessedIsUntitled = true; return false;
        },
        save(): Promise<boolean> {
          checkpoints.accessedSave = true;
          return Promise.resolve(true);
        },
        fileName: 'fileName.dfy'
      } as unknown as vscode.TextDocument
    } as unknown as vscode.TextEditor;
    let textSent = '';
    mockedVsCode.window.activeTerminal = {
      show(): void {
        checkpoints.accessedShow = true;
      },
      sendText(command: string): void {
        textSent = command;
      }
    };
    const returnValue = await(mockedCommands.registeredCommands[DafnyCommands.Compile]() as unknown as Promise<boolean>);
    for(const checkpoint in checkpoints) {
      assert.strictEqual(true, (checkpoints as any)[checkpoint], checkpoint);
    }
    assert.strictEqual('<compiler command prefix>"<dotnet executable path>" "<extension path>/<compiler runtime path>" "fileName.dfy" /out <arg1> arg2',
      textSent.replace(/\\/g, '/'));
    assert.strictEqual(true, returnValue, 'returnValue');
  }).timeout(60 * 1000);
});

suite('Dafny IDE Extension Installation', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Check constants', () => {
    assert.strictEqual(true, Messages.Dotnet.DownloadUri.includes('https'), 'Download URL should contain https');
  });

  test('Installer checks', async () => {
    const context = MockingUtils.mockedContext();
    const outputChannelBuilder = MockingUtils.mockedOutputChannelBuilder();
    mockedExec.set(MockingUtils.simpleCommandMap({
      [''] : { stderr: '', stdout: '' }
    }));
    const installer = new DafnyInstaller(context, outputChannelBuilder.outputChannel);
    mockedWorkspace.setFSExpects([
      (methodName) => {
        assert.strictEqual('delete', methodName);
        throw 'Simulated error in delete';
      }
    ]);
    assert.strictEqual(true, installer != null, 'Installer is not null');
    const result = await installer.install();
    assert.strictEqual(outputChannelBuilder.writtenContent().replace(/\\/g, '/').replace(/resources\/.*\n/, 'resources/\n'),
      'Starting Dafny installation\n'
      + 'deleting previous Dafny installation at /tmp/mockedUri/out/resources/\n'
      + 'Dafny installation failed:\n'
      + '> Simulated error in delete\n'
    );
    assert.strictEqual(false, result, 'Result is true');
  }).timeout(60 * 1000);
});

suite('Verification Gutter', () => {
  test('perLineStatusToRanges', () => {
    const ranges = VerificationGutterStatusView.perLineStatusToRanges([ 1, 1, 1, 0, 0, 0, 2, 2, 2 ], [ 2, 4, 6 ]);
    assert.deepStrictEqual([ new vscode.Range(0, 1, 1, 1) ], ranges.get(1));
    assert.deepStrictEqual([ new vscode.Range(7, 1, 8, 1) ], ranges.get(2));
    assert.deepStrictEqual([ new vscode.Range(3, 1, 3, 1), new vscode.Range(5, 1, 5, 1) ], ranges.get(0));
  });
});

suite('commands', () => {
  test.skip('restart server', async () => {
    const program = `
method Foo(x: nat) returns (y: nat) 
  ensures y > 2;
{ 
  return x + 2; 
}`;
    const extension = vscode.extensions.getExtension('dafny-lang.ide-vscode')!;
    await extension.activate();
    const document = await vscode.workspace.openTextDocument({ language: 'dafny', content: program });
    const symbols1 = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri) as DocumentSymbol[];
    await vscode.commands.executeCommand('dafny.restartServer');
    const symbols2 = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri) as DocumentSymbol[];
    assert.strictEqual(symbols1.length > 0, true);
    assert.strictEqual(symbols2.length, symbols1.length);
  });
});