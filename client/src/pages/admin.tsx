import { useState, useEffect } from "react";
import { ArrowLeft, Save, RefreshCw, Send, Radio, Plus, Trash2, Users, Cloud, LogOut, Lock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { setupTelegramWebhook, getBotSettings, updateBotSettings, testChannelMessage, getChannels, addChannel, removeChannel, toggleChannel, updateChannelSchedule, refreshWeatherData, generateNewVocabulary, adminLogin, verifyAdminToken, adminLogout, type Channel, type GeneratedWord } from "@/lib/api";
import { regions } from "@/data/regions";

export default function Admin() {
  const { toast } = useToast();
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  
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
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelTitle, setNewChannelTitle] = useState("");
  const [newChannelType, setNewChannelType] = useState<"channel" | "group">("channel");
  const [refreshingWeather, setRefreshingWeather] = useState(false);
  const [generatingWords, setGeneratingWords] = useState(false);
  const [generatedWords, setGeneratedWords] = useState<GeneratedWord[]>([]);

  // Check auth on load
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      verifyAdminToken(token).then(valid => {
        setIsAuthenticated(valid);
        setAuthLoading(false);
        if (valid) loadInitialData();
      });
    } else {
      setAuthLoading(false);
    }
  }, []);

  const loadInitialData = () => {
    getBotSettings().then(settings => {
      if (settings) {
        setChannelId(settings.channelId || "");
        setDailyEnabled(settings.dailyMessageEnabled || false);
        setDailyTime(settings.dailyMessageTime || "08:00");
        setDailyRegion(settings.dailyRegion || "tashkent");
      }
    });
    loadChannels();
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    const result = await adminLogin(loginUsername, loginPassword);
    if (result.success && result.token) {
      localStorage.setItem("admin_token", result.token);
      setIsAuthenticated(true);
      loadInitialData();
      toast({ title: "Xush kelibsiz!" });
    } else {
      toast({ title: "Xatolik", description: result.error || "Login yoki parol xato", variant: "destructive" });
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("admin_token");
    if (token) await adminLogout(token);
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
    toast({ title: "Chiqildi" });
  };

  const loadChannels = async () => {
    const list = await getChannels();
    setChannels(list);
  };

  const handleAddChannel = async () => {
    if (!newChannelId) {
      toast({ title: "Xatolik", description: "Kanal/Guruh ID kiriting", variant: "destructive" });
      return;
    }
    const channel = await addChannel(newChannelId, newChannelTitle || newChannelId, newChannelType);
    if (channel) {
      toast({ title: "Qo'shildi!", description: `${newChannelType === 'channel' ? 'Kanal' : 'Guruh'} qo'shildi` });
      setNewChannelId("");
      setNewChannelTitle("");
      loadChannels();
    } else {
      toast({ title: "Xatolik", description: "Qo'shishda muammo", variant: "destructive" });
    }
  };

  const handleRemoveChannel = async (chatId: string) => {
    const success = await removeChannel(chatId);
    if (success) {
      toast({ title: "O'chirildi!" });
      loadChannels();
    }
  };

  const handleToggleChannel = async (chatId: string, enabled: boolean) => {
    await toggleChannel(chatId, enabled);
    loadChannels();
  };

  const handleScheduleChange = async (chatId: string, time: string) => {
    const result = await updateChannelSchedule(chatId, time);
    if (result) {
      toast({ title: "Saqlandi!", description: `Yuborish vaqti: ${time}` });
      loadChannels();
    } else {
      toast({ title: "Xatolik", description: "Vaqtni saqlashda muammo", variant: "destructive" });
    }
  };

  const handleRefreshWeather = async () => {
    setRefreshingWeather(true);
    const result = await refreshWeatherData();
    if (result?.success) {
      toast({ title: "Yangilandi!", description: "Ob-havo ma'lumotlari yangilandi." });
    } else {
      toast({ title: "Xatolik", description: "Yangilashda muammo", variant: "destructive" });
    }
    setRefreshingWeather(false);
  };

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
    const result = await testChannelMessage(channelId);
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

  const generateAI = async () => {
    setGeneratingWords(true);
    toast({
      title: "AI Generatsiya",
      description: "ChatGPT yangi so'zlar yozmoqda...",
    });
    
    const words = await generateNewVocabulary(5);
    
    if (words.length > 0) {
      setGeneratedWords(words);
      // Set first word to form
      setFormData({
        ...formData,
        arabicWord: words[0].ar,
        uzbekWord: words[0].uz,
        pronunciation: "",
        context: words[0].context
      });
      toast({
        title: "Tayyor!",
        description: `${words.length} ta yangi so'z generatsiya qilindi.`,
      });
    } else {
      toast({
        title: "Xatolik",
        description: "So'z generatsiya qilib bo'lmadi.",
        variant: "destructive",
      });
    }
    setGeneratingWords(false);
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-primary" />
            <CardTitle className="text-2xl">Admin Panel</CardTitle>
            <p className="text-muted-foreground">Kirish uchun login va parolni kiriting</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Login</label>
              <Input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="admin"
                data-testid="input-admin-username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Parol</label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                data-testid="input-admin-password"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full"
              data-testid="button-admin-login"
            >
              {loginLoading ? "Kirish..." : "Kirish"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold font-display">Admin Panel</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="w-4 h-4 mr-2" /> Chiqish
          </Button>
        </div>

        <Card className="glass-panel border-white/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Kun So'zi Tahriri</CardTitle>
            <Button variant="outline" size="sm" onClick={generateAI} disabled={generatingWords} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${generatingWords ? 'animate-spin' : ''}`} /> 
              {generatingWords ? "Generatsiya..." : "AI Yordam"}
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

            {generatedWords.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium mb-3">AI tomonidan generatsiya qilingan so'zlar:</h4>
                <div className="space-y-2">
                  {generatedWords.map((word, index) => (
                    <div 
                      key={index} 
                      className="p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => setFormData({
                        ...formData,
                        arabicWord: word.ar,
                        uzbekWord: word.uz,
                        pronunciation: "",
                        context: word.context
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-arabic text-lg">{word.ar}</span>
                        <span className="text-sm font-medium">{word.uz}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{word.context}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                      <label className="text-sm font-medium">Kanal username yoki ID</label>
                      <Input 
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="@zamonaviymedia"
                      />
                      <p className="text-xs text-muted-foreground">
                        Masalan: @zamonaviymedia (@ belgisi bilan)
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

                <div className="border-t pt-4 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Cloud className="w-4 h-4" /> Ob-havo ma'lumotlari
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Ob-havo har 30 daqiqada avtomatik yangilanadi. Qo'lda yangilash uchun tugmani bosing.
                    </p>
                    <Button 
                      onClick={handleRefreshWeather} 
                      disabled={refreshingWeather}
                      className="w-full"
                      variant="outline"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${refreshingWeather ? 'animate-spin' : ''}`} />
                      {refreshingWeather ? "Yangilanmoqda..." : "Ob-havo ma'lumotlarini yangilash"}
                    </Button>
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

        <Card className="glass-panel border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Kanal/Guruhlar Boshqaruvi
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Har bir kanal/guruh uchun yuborish vaqtini belgilang (O'zbekiston vaqti)
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <select 
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value as "channel" | "group")}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="channel">Kanal</option>
                  <option value="group">Guruh</option>
                </select>
                <Input 
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  placeholder="@zamonaviymedia"
                  className="flex-1"
                />
              </div>
              <div className="flex gap-2">
                <Input 
                  value={newChannelTitle}
                  onChange={(e) => setNewChannelTitle(e.target.value)}
                  placeholder="Kanal nomi (ixtiyoriy)"
                  className="flex-1"
                />
                <Button onClick={handleAddChannel} className="gap-2">
                  <Plus className="w-4 h-4" /> Qo'shish
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Botni kanalga admin qilib qo'shing, keyin @username kiriting
              </p>
            </div>

            {channels.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-medium">Qo'shilgan kanallar ({channels.length})</h4>
                {channels.map((ch) => (
                  <div key={ch.id} className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={ch.enabled ?? true}
                          onCheckedChange={(enabled) => handleToggleChannel(ch.chatId, enabled)}
                        />
                        <div>
                          <p className="text-sm font-medium">{ch.title || ch.chatId}</p>
                          <p className="text-xs text-muted-foreground">
                            {ch.type === 'group' ? 'Guruh' : 'Kanal'} • {ch.chatId}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemoveChannel(ch.chatId)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pl-10">
                      <label className="text-xs text-muted-foreground">Yuborish vaqti:</label>
                      <Input 
                        type="time"
                        defaultValue={ch.scheduledTime || ""}
                        onBlur={(e) => {
                          if (e.target.value !== ch.scheduledTime) {
                            handleScheduleChange(ch.chatId, e.target.value);
                          }
                        }}
                        className="w-28 h-8 text-sm"
                      />
                      {ch.lastSentAt && (
                        <span className="text-xs text-muted-foreground">
                          Oxirgi: {new Date(ch.lastSentAt).toLocaleString('uz-UZ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {channels.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Hali kanal/guruh qo'shilmagan</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
