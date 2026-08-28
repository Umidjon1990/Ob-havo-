import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, Download, FileText, Headphones, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { getLearningTests, type LearningTest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FilterType = "all" | "listening" | "reading";
type FilterLevel = "all" | "A1A2" | "B1B2";

const typeLabel: Record<FilterType, string> = {
  all: "Barcha testlar",
  listening: "Tinglash",
  reading: "O‘qish",
};

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+05:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export default function Tests() {
  const [tests, setTests] = useState<LearningTest[]>([]);
  const [type, setType] = useState<FilterType>("all");
  const [level, setLevel] = useState<FilterLevel>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getLearningTests({
      contentType: type === "all" ? undefined : type,
      level: level === "all" ? undefined : level,
    }).then((items) => {
      if (!cancelled) setTests(items);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [type, level]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-6 sm:px-8" dir="ltr">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-blue-600">Arab tili o‘quv arxivi</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Testlar</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Telegram kanallariga yuborilgan o‘qish va tinglash testlarini sana bo‘yicha ko‘ring va DOCX shaklida yuklab oling.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" /> Bosh sahifa
            </Button>
          </Link>
        </header>

        <Card className="mb-6 border-slate-200/80 bg-white/80 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", "listening", "reading"] as FilterType[]).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={type === option ? "default" : "outline"}
                  onClick={() => setType(option)}
                >
                  {option === "listening" && <Headphones className="mr-1.5 h-4 w-4" />}
                  {option === "reading" && <BookOpen className="mr-1.5 h-4 w-4" />}
                  {typeLabel[option]}
                </Button>
              ))}
            </div>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as FilterLevel)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Daraja bo‘yicha filter"
            >
              <option value="all">Barcha darajalar</option>
              <option value="A1A2">A1/A2</option>
              <option value="B1B2">B1/B2</option>
            </select>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 py-16 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Testlar yuklanmoqda...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
            Testlar ro‘yxatini yuklashda xatolik yuz berdi. Sahifani qayta yuklang.
          </div>
        )}

        {!loading && !error && tests.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800">Hozircha testlar yo‘q</h2>
            <p className="mt-2 text-sm text-slate-500">Yangi test Telegram’ga muvaffaqiyatli yuborilgach, shu bo‘limda ko‘rinadi.</p>
          </div>
        )}

        {!loading && !error && tests.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {tests.map((test) => {
              const isListening = test.contentType === "listening";
              return (
                <Card key={test.id} className="border-slate-200/80 bg-white/90 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                        {isListening ? <Headphones className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                        {isListening ? "Tinglash testi" : "O‘qib tushunish testi"}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${test.level === "A1A2" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                        {test.level === "A1A2" ? "A1/A2" : "B1/B2"}
                      </span>
                    </div>
                    <CardTitle className="text-xl leading-8" dir="rtl">{test.titleAr}</CardTitle>
                    <p className="text-sm text-slate-600">{test.titleUz}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(test.testDate)}</span>
                    </div>
                    <a
                      href={`/api/tests/${encodeURIComponent(test.id)}/docx`}
                      className="inline-flex h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                      download
                    >
                      <Download className="mr-2 h-4 w-4" /> DOCX yuklab olish
                    </a>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}