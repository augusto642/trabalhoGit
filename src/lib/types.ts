export interface Student {
  id: string;
  name: string;
  turma: string;
  hasCloned: boolean;
  hasEdited: boolean;
  hasCommitted: boolean;
  hasPushed: boolean;
  score: number;
  totalCommands: number;
  errorCommands: number;
  createdAt: string;
  lastActive: string;
}

export interface CommandLog {
  id: string;
  studentId: string;
  studentName: string;
  turma: string;
  command: string;
  output: string;
  isError: boolean;
  tip?: string;
  timestamp: string;
}

export interface Commit {
  id: string;
  hash: string;
  author: string;
  authorTurma: string;
  message: string;
  timestamp: string;
  filesChanged: string[];
}

export interface Repository {
  id: string;
  name: string;
  owner: string;
  description: string;
  defaultBranch: string;
  cloneUrl: string;
  files: Record<string, string>;
  commits: Commit[];
  updatedAt: string;
}

export interface StepStatus {
  step: number;
  title: string;
  description: string;
  commandSuggestion?: string;
  completed: boolean;
}
