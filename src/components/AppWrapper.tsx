"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { Navbar } from "@/components/Navbar";
import { StudentIdentificationModal } from "@/components/StudentIdentificationModal";

export const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentStudent,
    isIdModalOpen,
    openIdModal,
    closeIdModal,
    handleSaveStudent,
    handleResetData,
  } = useGitSim();

  return (
    <>
      <Navbar
        currentStudent={currentStudent}
        onOpenIdentification={openIdModal}
        onResetData={handleResetData}
      />
      <main className="flex-1">{children}</main>
      <StudentIdentificationModal
        isOpen={isIdModalOpen}
        onSave={handleSaveStudent}
        currentStudent={currentStudent}
        onClose={currentStudent ? closeIdModal : undefined}
      />
    </>
  );
};
