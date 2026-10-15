const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function main() {
  const distDir = path.resolve(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copia os estilos CSS para a pasta de distribuição
  const copyCss = () => {
    const srcCss = path.resolve(__dirname, 'webview-ui/src/styles.css');
    const destCss = path.resolve(distDir, 'webview.css');
    if (fs.existsSync(srcCss)) {
      fs.copyFileSync(srcCss, destCss);
      console.log('Copied webview-ui/src/styles.css -> dist/webview.css');
    }
  };

  copyCss();

  // 1. Configuração do Extension Host (Node.js CommonJS)
  const extensionConfig = {
    entryPoints: [path.resolve(__dirname, 'src/extension.ts')],
    bundle: true,
    outfile: path.resolve(distDir, 'extension.js'),
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  };

  // 2. Configuração do Webview UI (Browser IIFE)
  const webviewConfig = {
    entryPoints: [path.resolve(__dirname, 'webview-ui/src/index.ts')],
    bundle: true,
    outfile: path.resolve(distDir, 'webview.js'),
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  };

  if (isWatch) {
    console.log('Iniciando esbuild em modo watch...');
    const ctxExtension = await esbuild.context(extensionConfig);
    const ctxWebview = await esbuild.context(webviewConfig);

    await ctxExtension.watch();
    await ctxWebview.watch();

    // Watch simples para o arquivo CSS
    fs.watchFile(path.resolve(__dirname, 'webview-ui/src/styles.css'), () => {
      copyCss();
    });

    console.log('Observando alterações nos fontes...');
  } else {
    console.log('Compilando extensão AprendeAI com esbuild...');
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    console.log('Build concluído com sucesso em dist/!');
  }
}

main().catch((err) => {
  console.error('Erro durante o build:', err);
  process.exit(1);
});
