import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  Download,
  FileAudio,
  FileText,
  Files,
  Headphones,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { exportLearningTests, getLearningTests, type LearningTest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FilterType = "all" | "listening" | "reading";
type FilterLevel = "all" | "A1A2" | "B1B2";
type ExportFormat = "docx" | "pdf";

const typeLabel: Record<FilterType, string> = {
  all: "Barchasi",
  listening: "Tinglash",
  reading: "O‘qish",
};

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+05:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Tests() {
  const [tests, setTests] = useState<LearningTest[]>([]);
  const [type, setType] = useState<FilterType>("all");
  const [level, setLevel] = useState<FilterLevel>("all");
  const [searchInput, setSearchInput] = useState("");
  const [topic, setTopic] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getLearningTests({
      contentType: type === "all" ? undefined : type,
      level: level === "all" ? undefined : level,
      topic: topic || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }).then((items) => {
      if (!cancelled) {
        setTests(items);
        setSelected(new Set());
      }
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [type, level, topic, dateFrom, dateTo]);

  const listeningCount = useMemo(
    () => tests.filter(test => test.contentType === "listening").length,
    [tests],
  );
  const allSelected = tests.length > 0 && tests.every(test => selected.has(test.id));

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setTopic(searchInput.trim());
  }

  function clearFilters() {
    setType("all");
    setLevel("all");
    setSearchInput("");
    setTopic("");
    setDateFrom("");
    setDateTo("");
  }

  function toggleTest(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tests.map(test => test.id)));
  }

  async function exportSelected(format: ExportFormat) {
    if (selected.size === 0 || exporting) return;
    setExporting(format);
    setDownloadError(false);
    try {
      const blob = await exportLearningTests(Array.from(selected), format);
      downloadBlob(blob, `arab-tili-testlari-${selected.size}-ta.${format}`);
    } catch {
      setDownloadError(true);
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eff6ff_0,_#f8fafc_38%,_#ffffff_78%)] px-4 py-6 sm:px-8" dir="ltr">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Files className="h-3.5 w-3.5" /> Arab tili o‘quv arxivi
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Testlar</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Yaratilgan o‘qish va tinglash testlarini mavzu yoki sana bo‘yicha toping. Audio, PDF va DOCX fayllarini alohida yoki tanlanganlarini bitta faylda yuklab oling.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin">
                <Button className="shrink-0 gap-2 bg-blue-700 hover:bg-blue-800">
                  <ShieldCheck className="h-4 w-4" /> Admin panel
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="shrink-0 gap-2 bg-white">
                  <ArrowLeft className="h-4 w-4" /> Bosh sahifa
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5">
            <div><p className="text-2xl font-bold text-slate-900">{tests.length}</p><p className="text-xs text-slate-500">Topilgan test</p></div>
            <div><p className="text-2xl font-bold text-violet-700">{listeningCount}</p><p className="text-xs text-slate-500">Tinglash</p></div>
            <div><p className="text-2xl font-bold text-emerald-700">{tests.length - listeningCount}</p><p className="text-xs text-slate-500">O‘qish</p></div>
          </div>
        </header>

        <Card className="mb-6 border-slate-200/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {(["all", "listening", "reading"] as FilterType[]).map(option => (
                <Button
                  key={option}
                  size="sm"
                  variant={type === option ? "default" : "outline"}
                  className={type === option ? "bg-blue-700 hover:bg-blue-800" : "bg-white"}
                  onClick={() => setType(option)}
                >
                  {option === "listening" && <Headphones className="mr-1.5 h-4 w-4" />}
                  {option === "reading" && <BookOpen className="mr-1.5 h-4 w-4" />}
                  {typeLabel[option]}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_150px_150px_auto]">
              <form onSubmit={submitSearch} className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <Search className="ml-3 mt-2.5 h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={event => setSearchInput(event.target.value)}
                  className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                  placeholder="Mavzu bo‘yicha izlash..."
                  aria-label="Mavzu bo‘yicha izlash"
                />
                <button type="submit" className="border-l border-slate-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50">Izlash</button>
              </form>

              <select
                value={level}
                onChange={event => setLevel(event.target.value as FilterLevel)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                aria-label="Daraja bo‘yicha filter"
              >
                <option value="all">Barcha darajalar</option>
                <option value="A1A2">A1/A2</option>
                <option value="B1B2">B1/B2</option>
              </select>

              <label className="relative">
                <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-medium text-slate-500">Boshlanish sana</span>
                <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="relative">
                <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-medium text-slate-500">Tugash sana</span>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </label>
              <Button variant="ghost" className="gap-1.5 text-slate-500" onClick={clearFilters}>
                <X className="h-4 w-4" /> Tozalash
              </Button>
            </div>
          </CardContent>
        </Card>

        {!loading && !error && tests.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button onClick={toggleAll} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700">
              <span className={`grid h-5 w-5 place-items-center rounded border ${allSelected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white"}`}>
                {allSelected && <Check className="h-3.5 w-3.5" />}
              </span>
              {allSelected ? "Barchasini bekor qilish" : "Ko‘rinayotgan barchasini tanlash"}
            </button>
            <span className="text-xs text-slate-500">Ko‘pi bilan 30 ta testni birlashtirish mumkin</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 py-20 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Testlar yuklanmoqda...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
            Testlar ro‘yxatini yuklashda xatolik yuz berdi. Sahifani qayta yuklang.
          </div>
        )}

        {!loading && !error && tests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800">Mos test topilmadi</h2>
            <p className="mt-2 text-sm text-slate-500">Filtrlarni tozalang yoki yangi test yaratilishini kuting.</p>
          </div>
        )}

        {!loading && !error && tests.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {tests.map(test => {
              const isListening = test.contentType === "listening";
              const isSelected = selected.has(test.id);
              return (
                <Card key={test.id} className={`relative overflow-hidden bg-white/95 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${isSelected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200/90"}`}>
                  <button
                    type="button"
                    onClick={() => toggleTest(test.id)}
                    className={`absolute right-4 top-4 z-10 grid h-6 w-6 place-items-center rounded-md border transition-colors ${isSelected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-transparent hover:border-blue-400"}`}
                    aria-label={isSelected ? "Tanlovdan chiqarish" : "Testni tanlash"}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <div className={`h-1 ${isListening ? "bg-violet-500" : "bg-emerald-500"}`} />
                  <CardHeader className="pb-3 pr-14">
                    <div className={`mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${isListening ? "text-violet-700" : "text-emerald-700"}`}>
                      {isListening ? <Headphones className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                      {isListening ? "Tinglash testi" : "O‘qib tushunish testi"}
                    </div>
                    <CardTitle className="text-right text-[26px] leading-[1.55] text-slate-950" dir="rtl" style={{ fontFamily: '"Traditional Arabic", "Noto Naskh Arabic", serif' }}>
                      {test.titleAr}
                    </CardTitle>
                    <p className="text-sm font-medium text-slate-600">{test.titleUz}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(test.testDate)}</span>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${test.level === "A1A2" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                        {test.level === "A1A2" ? "A1/A2" : "B1/B2"}
                      </span>
                      {test.channelTitle && <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{test.channelTitle}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href={isListening ? `/api/tests/${encodeURIComponent(test.id)}/audio` : undefined}
                        aria-disabled={!isListening}
                        title={isListening && !test.hasAudio ? "Audio birinchi yuklashda avtomatik yaratiladi" : undefined}
                        className={`inline-flex h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors ${isListening ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"}`}
                        download
                      >
                        <FileAudio className="mr-1.5 h-4 w-4" /> Audio
                      </a>
                      <a href={`/api/tests/${encodeURIComponent(test.id)}/pdf?v=times-serif-1`} className="inline-flex h-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100" download>
                        <Download className="mr-1.5 h-4 w-4" /> PDF
                      </a>
                      <a href={`/api/tests/${encodeURIComponent(test.id)}/docx`} className="inline-flex h-9 items-center justify-center rounded-md bg-blue-700 px-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800" download>
                        <Download className="mr-1.5 h-4 w-4" /> DOCX
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div className="sticky bottom-4 z-20 mx-auto mt-6 flex max-w-3xl flex-col gap-3 rounded-2xl border border-blue-200 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{selected.size} ta test tanlandi</p>
              <p className="text-xs text-slate-300">Tanlangan testlar tartibli bitta faylga birlashtiriladi.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 gap-2 sm:flex-none" disabled={Boolean(exporting)} onClick={() => exportSelected("pdf")}>
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Bitta PDF
              </Button>
              <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-500 sm:flex-none" disabled={Boolean(exporting)} onClick={() => exportSelected("docx")}>
                {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Bitta DOCX
              </Button>
            </div>
          </div>
        )}

        {downloadError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
            Faylni yaratishda xatolik yuz berdi. Qayta urinib ko‘ring.
          </div>
        )}
      </div>
    </main>
  );
}
