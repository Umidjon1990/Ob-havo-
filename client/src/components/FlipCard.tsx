import { ReactNode, useState } from "react";
import { motion } from "framer-motion";

interface FlipCardProps {
  frontContent: ReactNode;
  backContent: ReactNode;
}

export default function FlipCard({ frontContent, backContent }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="w-full h-64 perspective-1000 cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <motion.div
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        className="w-full h-full relative transform-style-3d"
      >
        {/* Front Side */}
        <div className="absolute inset-0 w-full h-full glass-card rounded-2xl overflow-hidden backface-hidden border-2 border-primary/20 shadow-xl">
           {frontContent}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />
        </div>

        {/* Back Side */}
        <div className="absolute inset-0 w-full h-full glass-panel rounded-2xl overflow-hidden backface-hidden rotate-y-180 bg-white/90 dark:bg-black/80 border-2 border-primary">
           {backContent}
        </div>
      </motion.div>
    </div>
  );
}
