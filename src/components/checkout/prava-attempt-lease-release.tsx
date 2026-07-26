"use client";

import { useEffect } from "react";

import { releasePravaBrowserAttempt } from "@/lib/checkout/prava-browser-lease";

type PravaAttemptLeaseReleaseProps = Readonly<{
  attemptId: string;
}>;

export function PravaAttemptLeaseRelease({
  attemptId,
}: PravaAttemptLeaseReleaseProps) {
  useEffect(() => {
    releasePravaBrowserAttempt(attemptId);
  }, [attemptId]);

  return null;
}
