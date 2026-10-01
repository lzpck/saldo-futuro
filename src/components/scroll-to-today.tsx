"use client";

import { useEffect } from "react";

/** Rola a lista até o dia de hoje quando a página abre. */
export function ScrollToToday({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}
