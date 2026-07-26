"use client";

import { useEffect } from "react";

import {
  writeSanitizedOrderHistory,
  type SanitizedOrderHistoryEntry,
} from "@/lib/checkout/history";

export function OrderHistoryRecorder({
  entry,
}: {
  entry: SanitizedOrderHistoryEntry;
}) {
  useEffect(() => {
    writeSanitizedOrderHistory(window.localStorage, entry);
  }, [entry]);

  return null;
}
