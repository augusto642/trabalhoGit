"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { ProfessorView } from "@/components/professor/ProfessorView";
import { TeacherLockGate } from "@/components/TeacherLock";

export default function ProfessorPage() {
  const {
    students,
    logs,
    repositories,
    legacyLines,
    handleResetData,
    updateRepository,
  } = useGitSim();

  return (
    <TeacherLockGate>
      <ProfessorView
        students={students}
        logs={logs}
        repositories={repositories}
        legacyLines={legacyLines}
        onResetClass={handleResetData}
        onUpdateRepo={updateRepository}
      />
    </TeacherLockGate>
  );
}
