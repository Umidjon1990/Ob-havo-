import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Book, Volume2 } from "lucide-react";
import { vocabulary } from "@/data/vocabulary";
import { motion } from "framer-motion";

interface VocabularyModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'uz';
}

export default function VocabularyModal({ isOpen, onClose, lang }: VocabularyModalProps) {
  const categories = [
    { id: 'all', label_ar: 'الْكُلّ', label_uz: 'Barchasi' },
    { id: 'condition', label_ar: 'الْحَالَة', label_uz: 'Holat' },
    { id: 'metric', label_ar: 'الْقِيَاسَات', label_uz: 'O\'lchovlar' },
    { id: 'general', label_ar: 'عَامّ', label_uz: 'Umumiy' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md h-[80vh] flex flex-col rounded-3xl bg-white/95 dark:bg-black/95 backdrop-blur-xl border-white/20 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 text-center border-b border-border/10">
          <DialogTitle className="text-2xl font-display font-bold flex items-center justify-center gap-2 text-primary">
            <Book className="w-6 h-6" />
            <span>{lang === 'ar' ? 'قَامُوس الطَّقْس' : 'Ob-havo Lug\'ati'}</span>
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {lang === 'ar' ? 'تَعَلَّم كَلِمَات جَدِيدَة' : 'Yangi so\'zlarni o\'rganing'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 mt-4">
            <TabsList className="w-full grid grid-cols-4 bg-muted/50 p-1 h-10">
              {categories.map(cat => (
                <TabsTrigger 
                  key={cat.id} 
                  value={cat.id}
                  className="text-[10px] sm:text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  {lang === 'ar' ? cat.label_ar : cat.label_uz}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden relative">
             <ScrollArea className="h-full w-full">
                <div className="p-6 pt-4">
                    <TabsContent value="all" className="mt-0 space-y-3">
                    {vocabulary.map((item, idx) => (
                        <VocabCard key={item.id} item={item} index={idx} />
                    ))}
                    </TabsContent>
                    
                    {['condition', 'metric', 'general'].map(catId => (
                    <TabsContent key={catId} value={catId} className="mt-0 space-y-3">
                        {vocabulary.filter(v => v.category === catId).map((item, idx) => (
                        <VocabCard key={item.id} item={item} index={idx} />
                        ))}
                    </TabsContent>
                    ))}
                </div>
            </ScrollArea>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function VocabCard({ item, index }: { item: any, index: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/50 border border-white/40 shadow-sm rounded-xl p-4 flex items-center justify-between group hover:bg-white/80 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.category === 'condition' ? 'bg-orange-100 text-orange-600' : item.category === 'metric' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
          {item.icon ? <item.icon className="w-5 h-5" /> : <Book className="w-5 h-5" />}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-lg font-bold font-display text-primary">{item.ar}</span>
          <span className="text-sm text-muted-foreground font-medium">{item.uz}</span>
        </div>
      </div>
      <button className="w-8 h-8 rounded-full bg-primary/5 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Volume2 className="w-4 h-4" />
      </button>
    </motion.div>
  )
}