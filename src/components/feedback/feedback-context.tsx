"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FeedbackContextValue = {
  isOpen: boolean;
  section: string;
  open: (section?: string) => void;
  close: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    // Return a no-op context when feedback is disabled — lets FeedbackZone
    // and FeedbackButton render without throwing.
    return {
      isOpen: false,
      section: "general",
      open: () => undefined,
      close: () => undefined,
    };
  }
  return ctx;
}

export function FeedbackContextProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState("general");

  function open(nextSection?: string) {
    setSection(nextSection ?? "general");
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <FeedbackContext.Provider value={{ isOpen, section, open, close }}>
      {children}
    </FeedbackContext.Provider>
  );
}
