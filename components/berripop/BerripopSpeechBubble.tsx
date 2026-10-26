import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Which side the tail points to (towards Berripop). */
  tail?: "left" | "bottom" | "top";
  className?: string;
};

export default function BerripopSpeechBubble({ children, tail = "left", className = "" }: Props) {
  return (
    <p className={`bp-bubble bp-bubble--${tail} ${className}`} aria-live="polite">
      {children}
    </p>
  );
}
