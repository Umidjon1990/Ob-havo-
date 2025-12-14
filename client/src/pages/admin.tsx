import { useState } from "react";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    arabicWord: "شُكْر",
    uzbekWord: "Shukr",
    pronunciation: "Shukr",
    context: "Ne'matlarga minnatdor bo'lish. Alloh taolo aytadi: «Agar shukr qilsangiz, albatta, (ne'matimni) ziyoda qilurman» (Ibrohim surasi, 7-oyat).",
    dailyMessage: "Xayrli tong! Bugungi kuningiz barokatli bo'lsin."
  });

  const handleSave = () => {
    toast({
      title: "Muvaffaqiyatli saqlandi",
      description: "Bugungi kun hikmati yangilandi.",
    });
  };

  const generateAI = () => {
    toast({
      title: "AI Generatsiya",
      description: "ChatGPT yangi hikmat yozmoqda...",
    });
    // Mock AI delay
    setTimeout(() => {
        setFormData({
            ...formData,
            arabicWord: "صَبْر",
            uzbekWord: "Sabr",
            pronunciation: "Sabr",
            context: "Sabr – qiyinchiliklarga chidash va Allohdan mukofot kutishdir. «Albatta, Alloh sabrliylar bilandir» (Baqara surasi, 153-oyat)."
        })
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full bg-background p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold font-display">Admin Panel</h1>
        </div>

        <Card className="glass-panel border-white/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Kun Hikmati Tahriri</CardTitle>
            <Button variant="outline" size="sm" onClick={generateAI} className="gap-2">
              <RefreshCw className="w-4 h-4" /> AI Yordam
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Arabcha So'z</label>
                <Input 
                  value={formData.arabicWord}
                  onChange={(e) => setFormData({...formData, arabicWord: e.target.value})}
                  className="font-arabic text-right text-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">O'zbekcha Tarjima</label>
                <Input 
                  value={formData.uzbekWord}
                  onChange={(e) => setFormData({...formData, uzbekWord: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Talaffuz</label>
              <Input 
                value={formData.pronunciation}
                onChange={(e) => setFormData({...formData, pronunciation: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Kontekst va Iqtibos</label>
              <Textarea 
                value={formData.context}
                onChange={(e) => setFormData({...formData, context: e.target.value})}
                className="min-h-[100px]"
              />
            </div>

            <Button onClick={handleSave} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-4">
              <Save className="w-4 h-4 mr-2" /> Saqlash va E'lon qilish
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/20">
            <CardHeader>
                <CardTitle>Xabar Sozlamalari</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Kunlik Xabar Matni</label>
                    <Input 
                        value={formData.dailyMessage}
                        onChange={(e) => setFormData({...formData, dailyMessage: e.target.value})}
                    />
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
