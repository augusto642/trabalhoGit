import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autorização do reset (POST /api/reset) — a única rota que exige a senha
 * do professor. As escritas do fluxo do aluno (POST /api/students,
 * /api/repository, /api/logs, /api/git/push) NÃO passam por aqui, por
 * desenho: são a própria aula, e a UI do aluno não envia (nem deve enviar)
 * a senha do professor; a proteção delas é a validação de schema.
 *
 * Regra (lida em tempo de requisição, não no carregamento do módulo):
 * - Se `TEACHER_PASSWORD` estiver definida (não vazia): a requisição precisa
 *   trazer o header `x-teacher-password` com exatamente esse valor OU o
 *   header `x-teacher-token` com um token de sessão válido (ver abaixo).
 *   Nenhuma credencial válida -> 401, com mensagem genérica que não revela
 *   se a senha existe, qual é, nem qual parte falhou.
 * - Se `TEACHER_PASSWORD` NÃO estiver definida e `NODE_ENV=production`:
 *   o reset retorna 503 (fail-closed). Produção sem senha não apaga a
 *   turma — o deploy precisa configurar a variável antes de aceitar o reset.
 * - Se `TEACHER_PASSWORD` NÃO estiver definida e NÃO for produção
 *   (dev/test): permite, para não quebrar o fluxo local de aula/teste.
 *   Isso é deliberado e só vale fora de produção; nunca confie nele no ar.
 *
 * A comparação usa `timingSafeEqual` para não vazar, pelo tempo de resposta,
 * quantos caracteres do header conferem com a senha.
 *
 * Token de sessão (desbloqueio ÚNICO): `POST /api/teacher/verify`, com a
 * senha certa, devolve um token que autoriza o reset sem redigitar a senha.
 * O token é STATELESS e funciona na Vercel serverless (sem estado
 * compartilhado entre instâncias): formato `v1.<exp>.<sig>`, onde `exp` é
 * o vencimento em segundos (2h após a emissão — reduzido de 8h na
 * correção de segurança de 30/10/2026, S5) e `sig` é o HMAC-SHA256 da
 * `TEACHER_PASSWORD` sobre `v1.<exp>`. Qualquer instância verifica o token
 * só com a variável de ambiente — nada é guardado no servidor. Se a senha
 * mudar, todos os tokens antigos morrem (o HMAC deixa de conferir). O
 * token NÃO revela a senha e expira sozinho; o cliente o guarda só nesta
 * aba (sessionStorage) e nunca guarda a senha por causa dele.
 *
 * Resíduo honesto (S5): o token continua sendo um portador (bearer) sem
 * vínculo a aba/IP/sessão — vincular exigiria estado compartilhado no
 * servidor, que o desenho stateless/serverless não tem. Quem copiar o
 * token o usa por até 2h, de qualquer máquina. A mitigação viável sem
 * identidade de sessão foi o TTL menor + rate limit no verify; a
 * revogação continua sendo trocar a TEACHER_PASSWORD.
 */

export const TEACHER_PASSWORD_HEADER = "x-teacher-password";
export const TEACHER_TOKEN_HEADER = "x-teacher-token";
export const TEACHER_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h (era 8h)

export function issueTeacherToken(secret: string, nowMs: number = Date.now()): string {
  const exp = Math.floor((nowMs + TEACHER_TOKEN_TTL_MS) / 1000);
  const payload = `v1.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyTeacherToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return false;
  const payload = `v1.${parts[1]}`;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  return constantTimeEquals(parts[2], expectedSig);
}

export type TeacherAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige buffers de mesmo tamanho; tamanhos diferentes
  // já são, por definição, valores diferentes — sem comparar conteúdo.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireTeacherAuth(req: Request): TeacherAuthResult {
  const password = process.env.TEACHER_PASSWORD;

  if (password) {
    // Desbloqueio ÚNICO: senha OU token de sessão válido autorizam.
    // O token é verificado antes de qualquer diferença observável: falha
    // de senha, de token ou de expiração dá o mesmo 401 genérico.
    const provided = req.headers.get(TEACHER_PASSWORD_HEADER);
    if (provided && constantTimeEquals(provided, password)) {
      return { ok: true };
    }
    const token = req.headers.get(TEACHER_TOKEN_HEADER);
    if (token && verifyTeacherToken(token, password)) {
      return { ok: true };
    }
    return { ok: false, status: 401, error: "Não autorizado" };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      status: 503,
      error: "Escrita indisponível: senha do professor não configurada",
    };
  }

  // Dev/test sem TEACHER_PASSWORD: fluxo local liberado (ver comentário acima).
  return { ok: true };
}
