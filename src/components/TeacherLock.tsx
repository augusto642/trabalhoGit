"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, ShieldCheck, X } from "lucide-react";
import { useModalAccessibility } from "./useModalAccessibility";
import {
  getTeacherUnlock,
  setTeacherUnlock,
  verifyTeacherPassword,
  type TeacherUnlock,
} from "@/lib/teacherUnlock";

/**
 * Acesso ao Painel do Professor: SÓ pelo cadeado discreto no canto da
 * página. Não há link na Navbar, no rodapé da home nem no modal de
 * conclusão — quem abre o cadeado informa NOME (identificação, exibida no
 * cabeçalho do painel) e SENHA (verificada no servidor, nunca guardada no
 * cliente). O desbloqueio vive só nesta aba (sessionStorage).
 */

// ---------------------------------------------------------------- diálogo

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: (name: string) => void;
}

export const TeacherLockDialog: React.FC<DialogProps> = ({
  open,
  onClose,
  onUnlocked,
}) => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const dialogRef = useModalAccessibility(open, onClose);

  // Ressincroniza os campos a cada abertura (o modal fica montado).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setName("");
    setPassword("");
    setError(null);
    setVerifying(false);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (cleanName.length === 0) {
      setError("Informe seu nome.");
      return;
    }
    if (password.length === 0) {
      setError("Informe a senha.");
      return;
    }
    setError(null);
    setVerifying(true);
    const { status, token } = await verifyTeacherPassword(password);
    setVerifying(false);
    if (status === "ok") {
      // Desbloqueio ÚNICO: guarda o token (nunca a senha) — ele autoriza
      // o reset sem redigitar. Sem token na resposta, o desbloqueio vale
      // para o painel e o reset volta a pedir a senha (fallback).
      setTeacherUnlock(cleanName, token ?? "");
      onUnlocked(cleanName);
      return;
    }
    if (status === "unavailable") {
      setError(
        "Senha do professor não configurada no servidor — o painel não pode ser desbloqueado.",
      );
    } else if (status === "unreachable") {
      setError("Não foi possível verificar — confira a conexão e tente novamente.");
    } else {
      setError("Nome ou senha inválidos.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-lock-title"
        className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-2xl p-6 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-gray-400" />
            <h2 id="teacher-lock-title" className="text-base font-bold">
              Painel do Professor
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-gray-400 hover:text-gray-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400 leading-relaxed">
          Acesso restrito. O nome é só identificação e aparece no cabeçalho do
          painel; a senha é verificada no servidor e não fica guardada.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="teacher-lock-name"
              className="text-xs font-semibold text-gray-300"
            >
              Nome
            </label>
            <input
              id="teacher-lock-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Seu nome"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="teacher-lock-password"
              className="text-xs font-semibold text-gray-300"
            >
              Senha
            </label>
            <input
              id="teacher-lock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Senha do professor"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && (
            <div role="alert" className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={verifying}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition cursor-pointer"
            >
              {verifying ? "Verificando…" : "Desbloquear painel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 font-semibold text-sm transition cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------------------------------------------------- botão-cadeado

/**
 * Cadeado discreto fixo no canto inferior direito de TODAS as páginas
 * (renderizado no AppWrapper). Baixa evidência até hover/foco, mas sempre
 * focável por teclado, com aria-label. Desbloqueado, o clique abre o painel.
 */
export const TeacherLockButton: React.FC = () => {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    // Leitura em efeito: sessionStorage não existe na pré-renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlocked(getTeacherUnlock() !== null);
  }, []);

  const handleClick = () => {
    if (unlocked || getTeacherUnlock() !== null) {
      router.push("/professor");
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Painel do Professor"
        title={unlocked ? "Abrir Painel do Professor" : "Painel do Professor"}
        className="fixed bottom-4 right-4 z-50 p-2.5 rounded-full bg-[#21262d]/80 border border-[#30363d] text-gray-500 opacity-40 hover:opacity-100 hover:text-gray-200 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition cursor-pointer"
      >
        {unlocked ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </button>
      <TeacherLockDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onUnlocked={() => {
          setUnlocked(true);
          setDialogOpen(false);
          router.push("/professor");
        }}
      />
    </>
  );
};

// ------------------------------------------------------------------- portão

/**
 * Portão da página /professor: sem desbloqueio nesta aba, mostra o cartão
 * de acesso restrito (nunca o painel). O servidor continua devolvendo 200
 * com HTML — o bloqueio é de UI, não de rota (ver relatório).
 */
export const TeacherLockGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [unlock, setUnlock] = useState<TeacherUnlock | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    // Leitura em efeito de propósito (mesmo motivo do ProfessorView).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlock(getTeacherUnlock());
  }, []);

  if (!unlock) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="max-w-md mx-auto bg-[#161b22] border border-[#30363d] rounded-2xl p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center">
            <Lock className="w-5 h-5 text-gray-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-white">Painel do Professor</h1>
          <p className="mt-2 text-sm text-gray-400 leading-relaxed">
            Acesso restrito. Clique no cadeado no canto inferior direito da
            página, ou no botão abaixo, e informe seu nome e a senha do
            professor.
          </p>
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            O nome é só identificação e aparece no cabeçalho do painel.
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-5 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition cursor-pointer"
          >
            Desbloquear painel
          </button>
        </div>
        <TeacherLockDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onUnlocked={(name) => {
            setUnlock({ name, unlockedAt: new Date().toISOString() });
            setDialogOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 flex items-center gap-2 text-xs text-gray-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>
          Acesso do professor: <strong className="text-gray-200">{unlock.name}</strong>
        </span>
      </div>
      {children}
    </>
  );
};
