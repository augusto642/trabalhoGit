"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { Navbar } from "@/components/Navbar";
import { StudentIdentificationModal } from "@/components/StudentIdentificationModal";
import { TeacherLockButton } from "@/components/TeacherLock";

export const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentStudent,
    isIdModalOpen,
    openIdModal,
    closeIdModal,
    handleSaveStudent,
    signOutStudent,
    handleResetData,
  } = useGitSim();

  return (
    <>
      <Navbar
        currentStudent={currentStudent}
        onOpenIdentification={openIdModal}
        onSignOut={signOutStudent}
        onResetData={handleResetData}
      />
      <main className="flex-1">{children}</main>
      {/* Cadeado discreto do Painel do Professor — único acesso visível. */}
      <TeacherLockButton />
      <StudentIdentificationModal
        isOpen={isIdModalOpen}
        onSave={handleSaveStudent}
        currentStudent={currentStudent}
        onClose={currentStudent ? closeIdModal : undefined}
      />
    </>
  );
};
