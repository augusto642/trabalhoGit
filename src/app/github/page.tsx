"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { GitHubView } from "@/components/github/GitHubView";

export default function GitHubPage() {
  // O contexto já resolve o repositório da turma do aluno identificado
  // (ou o da 201 quando ninguém está identificado): o aluno nunca recebe
  // a lista da outra turma aqui.
  const { repository, currentStudent } = useGitSim();

  return <GitHubView repository={repository} turma={currentStudent?.turma ?? "201"} />;
}
