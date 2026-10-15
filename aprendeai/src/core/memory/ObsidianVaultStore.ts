import * as vscode from 'vscode';

export interface StudyNote {
  title: string;
  slug: string;
  concept: string;
  content: string;
  relatedConcepts?: string[];
  mastery?: number;
  tags?: string[];
  createdAt?: Date;
}

export interface SaveNoteResult {
  workspaceUri: vscode.Uri;
  graphUri?: vscode.Uri;
  relativePath: string;
  graphRelativePath?: string;
}

export class ObsidianVaultStore {
  /**
   * Converte texto em slug para nomes de arquivo seguros
   */
  public static slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') || 'nota-estudo';
  }

  /**
   * Salva a nota diretamente no workspace ativo do usuário em docs/aprendizado/conceitos/<slug>.md
   */
  public static async saveToWorkspace(note: StudyNote): Promise<vscode.Uri> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Nenhum workspace ativo encontrado no VS Code para salvar a nota.');
    }

    const relativeDir = vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'aprendizado', 'conceitos');
    await vscode.workspace.fs.createDirectory(relativeDir);

    const fileUri = vscode.Uri.joinPath(relativeDir, `${note.slug}.md`);
    const contentBuffer = Buffer.from(note.content, 'utf8');

    await vscode.workspace.fs.writeFile(fileUri, contentBuffer);
    return fileUri;
  }

  /**
   * Abre o arquivo gerado em split view ao lado do código ativo
   */
  public static async openBeside(fileUri: vscode.Uri): Promise<vscode.TextEditor> {
    const document = await vscode.workspace.openTextDocument(fileUri);
    return await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
      preserveFocus: false
    });
  }

  /**
   * Salva uma cópia sincronizada na pasta do Grafo de Conhecimento (.mentor-memory/conceitos/<slug>.md)
   * com metadados YAML (frontmatter, links bidirecionais [[...]], maestria BKT e timestamp).
   */
  public static async saveToKnowledgeGraph(note: StudyNote): Promise<vscode.Uri> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Nenhum workspace ativo encontrado para sincronizar com o Grafo de Conhecimento.');
    }

    const graphDir = vscode.Uri.joinPath(workspaceFolder.uri, '.mentor-memory', 'conceitos');
    await vscode.workspace.fs.createDirectory(graphDir);

    const fileUri = vscode.Uri.joinPath(graphDir, `${note.slug}.md`);
    const graphContent = this.formatKnowledgeGraphMarkdown(note);
    const contentBuffer = Buffer.from(graphContent, 'utf8');

    await vscode.workspace.fs.writeFile(fileUri, contentBuffer);
    return fileUri;
  }

  /**
   * Salva no workspace, sincroniza no grafo e abre lado a lado no editor
   */
  public static async saveAndOpen(note: StudyNote): Promise<SaveNoteResult> {
    const workspaceUri = await this.saveToWorkspace(note);
    let graphUri: vscode.Uri | undefined;

    try {
      graphUri = await this.saveToKnowledgeGraph(note);
    } catch (err) {
      console.warn('Aviso ao sincronizar com Grafo de Conhecimento:', err);
    }

    await this.openBeside(workspaceUri);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const relativePath = workspaceFolder
      ? vscode.workspace.asRelativePath(workspaceUri, false)
      : `docs/aprendizado/conceitos/${note.slug}.md`;
    const graphRelativePath = graphUri && workspaceFolder
      ? vscode.workspace.asRelativePath(graphUri, false)
      : `.mentor-memory/conceitos/${note.slug}.md`;

    return {
      workspaceUri,
      graphUri,
      relativePath,
      graphRelativePath
    };
  }

  /**
   * Formata conteúdo com Frontmatter YAML e links bidirecionais [[...]] compatíveis com Obsidian
   */
  public static formatKnowledgeGraphMarkdown(note: StudyNote): string {
    const dateStr = (note.createdAt ?? new Date()).toISOString();
    const mastery = (note.mastery !== undefined ? note.mastery : 0.85).toFixed(2);
    const tags = note.tags && note.tags.length > 0
      ? note.tags
      : ['aprendizado', 'socratico', 'conceito', 'aprendeai'];

    const related = note.relatedConcepts && note.relatedConcepts.length > 0
      ? note.relatedConcepts
      : ['Clean-Code', 'Debugging', 'Arquitetura-de-Software'];

    const yamlFrontmatter = [
      '---',
      `title: "${note.title.replace(/"/g, '\\"')}"`,
      `slug: "${note.slug}"`,
      `concept: "${note.concept.replace(/"/g, '\\"')}"`,
      `created: "${dateStr}"`,
      `updated: "${dateStr}"`,
      `mastery_bkt: ${mastery}`,
      'tags:',
      ...tags.map((t) => `  - ${t}`),
      'related_concepts:',
      ...related.map((r) => `  - "[[${r}]]"`),
      '---',
      ''
    ].join('\n');

    // Seção de Conexões de Grafo Obsidian no rodapé
    const graphConnections = [
      '',
      '---',
      '### 🕸️ Conexões do Grafo de Conhecimento (Obsidian)',
      ...related.map((r) => `- [[${r}]]`),
      `- [[Índice de Conceitos]]`
    ].join('\n');

    return `${yamlFrontmatter}${note.content}\n${graphConnections}\n`;
  }
}
