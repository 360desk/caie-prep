'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BookOpen, Brain, FileText, Sparkles, CheckCircle2, 
  UploadCloud, Send, Award, BarChart3, TrendingUp, AlertTriangle, 
  ListChecks, Eye, X, Globe, RotateCcw
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend
} from 'recharts';

// Grafik veri noktası üzerine sınav sayısını yazan rozet etiket
const CustomizedDotLabel = (props: any) => {
  const { x, y, stroke, payload } = props;
  if (!payload || payload.sinavSayisi === undefined) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="5" fill={stroke || '#6366f1'} stroke="#0f172a" strokeWidth="2" />
      <rect 
        x="-24" 
        y="-26" 
        width="48" 
        height="18" 
        rx="4" 
        fill="#1e1b4b" 
        stroke="#6366f1" 
        strokeWidth="1" 
      />
      <text 
        x="0" 
        y="-14" 
        textAnchor="middle" 
        fill="#e0e7ff" 
        fontSize="9" 
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        {payload.sinavSayisi} Sınav
      </text>
    </g>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'creator' | 'analytics'>('creator');

  // Materyal & Sınav State'leri
  const [selectedSubject, setSelectedSubject] = useState('9990');
  const [unitTitle, setUnitTitle] = useState('');
  const [paperType, setPaperType] = useState('Paper 1');
  const [scanText, setScanText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Sınav Uygulama State'leri
  const [examMode, setExamMode] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [gradingLoading, setGradingLoading] = useState(false);
  const [examResult, setExamResult] = useState<any>(null);

  // Analitik State'leri
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [analyticsSubject, setAnalyticsSubject] = useState<'all' | '9990' | '9699' | '9694'>('all');
  const [selectedAttemptDetail, setSelectedAttemptDetail] = useState<any | null>(null);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success) {
        setAnalyticsData(data.attempts || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab]);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setExamMode(false);
    setExamResult(null);
    setStudentAnswers({});

    try {
      const formData = new FormData();
      formData.append('subjectCode', selectedSubject);
      formData.append('unitTitle', unitTitle);
      formData.append('paperType', paperType);
      if (scanText) formData.append('textContent', scanText);
      if (selectedFile) formData.append('file', selectedFile);

      const res = await fetch('/api/process-material', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız');
      setResult(data);
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitExam = async () => {
    setGradingLoading(true);
    try {
      const res = await fetch('/api/grade-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: result.quiz.id,
          questions: result.quiz.questions,
          studentAnswers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Puanlama başarısız');
      setExamResult(data.result);
      fetchAnalytics();
    } catch (err: any) {
      alert('Değerlendirme Hatası: ' + err.message);
    } finally {
      setGradingLoading(false);
    }
  };

  // DAHA ÖNCE YAPILMIŞ SINAVI TEKRAR ÇÖZME METODU
  const handleRetakeExam = async (quizId: string) => {
    try {
      // Supabase'den sınav ve sorularını çek
      const { data: quizData, error: qErr } = await supabase
        .schema('caie')
        .from('quizzes')
        .select(`
          id,
          title,
          paper_type,
          questions,
          material_id,
          study_materials (
            extracted_summary,
            examiner_tips
          )
        `)
        .eq('id', quizId)
        .single();

      if (qErr || !quizData) throw new Error('Sınav detayları alınamadı.');

      // State'leri sıfırla ve sınav moduna geçir
      setResult({
        quiz: {
          id: quizData.id,
          title: quizData.title,
          paper_type: quizData.paper_type,
          questions: quizData.questions,
        },
        material: quizData.study_materials || {
          extracted_summary: 'Önceki sınav kaydı yüklendi.',
          examiner_tips: [],
        },
      });

      setStudentAnswers({});
      setExamResult(null);
      setSelectedAttemptDetail(null);
      setExamMode(true);
      setActiveTab('creator');
    } catch (err: any) {
      alert('Sınav yüklenirken hata oluştu: ' + err.message);
    }
  };

  // --- HAFTALIK ZAMAN GRUPLAMA YARDIMCISI ---
  const getWeekStartLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return `${monday.getDate()} ${monday.toLocaleString('tr-TR', { month: 'short' })}`;
  };

  // 1. GENEL BAKIŞ: 3 DERSİN HAFTALIK ÇİZGİ GRAFİK VERİSİ
  const generateMultiSubjectWeeklyData = () => {
    const weekMap: Record<string, { week: string; rawDate: number; [key: string]: any }> = {};

    analyticsData.forEach((att) => {
      const d = new Date(att.created_at);
      const weekLabel = getWeekStartLabel(att.created_at);
      const subName = att.quizzes?.subjects?.name || 'Psychology';
      const percentage = Math.round((att.total_score / (att.max_score || 1)) * 100);

      if (!weekMap[weekLabel]) {
        weekMap[weekLabel] = {
          week: weekLabel,
          rawDate: d.getTime(),
          totalTests: 0,
        };
      }

      if (!weekMap[weekLabel][subName]) {
        weekMap[weekLabel][subName] = { sum: 0, count: 0 };
      }

      weekMap[weekLabel][subName].sum += percentage;
      weekMap[weekLabel][subName].count += 1;
      weekMap[weekLabel].totalTests += 1;
    });

    return Object.values(weekMap)
      .sort((a, b) => a.rawDate - b.rawDate)
      .map((item) => {
        const row: any = { week: item.week, sinavSayisi: item.totalTests };
        ['Psychology', 'Sociology', 'Thinking Skills'].forEach((sub) => {
          if (item[sub]) {
            row[sub] = Math.round(item[sub].sum / item[sub].count);
          }
        });
        return row;
      });
  };

  // 2. TEK DERS: HAFTALIK ÇİZGİ GRAFİK VERİSİ
  const generateSingleSubjectWeeklyData = (subCode: string) => {
    const subAttempts = analyticsData.filter((att) => att.quizzes?.subjects?.code === subCode);
    const weekMap: Record<string, { week: string; rawDate: number; sum: number; count: number }> = {};

    subAttempts.forEach((att) => {
      const d = new Date(att.created_at);
      const weekLabel = getWeekStartLabel(att.created_at);
      const percentage = Math.round((att.total_score / (att.max_score || 1)) * 100);

      if (!weekMap[weekLabel]) {
        weekMap[weekLabel] = { week: weekLabel, rawDate: d.getTime(), sum: 0, count: 0 };
      }
      weekMap[weekLabel].sum += percentage;
      weekMap[weekLabel].count += 1;
    });

    return Object.values(weekMap)
      .sort((a, b) => a.rawDate - b.rawDate)
      .map((w) => ({
        week: w.week,
        ortalamaPuan: Math.round(w.sum / w.count),
        sinavSayisi: w.count,
      }));
  };

  const multiSubjectChartData = generateMultiSubjectWeeklyData();
  const singleSubjectChartData = analyticsSubject !== 'all' ? generateSingleSubjectWeeklyData(analyticsSubject) : [];

  const filteredAttempts = analyticsSubject === 'all'
    ? analyticsData
    : analyticsData.filter((att) => att.quizzes?.subjects?.code === analyticsSubject);

  const allImprovementPoints = filteredAttempts
    .flatMap((att) => att.improvement_points || [])
    .slice(-6);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Üst Başlık & Sekmeler */}
        <div className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm tracking-wider uppercase">
              <Sparkles className="w-4 h-4" /> Cambridge Assessment International Education
            </div>
            <h1 className="text-3xl font-bold mt-1 text-white">CAIE A-Level Öğrenme & Takip Portalı</h1>
          </div>

          <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('creator')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                activeTab === 'creator' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Materyal & Sınavlar
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Performans & Analiz
            </button>
          </div>
        </div>

        {/* TAB 1: Sınav Üretim & Çözüm Ekranı */}
        {activeTab === 'creator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" /> Kitap / PDF / Metin Girişi
              </h2>
              <form onSubmit={handleProcess} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Ders Seçin</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  >
                    <option value="9990">Cambridge Psychology (9990)</option>
                    <option value="9699">Cambridge Sociology (9699)</option>
                    <option value="9694">Cambridge Thinking Skills (9694)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium">Ünite / Konu Başlığı</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Cognitive Psychology - Andrade"
                    value={unitTitle}
                    onChange={(e) => setUnitTitle(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium">Hedef Sınav Kağıdı</label>
                  <select
                    value={paperType}
                    onChange={(e) => setPaperType(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  >
                    <option value="Paper 1">Paper 1 (Teorik / MCQ & Kısa)</option>
                    <option value="Paper 2">Paper 2 (Metot & Değerlendirme)</option>
                    <option value="Paper 3 & 4">Paper 3 & 4 (İleri Düzey Essay)</option>
                  </select>
                </div>

                {/* PDF Dosya Seçim Alanı */}
                <div>
                  <label className="text-xs text-slate-400 font-medium">Kitap Taraması (PDF veya Görsel)</label>
                  <div className="mt-1 flex items-center justify-center border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-xl p-4 transition bg-slate-950/50">
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-1.5 text-xs text-slate-400 w-full text-center py-2">
                      <UploadCloud className="w-6 h-6 text-indigo-400 mb-1" />
                      {selectedFile ? (
                        <div className="flex flex-col items-center">
                          <span className="font-semibold text-emerald-400">✓ {selectedFile.name}</span>
                          <span className="text-[10px] text-slate-500">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB) - Değiştirmek için tıklayın</span>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-slate-300">PDF veya Fotoğraf Seçin</span>
                          <span className="text-[10px] text-slate-600">(PDF, JPG, PNG - Maks 20MB)</span>
                        </>
                      )}
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSelectedFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium">Veya Metin Yapıştırın</label>
                  <textarea
                    rows={4}
                    placeholder="PDF yüklemediyseniz metni buraya yapıştırabilirsiniz..."
                    value={scanText}
                    onChange={(e) => setScanText(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'İşleniyor...' : <><Sparkles className="w-4 h-4" /> Analiz Et & Sınav Üret</>}
                </button>
              </form>
            </div>

            {/* Sağ Panel */}
            <div className="lg:col-span-7 space-y-6">
              {!result && !loading && (
                <div className="h-full min-h-[350px] border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                  <FileText className="w-12 h-12 mb-3 text-slate-700" />
                  <p className="font-medium text-slate-400">Henüz materyal işlenmedi.</p>
                  <p className="text-xs mt-1">PDF yükleyin veya sol taraftan yeni analiz başlatın.</p>
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setExamMode(false)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                        !examMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Özet & Mark Scheme Görünümü
                    </button>
                    <button
                      onClick={() => setExamMode(true)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                        examMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📝 Sınavı Öğrenci Olarak Çöz
                    </button>
                  </div>

                  {!examMode && (
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                      <h3 className="text-md font-semibold text-indigo-400 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Konu Özeti
                      </h3>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                        {result.material.extracted_summary}
                      </p>
                      {result.material.examiner_tips?.length > 0 && (
                        <div className="mt-4 p-4 bg-indigo-950/30 border border-indigo-900/50 rounded-xl space-y-2">
                          <div className="text-xs font-bold text-indigo-300 uppercase">Examiner Tüyoları:</div>
                          <ul className="list-disc list-inside text-xs text-indigo-200 space-y-1">
                            {result.material.examiner_tips.map((tip: string, i: number) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {examMode && !examResult && (
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                        <h3 className="text-md font-semibold text-white flex items-center gap-2">
                          <Brain className="w-5 h-5 text-amber-400" /> {result.quiz.title}
                        </h3>
                        <span className="text-xs bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20 font-mono">
                          {result.quiz.questions.length} Soru
                        </span>
                      </div>

                      <div className="space-y-6">
                        {result.quiz.questions.map((q: any, idx: number) => (
                          <div key={q.id || idx} className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                            <span className="text-xs font-bold text-indigo-400">Soru {idx + 1} ({q.max_marks} Mark)</span>
                            <p className="text-sm font-medium text-slate-200">{q.question}</p>
                            {q.options && q.options.length > 0 ? (
                              <div className="space-y-2 pt-2">
                                {q.options.map((opt: string, optIdx: number) => {
                                  const letter = opt.charAt(0);
                                  const isSelected = studentAnswers[q.id || idx] === letter;
                                  return (
                                    <button
                                      key={optIdx}
                                      type="button"
                                      onClick={() => setStudentAnswers((p) => ({ ...p, [q.id || idx]: letter }))}
                                      className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                                        isSelected
                                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium'
                                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <textarea
                                rows={3}
                                placeholder="Yanıtınızı buraya yazın..."
                                value={studentAnswers[q.id || idx] || ''}
                                onChange={(e) => setStudentAnswers((p) => ({ ...p, [q.id || idx]: e.target.value }))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={gradingLoading}
                        onClick={submitExam}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {gradingLoading ? 'Puanlanıyor...' : <><Send className="w-4 h-4" /> Sınavı Bitir & Kaydet</>}
                      </button>
                    </div>
                  )}

                  {examResult && (
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Award className="w-6 h-6 text-amber-400" /> Sınav Karnesi
                        </h3>
                        <div className="text-2xl font-black text-emerald-400">
                          {examResult.total_score} / {examResult.max_score}
                        </div>
                      </div>

                      {/* Çift Dilli Gelişim Kutusu */}
                      {examResult.improvement_points?.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                            <Globe className="w-4 h-4" /> Geliştirilmesi Gereken Noktalar (TR & EN):
                          </div>
                          {examResult.improvement_points.map((pt: any, idx: number) => (
                            <div key={idx} className="p-4 bg-slate-950 border border-amber-900/30 rounded-xl space-y-1.5 text-xs">
                              <div className="text-slate-200 font-medium">🇹🇷 {typeof pt === 'string' ? pt : pt.tr}</div>
                              {pt.en && <div className="text-amber-300/80 italic">🇬🇧 {pt.en}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => { setExamResult(null); setExamMode(false); }}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-xl text-slate-200 transition"
                      >
                        Tamamlandı
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Performans & Analiz Paneli */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            
            {/* Üst Filtre Butonları */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Görünüm:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setAnalyticsSubject('all')}
                  className={`px-4 py-2 text-xs font-medium rounded-xl transition ${
                    analyticsSubject === 'all'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  🌐 3 Ders Genel Akış (Haftalık)
                </button>
                {[
                  { code: '9990', name: 'Psychology (9990)' },
                  { code: '9699', name: 'Sociology (9699)' },
                  { code: '9694', name: 'Thinking Skills (9694)' },
                ].map((sub: any) => (
                  <button
                    key={sub.code}
                    onClick={() => setAnalyticsSubject(sub.code)}
                    className={`px-4 py-2 text-xs font-medium rounded-xl transition ${
                      analyticsSubject === sub.code
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>

            {/* DURUM 1: GENEL BAKIŞ (3 DERSİN HAFTALIK ÇİZGİ GRAFİĞİ) */}
            {analyticsSubject === 'all' && (
              <div className="space-y-8">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-md font-semibold text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-400" /> Haftalık Zaman-Puan Akışı (3 Ders)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Haftalık ortalama puan akışı ve veri noktalarında girilen toplam sınav sayısı.
                    </p>
                  </div>

                  {multiSubjectChartData.length > 0 ? (
                    <div className="h-80 w-full pt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={multiSubjectChartData} margin={{ top: 25, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="week" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#94a3b8" domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} 
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '15px' }} />
                          <Line 
                            type="monotone" 
                            dataKey="Psychology" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={<CustomizedDotLabel stroke="#6366f1" />} 
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="Sociology" 
                            stroke="#10b981" 
                            strokeWidth={3} 
                            dot={<CustomizedDotLabel stroke="#10b981" />} 
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="Thinking Skills" 
                            stroke="#f59e0b" 
                            strokeWidth={3} 
                            dot={<CustomizedDotLabel stroke="#f59e0b" />} 
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-slate-500 text-xs">
                      Henüz girilmiş sınav verisi bulunmuyor.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DURUM 2: SEÇİLİ DERS DETAYI */}
            {analyticsSubject !== 'all' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="text-xs text-slate-400 font-medium">Toplam Çözülen Sınav</div>
                    <div className="text-3xl font-bold text-white mt-2">{filteredAttempts.length}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="text-xs text-slate-400 font-medium">Genel Başarı Ortalaması</div>
                    <div className="text-3xl font-bold text-emerald-400 mt-2">
                      {filteredAttempts.length > 0
                        ? Math.round(filteredAttempts.reduce((acc, curr) => acc + ((curr.total_score / (curr.max_score || 1)) * 100), 0) / filteredAttempts.length)
                        : 0}%
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="text-xs text-slate-400 font-medium">Hedef CAIE Not Tahmini</div>
                    <div className="text-3xl font-bold text-indigo-400 mt-2">
                      {filteredAttempts.length > 0 && Math.round(filteredAttempts.reduce((acc, curr) => acc + ((curr.total_score / (curr.max_score || 1)) * 100), 0) / filteredAttempts.length) >= 80 ? 'A*' : 'A / B'}
                    </div>
                  </div>
                </div>

                {/* Haftalık Başarı Trend Çizgi Grafiği */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-md font-semibold text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-400" /> Haftalık Başarı & Sınav Trendi
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Haftalık ortalama not ve o haftada tamamlanan toplam sınav adedi.</p>
                  </div>

                  {singleSubjectChartData.length > 0 ? (
                    <div className="h-72 w-full pt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={singleSubjectChartData} margin={{ top: 25, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="week" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#94a3b8" domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="ortalamaPuan" 
                            name="Haftalık Ortalama (%)" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={<CustomizedDotLabel stroke="#6366f1" />} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-slate-500 text-xs">
                      Bu derse ait henüz tamamlanmış sınav bulunamadı.
                    </div>
                  )}
                </div>

                {/* Çift Dilli Gelişim Kutusu & Sınav Geçmişi */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Sol Kutu: Çift Dilli Gelişim Alanları */}
                  <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <h3 className="text-md font-semibold text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" /> Geliştirilmesi Gereken Noktalar (TR & EN)
                    </h3>
                    {allImprovementPoints.length > 0 ? (
                      <div className="space-y-3">
                        {allImprovementPoints.map((pt: any, idx: number) => (
                          <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl space-y-1.5 text-xs">
                            <div className="text-slate-200 font-medium flex items-start gap-2">
                              <span className="text-emerald-400">🇹🇷</span>
                              <span>{typeof pt === 'string' ? pt : pt.tr}</span>
                            </div>
                            {pt.en && (
                              <div className="text-amber-300/80 italic pl-5 flex items-start gap-2">
                                <span className="not-italic text-indigo-400">🇬🇧</span>
                                <span>{pt.en}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Henüz kaydedilmiş bir gelişim uyarısı yok.</p>
                    )}
                  </div>

                  {/* Sağ Kutu: Sınav Listesi & Tekrar Çöz Butonları */}
                  <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <h3 className="text-md font-semibold text-white flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-indigo-400" /> Sınav Geçmişi & Tekrar Çöz
                    </h3>
                    {filteredAttempts.length > 0 ? (
                      <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                        {filteredAttempts.map((att) => (
                          <div key={att.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <div className="font-semibold text-slate-200">{att.quizzes?.title}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                {new Date(att.created_at).toLocaleDateString('tr-TR')} • {att.quizzes?.paper_type}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right mr-2">
                                <div className="font-bold text-emerald-400">{att.total_score} / {att.max_score}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  %{Math.round((att.total_score / (att.max_score || 1)) * 100)}
                                </div>
                              </div>
                              <button
                                onClick={() => setSelectedAttemptDetail(att)}
                                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition"
                                title="Verilen Yanıtları İncele"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRetakeExam(att.quizzes?.id)}
                                className="p-2 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 rounded-lg text-indigo-300 hover:text-white transition flex items-center gap-1 font-medium"
                                title="Bu Sınavı Yeniden Çöz"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Henüz tamamlanan sınav yok.</p>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* Sınav ve Öğrenci Yanıtlarını İnceleme Modalı */}
            {selectedAttemptDetail && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 max-w-2xl w-full rounded-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-md font-bold text-white">{selectedAttemptDetail.quizzes?.title}</h4>
                      <span className="text-xs text-slate-400">{new Date(selectedAttemptDetail.created_at).toLocaleDateString('tr-TR')} Sınavı</span>
                    </div>
                    <button
                      onClick={() => setSelectedAttemptDetail(null)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Soru ve Öğrenci Yanıtları */}
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-indigo-400 uppercase">Öğrencinin Verdiği Yanıtlar:</div>
                    {Object.entries(selectedAttemptDetail.student_answers || {}).map(([qKey, ans]: any, i) => (
                      <div key={i} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                        <span className="font-semibold text-slate-400">Soru {Number(qKey) + 1} Yanıtı:</span>
                        <div className="text-slate-200 bg-slate-900 p-2.5 rounded-lg font-mono">{String(ans)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRetakeExam(selectedAttemptDetail.quizzes?.id)}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" /> Sınavı Şimdi Tekrar Çöz
                    </button>
                    <button
                      onClick={() => setSelectedAttemptDetail(null)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs text-slate-300 transition"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </main>
  );
}