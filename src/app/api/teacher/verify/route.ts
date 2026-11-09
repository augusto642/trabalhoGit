import { NextResponse } from "next/server";
import { constantTimeEquals, issueTeacherToken } from "@/lib/auth";
import {
  clientIp,
  recordVerifyFailure,
  recordVerifySuccess,
  sleep,
  verifyBlocked,
  verifyFailureDelayMs,
} from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/teacher/verify — desbloqueio do Painel do Professor (UI).
 *
 * O cadeado discreto no canto da página pede NOME e SENHA; só a senha é
 * verificada aqui. O nome é IDENTIFICAÇÃO (exibida no cabeçalho do painel),
 * não um segundo segredo: não é enviado ao servidor nem verificado — o
 * cliente só exige que não venha vazio.
 *
 * Desbloqueio ÚNICO: com a senha certa, além do 200 devolve um TOKEN DE
 * SESSÃO stateless (HMAC com a própria TEACHER_PASSWORD + expiração de 2h
 * — ver `src/lib/auth.ts`), que o cliente guarda só nesta aba e envia no
 * reset. Assim o painel desbloqueado autoriza o reset sem redigitar a
 * senha. A SENHA nunca volta na resposta nem é guardada no cliente.
 *
 * Fail-closed: sem `TEACHER_PASSWORD` configurada, responde 503 e NADA é
 * desbloqueado (diferente do /api/reset, que fora de produção libera sem
 * senha — aqui a ausência da variável nunca abre o painel).
 * Senha errada ou ausente -> 401 com mensagem genérica, sem revelar qual
 * campo falhou nem se a senha existe.
 *
 * Rate limit (S7, 30/10/2026): por IP, em memória — 5 falhas seguidas
 * passam a custar atraso de 1,5 s por tentativa; 20 falhas em 10 min
 * bloqueiam o IP por 60 s (429). Limite generoso e bloqueio curto de
 * propósito: a escola inteira pode estar atrás de um único IP (NAT) e
 * travar a sala por erro de digitação seria pior que o atraso. Resíduo:
 * o contador é por instância (serverless multi-instância o enfraquece)
 * — o fechamento total exige contador no banco.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (verifyBlocked(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas — aguarde um minuto" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordVerifyFailure(ip);
    await recordAudit({ action: "verify-fail", actor: "desconhecido", detail: "corpo inválido" });
    return NextResponse.json({ error: "Nome ou senha inválidos" }, { status: 401 });
  }

  const password = (body as { password?: unknown } | null)?.password;
  if (typeof password !== "string" || password.length === 0 || password.length > 500) {
    recordVerifyFailure(ip);
    await recordAudit({ action: "verify-fail", actor: "desconhecido", detail: "senha ausente ou inválida" });
    return NextResponse.json({ error: "Nome ou senha inválidos" }, { status: 401 });
  }

  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Senha do professor não configurada no servidor" },
      { status: 503 },
    );
  }

  if (!constantTimeEquals(password, expected)) {
    recordVerifyFailure(ip);
    await recordAudit({ action: "verify-fail", actor: "desconhecido", detail: "senha incorreta" });
    // Atraso progressivo: força bruta online fica impraticável sem
    // bloquear a sala (o atraso só se aplica a tentativas falhas).
    const delay = verifyFailureDelayMs(ip);
    if (delay > 0) await sleep(delay);
    return NextResponse.json({ error: "Nome ou senha inválidos" }, { status: 401 });
  }

  recordVerifySuccess(ip);
  await recordAudit({ action: "verify-ok", actor: "professor", detail: "desbloqueio do painel" });
  return NextResponse.json({ ok: true, token: issueTeacherToken(expected) });
}
