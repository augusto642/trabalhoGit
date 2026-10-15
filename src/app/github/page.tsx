"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { GitHubView } from "@/components/github/GitHubView";

export default function GitHubPage() {
  const { repository } = useGitSim();

  return <GitHubView repository={repository} />;
}
