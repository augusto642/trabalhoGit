"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { ProfessorView } from "@/components/professor/ProfessorView";

export default function ProfessorPage() {
  const {
    students,
    logs,
    repository,
    handleResetData,
    updateRepository,
  } = useGitSim();

  return (
    <ProfessorView
      students={students}
      logs={logs}
      repository={repository}
      onResetClass={handleResetData}
      onUpdateRepo={updateRepository}
    />
  );
}
