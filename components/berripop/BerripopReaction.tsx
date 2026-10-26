import BerripopMascot, { type BerripopMood, type BerripopMotion } from "./BerripopMascot";
import BerripopSpeechBubble from "./BerripopSpeechBubble";

type Props = {
  mood: BerripopMood;
  message: string;
  size?: number;
  motion?: BerripopMotion;
  layout?: "row" | "stack";
  className?: string;
};

/** Berripop plus a speech bubble: a small, state-driven reaction. */
export default function BerripopReaction({ mood, message, size = 64, motion = "subtle", layout = "row", className = "" }: Props) {
  return (
    <div className={`bp-reaction bp-reaction--${layout} ${className}`}>
      <BerripopMascot mood={mood} size={size} motion={motion} />
      <BerripopSpeechBubble tail={layout === "row" ? "left" : "top"}>{message}</BerripopSpeechBubble>
    </div>
  );
}
