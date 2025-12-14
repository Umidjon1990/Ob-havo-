import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Cloud, Sun, Wind, Droplets, Thermometer, Calendar } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  region: any;
}

export default function WeatherModal({ isOpen, onClose, region }: WeatherModalProps) {
  if (!region) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xs sm:max-w-md rounded-3xl bg-white/90 dark:bg-black/90 backdrop-blur-xl border-white/20">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-display font-bold flex flex-col items-center gap-2">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm uppercase tracking-widest">
              {region.name}
            </span>
            <span>{region.temp}°</span>
          </DialogTitle>
          <DialogDescription className="text-center text-lg font-medium text-muted-foreground">
            {region.condition}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-4" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Wind className="w-6 h-6 text-blue-500" />
            <span className="text-xs text-muted-foreground">الرياح</span>
            <span className="font-bold">12 كم/س</span>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Droplets className="w-6 h-6 text-cyan-500" />
            <span className="text-xs text-muted-foreground">الرطوبة</span>
            <span className="font-bold">45%</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Thermometer className="w-6 h-6 text-orange-500" />
            <span className="text-xs text-muted-foreground">الضغط</span>
            <span className="font-bold">760 ملم</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Calendar className="w-6 h-6 text-purple-500" />
            <span className="text-xs text-muted-foreground">اليوم</span>
            <span className="font-bold">الثلاثاء</span>
          </motion.div>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-2xl text-center">
            <p className="text-sm text-muted-foreground italic" dir="rtl">
                "طقس رائع للمشي اليوم!"
            </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
