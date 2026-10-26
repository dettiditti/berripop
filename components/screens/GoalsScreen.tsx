"use client";

import type { AssessmentState } from "@/lib/assessment/types";
import type { AccountDTO } from "@/lib/domain/types";
import type { JournalState } from "@/lib/journal/types";
import { useI18n } from "@/lib/i18n/client";
import PathCard from "../assessment/PathCard";
import FirstSteps from "../FirstSteps";
import GoalsCard from "../GoalsCard";
import type { Run } from "./types";

/** My goals: the path from the assessment, first steps and the member's own goals. Private, with or without a circle. */
export default function GoalsScreen({ account, assessment, onAssessment, onResume, journal, run, notify, onWrite, onFeedback, onTogether }: {
  account: AccountDTO;
  assessment: AssessmentState | null;
  onAssessment: (s: AssessmentState) => void;
  onResume: () => void;
  journal: JournalState | null;
  run: Run;
  notify: (m: string) => void;
  onWrite: (prompt: string) => void;
  onFeedback: (entryId: string) => void;
  onTogether: () => void;
}) {
  const { d } = useI18n();
  const p = d.personal;
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">{p.goalsEyebrow}</span>
          <h1>{d.navigation.goals}</h1>
          <p>{p.goalsIntro}</p>
        </div>
      </header>
      {assessment && <PathCard state={assessment} account={account} onState={onAssessment} onResume={onResume} notify={notify} />}
      <FirstSteps account={account} journal={journal} run={run} notify={notify} onWrite={onWrite} onFeedback={onFeedback} onTogether={onTogether} />
      <GoalsCard account={account} run={run} notify={notify} />
    </div>
  );
}
