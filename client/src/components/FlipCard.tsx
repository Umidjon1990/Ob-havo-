import { useState } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";

interface FlipCardProps {
  arabicWord: string;
  uzbekWord: string;
  context: string;
  pronunciation: string;
}

export default function FlipCard({ arabicWord, uzbekWord, context, pronunciation }: FlipCardProps) {
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
        <div className="absolute inset-0 w-full h-full glass-card rounded-2xl p-6 flex flex-col items-center justify-center backface-hidden border-2 border-primary/20 shadow-xl">
          <div className="absolute top-4 left-4 text-xs font-medium text-primary uppercase tracking-widest opacity-70">
            Kun So'zi
          </div>
          <Info className="absolute top-4 right-4 w-5 h-5 text-primary/50" />
          
          <h2 className="text-6xl font-arabic text-primary mb-4 drop-shadow-sm">{arabicWord}</h2>
          <p className="text-muted-foreground text-sm font-medium tracking-wide">Bosing va aylantiring</p>
          
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />
        </div>

        {/* Back Side */}
        <div className="absolute inset-0 w-full h-full glass-panel rounded-2xl p-6 flex flex-col items-center justify-center backface-hidden rotate-y-180 bg-white/90 dark:bg-black/80 border-2 border-primary">
          <h3 className="text-2xl font-bold text-foreground mb-1">{uzbekWord}</h3>
          <p className="text-primary font-medium italic mb-4">"{pronunciation}"</p>
          
          <div className="w-12 h-1 bg-primary/30 rounded-full mb-4" />
          
          <p className="text-center text-muted-foreground text-sm leading-relaxed">
            {context}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
