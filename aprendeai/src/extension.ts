import * as vscode from 'vscode';
import { TutorViewProvider } from './adapters/TutorViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  // Inicialização do provedor da barra lateral Webview
  const tutorProvider = new TutorViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TutorViewProvider.viewType,
      tutorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Status Bar Item visível com indicador se está ligado ou desligado
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'aprendeai.togglePower';

  const updateStatusBar = (enabled: boolean): void => {
    if (enabled) {
      statusBarItem.text = '$(pass-filled) AprendeAI: Ligado';
      statusBarItem.tooltip = 'AprendeAI Mentor Socrático: Ligado (Clique para pausar)';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.color = '#10b981';
    } else {
      statusBarItem.text = '$(circle-slash) AprendeAI: Pausado';
      statusBarItem.tooltip = 'AprendeAI Mentor Socrático: Pausado (Clique para reativar)';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBarItem.color = undefined;
    }
    statusBarItem.show();
  };

  updateStatusBar(tutorProvider.isEnabled());
  tutorProvider.onEnabledChange = updateStatusBar;
  context.subscriptions.push(statusBarItem);

  // Status Bar Item do Gato Byte fixado no rodapé do Editor de Código
  const catStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    101
  );
  catStatusBarItem.command = 'aprendeai.chatWithCat';
  catStatusBarItem.text = '🐱 Byte';
  catStatusBarItem.tooltip = 'Gato Tutor Anime Byte: Miau! Clique para conversar ou pedir uma dica sobre seu código.';
  catStatusBarItem.show();
  context.subscriptions.push(catStatusBarItem);

  // Animação viva do gato na barra alternando expressões sutis
  const IDLE_EXPRESSIONS = [
    '🐱 Byte',
    '😸 Byte',
    '😺 Byte',
    '😽 Byte',
    '🐾 Byte',
    '🐱 Byte ✨'
  ];
  let catAnimIndex = 0;
  let isCatBusy = false;

  const catAnimTimer = setInterval(() => {
    if (!isCatBusy) {
      catAnimIndex = (catAnimIndex + 1) % IDLE_EXPRESSIONS.length;
      catStatusBarItem.text = IDLE_EXPRESSIONS[catAnimIndex];
    }
  }, 3400);

  context.subscriptions.push({
    dispose: () => clearInterval(catAnimTimer)
  });

  // Reação dinâmica do gato na barra às ações pedagógicas
  tutorProvider.onCatStateChange = (state: 'idle' | 'thinking' | 'speaking' | 'celebrating', notificationMsg?: string) => {
    switch (state) {
      case 'thinking':
        isCatBusy = true;
        catStatusBarItem.text = '$(sync~spin) 🐱 Byte pensando...';
        break;

      case 'speaking':
        isCatBusy = true;
        catStatusBarItem.text = '$(loading~spin) 🐾 Byte escrevendo...';
        break;

      case 'celebrating':
        isCatBusy = true;
        catStatusBarItem.text = '✨ 😻 Byte: Dica pronta!';
        if (notificationMsg) {
          vscode.window.showInformationMessage(`🐱 Byte: "${notificationMsg}"`, 'Ver no Chat').then((selection) => {
            if (selection === 'Ver no Chat') {
              vscode.commands.executeCommand('aprendeai.tutorView.focus');
            }
          });
        }
        setTimeout(() => {
          isCatBusy = false;
          catStatusBarItem.text = '🐱 Byte';
        }, 5000);
        break;

      case 'idle':
      default:
        isCatBusy = false;
        catStatusBarItem.text = '🐱 Byte';
        break;
    }
  };

  // Registro do comando: Conversar com o Gato Byte (Balão de Fala de Notificação no Editor)
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.chatWithCat', async () => {
      // Expressão de piscadela amigável na barra
      catStatusBarItem.text = '😸 Byte: Miau!';
      setTimeout(() => {
        if (!isCatBusy) catStatusBarItem.text = '🐱 Byte';
      }, 3500);

      const speeches = [
        'Miau! Tô aqui no seu editor acompanhando seu código. O que vamos codar agora? 🐾',
        'Ronrom... Vi que você está concentrado! Quer uma pista socrática para o próximo passo? 💡',
        'Miau! Se pintar bug ou dúvida, eu destrincho com você sem dar spoiler! 🐾'
      ];
      const speech = speeches[Math.floor(Math.random() * speeches.length)];

      const choice = await vscode.window.showInformationMessage(
        `🐱 Byte: "${speech}"`,
        '💡 Pedir Dica Socrática',
        '⚠️ Analisar Erro',
        '💬 Abrir Chat do Tutor'
      );
      if (choice === '💡 Pedir Dica Socrática') {
        await vscode.commands.executeCommand('aprendeai.askHint');
      } else if (choice === '⚠️ Analisar Erro') {
        await vscode.commands.executeCommand('aprendeai.explainTerminal');
      } else if (choice === '💬 Abrir Chat do Tutor') {
        await vscode.commands.executeCommand('aprendeai.tutorView.focus');
      }
    })
  );

  // Registro do comando: Alternar Ligar/Desligar
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.togglePower', async () => {
      const newState = await tutorProvider.toggleEnabled();
      vscode.window.showInformationMessage(
        newState ? '🟢 AprendeAI Mentor ativado.' : '⚪ AprendeAI Mentor pausado.'
      );
    })
  );

  // Registro do comando: Pedir Ajuda Socrática
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.askHint', async () => {
      await vscode.commands.executeCommand('aprendeai.tutorView.focus');
      await tutorProvider.askHint();
    })
  );

  // Registro do comando: Analisar Erro do Terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.explainTerminal', async () => {
      await vscode.commands.executeCommand('aprendeai.tutorView.focus');
      await tutorProvider.explainTerminal();
    })
  );

  // Registro do comando: Válvula de Escape
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.emergencyBypass', async () => {
      await vscode.commands.executeCommand('aprendeai.tutorView.focus');
      await tutorProvider.emergencyBypass();
    })
  );

  // Registro do comando: Gerar Nota Pedagógica
  context.subscriptions.push(
    vscode.commands.registerCommand('aprendeai.generateStudyNote', async () => {
      await vscode.commands.executeCommand('aprendeai.tutorView.focus');
      await tutorProvider.generateStudyNote();
    })
  );
}

export function deactivate(): void {
  // Limpeza de recursos caso necessário
}
