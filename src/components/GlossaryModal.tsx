"use client";

import React from "react";
import { GLOSSARY } from "@/lib/activity";
import { useModalAccessibility } from "./useModalAccessibility";
import { BookOpen, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Glossário do GitSim — definições curtas em português claro para os termos
 * usados no app (fonte: GLOSSARY em src/lib/activity.ts). Textos curtos,
 * sem jargão sem definição.
 */
export const GlossaryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const dialogRef = useModalAccessibility(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-title"
        className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#161b22] border border-[#30363d] shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9]"
      >
        <div className="p-5 bg-[#1c2128] border-b border-[#30363d] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 id="glossary-title" className="font-bold text-white text-base">
                Glossário do Git
              </h2>
              <p className="text-xs text-gray-400">
                Os termos usados nesta atividade, explicados em português claro.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Fechar glossário"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <dl className="space-y-4">
            {GLOSSARY.map((entry) => (
              <div key={entry.term}>
                <dt className="text-sm font-bold text-white">{entry.term}</dt>
                <dd className="text-xs text-gray-400 leading-relaxed mt-0.5">
                  {entry.definition}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="p-3 bg-[#1c2128] border-t border-[#30363d] flex justify-end">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 rounded-lg bg-[#30363d] hover:bg-[#3f4752] text-white text-xs font-semibold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
