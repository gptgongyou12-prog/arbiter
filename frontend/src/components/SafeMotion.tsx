// SafeMotion: renders motion.div normally, plain div in lite mode.
import { useLiteMode } from "@/contexts/LiteModeContext";
import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

type SafeDivProps = HTMLMotionProps<"div">;

export function SafeMotionDiv({ children, className, style, ...motionProps }: SafeDivProps) {
  const { isLite } = useLiteMode();

  if (isLite) {
    return (
      <div className={className} style={style as CSSProperties | undefined}>
        {children as ReactNode}
      </div>
    );
  }

  return (
    <motion.div className={className} style={style} {...motionProps}>
      {children}
    </motion.div>
  );
}
