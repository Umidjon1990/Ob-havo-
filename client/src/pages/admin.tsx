import { useState, useEffect } from "react";
import { ArrowLeft, Save, RefreshCw, Send, Radio } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { setupTelegramWebhook, getBotSettings, updateBotSettings, testChannelMessage } from "@/lib/api";
import { regions } from "@/data/regions";

export default function Admin() {
  const { toast } = useToast();
  const [webhookStatus, setWebhookStatus] = useState<string>("");
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [formData, setFormData] = useState({
    arabicWord: "سَلَام",
    uzbekWord: "Salom",
    pronunciation: "Salaam",
    context: "Tinchlik va omonlik. Salomlashish odobi - insoniylikning go'zal belgisidir.",
    dailyMessage: "Xayrli tong! Bugungi kuningiz samarali o'tsin."
  });

  const [channelId, setChannelId] = useState("");
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [dailyTime, setDailyTime] = useState("08:00");
  const [dailyRegion, setDailyRegion] = useState("tashkent");
  const [testingChannel, setTestingChannel] = useState(false);

  useEffect(() => {
    getBotSettings().then(settings => {
      if (settings) {
        setChannelId(settings.channelId || "");
        setDailyEnabled(settings.dailyMessageEnabled || false);
        setDailyTime(settings.dailyMessageTime || "08:00");
        setDailyRegion(settings.dailyRegion || "tashkent");
      }
    });
  }, []);

  const handleSetupWebhook = async () => {
    setLoadingWebhook(true);
    setWebhookStatus("Sozlanmoqda...");
    
    const result = await setupTelegramWebhook();
    
    if (result?.ok) {
      setWebhookStatus("✅ Webhook muvaffaqiyatli sozlandi! Bot tayyor.");
      toast({
        title: "Muvaffaqiyat!",
        description: "Telegram bot ulanmoqda.",
      });
    } else {
      setWebhookStatus("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
      toast({
        title: "Xatolik",
        description: "Webhook sozlashda muammo.",
        variant: "destructive",
      });
    }
    setLoadingWebhook(false);
  };

  const handleSaveChannelSettings = async () => {
    await updateBotSettings({
      channelId,
      dailyMessageEnabled: dailyEnabled,
      dailyMessageTime: dailyTime,
      dailyRegion,
    });
    toast({
      title: "Saqlandi!",
      description: "Kanal sozlamalari saqlandi.",
    });
  };

  const handleTestChannel = async () => {
    if (!channelId) {
      toast({ title: "Xatolik", description: "Kanal ID kiriting", variant: "destructive" });
      return;
    }
    setTestingChannel(true);
    const result = await testChannelMessage(channelId, dailyRegion);
    if (result?.ok) {
      toast({ title: "Yuborildi!", description: "Kanalga test xabar yuborildi." });
    } else {
      toast({ title: "Xatolik", description: "Xabar yuborishda muammo. Botni kanalga admin qilib qo'shing.", variant: "destructive" });
    }
    setTestingChannel(false);
  };

  const handleSave = () => {
    toast({
      title: "Muvaffaqiyatli saqlandi",
      description: "Bugungi kun so'zi yangilandi.",
    });
  };

  const generateAI = () => {
    toast({
      title: "AI Generatsiya",
      description: "ChatGPT yangi so'z yozmoqda...",
    });
    // Mock AI delay
    setTimeout(() => {
        setFormData({
            ...formData,
            arabicWord: "حَيَاة",
            uzbekWord: "Hayot",
            pronunciation: "Hayaat",
            context: "Hayot - bu eng katta ne'mat. Har bir lahzani qadrlash kerak."
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
            <CardTitle>Kun So'zi Tahriri</CardTitle>
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
              <label className="text-sm font-medium">Ma'nosi va Izoh</label>
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
                <CardTitle>Telegram Bot Sozlamalari</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Webhook sozlash</label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Telegram botni ishga tushirish uchun webhook ni sozlang.
                    </p>
                    <Button 
                      onClick={handleSetupWebhook} 
                      disabled={loadingWebhook}
                      className="w-full"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {loadingWebhook ? "Sozlanmoqda..." : "Telegram Webhook ni sozlash"}
                    </Button>
                    
                    {webhookStatus && (
                      <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                        {webhookStatus}
                      </div>
                    )}
                </div>
                
                <div className="border-t pt-4 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Radio className="w-4 h-4" /> Kanal sozlamalari (Avto-xabar)
                    </h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Kanal ID</label>
                      <Input 
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="-1001234567890 yoki @kanalusername"
                      />
                      <p className="text-xs text-muted-foreground">
                        Botni kanalga admin qilib qo'shing, keyin kanal ID sini kiriting
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium">Kunlik avto-xabar</label>
                        <p className="text-xs text-muted-foreground">Har kuni ob-havo xabarini yuborish</p>
                      </div>
                      <Switch checked={dailyEnabled} onCheckedChange={setDailyEnabled} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Vaqt</label>
                        <Input 
                          type="time"
                          value={dailyTime}
                          onChange={(e) => setDailyTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Hudud</label>
                        <select 
                          value={dailyRegion}
                          onChange={(e) => setDailyRegion(e.target.value)}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {regions.map(r => (
                            <option key={r.id} value={r.id}>{r.name_uz}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSaveChannelSettings} className="flex-1">
                        <Save className="w-4 h-4 mr-2" /> Saqlash
                      </Button>
                      <Button onClick={handleTestChannel} variant="outline" disabled={testingChannel}>
                        {testingChannel ? "..." : "Test"}
                      </Button>
                    </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                    <label className="text-sm font-medium">Bot buyruqlari</label>
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <div><code className="bg-muted px-2 py-1 rounded">/start</code> - Botni ishga tushirish</div>
                        <div><code className="bg-muted px-2 py-1 rounded">/weather</code> - Joriy ob-havo</div>
                        <div><code className="bg-muted px-2 py-1 rounded">/lang</code> - Tilni o'zgartirish</div>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs text-green-800 flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          ChatGPT ulangan (Replit AI Integrations)
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
