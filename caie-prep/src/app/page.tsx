'use client';

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Award, 
  Timer, 
  ChevronRight, 
  RefreshCcw,
  FileText,
  Layers,
  BarChart3
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface Question {
  id: string;
  topic: string;
  subtopic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  marks: number;
  questionText: string;
  markingScheme: string[];
}

interface Exam {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
  durationMinutes: number;
  questions: Question[];
}

interface QuestionEvaluation {
  questionId: string;
  score: number;
  maxMarks: number;
  feedback: string;
  matchedCriteria: string[];
  missedCriteria: string[];
}

interface ExamEvaluation {
  totalScore: number;
  maxScore: number;
  percentage: number;
  overallFeedback: string;
  evaluations: QuestionEvaluation[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'upload' | 'exam' | 'results' | 'analytics'>('upload');
  
  // Materyal & Sınav State'leri
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState('Computer Science (9618)');
  const [examType, setExamType] = useState<'A-Level' | 'AS-Level'>('A-Level');
  const [difficulty, setDifficulty] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('Medium');
  const [questionCount, setQuestionCount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Aktif Sınav State'leri
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  // Değerlendirme & Analitik State'leri
  const [isGrading, setIsGrading] = useState(false);
  const [evaluation, setEvaluation] = useState<ExamEvaluation | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);

  // Sınav Süre Sayacı
  useEffect(() => {
    if (activeTab === 'exam' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeTab, timeLeft]);

  // PDF Dosya Yükleme & Sınav Oluşturma
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert('Lütfen bir PDF veya ders materyali dosyası seçin.');
      return;
    }

    // Vercel 4.5 MB Payload Limit Kontrolü
    const maxSizeBytes = 4.5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`Dosya boyutu çok büyük (${(file.size / (1024 * 1024)).toFixed(1)} MB). Vercel sınırı gereği lütfen 4.5 MB'tan küçük bir PDF yükleyin.`);
      return;
    }

    setIsProcessing(true);
    setStatusMessage('PDF okunuyor ve CAIE soru formatlarına dönüştürülüyor...');

    try {
      // Base64 Çevrimi
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Content = reader.result as string;

          const response = await fetch('/api/process-material', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64Content,
              fileName: file.name,
              subject,
              examType,
              difficulty,
              questionCount,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 413) {
              throw new Error('Yüklenen PDF dosyası sunucu sınırını aştı (413 Payload Too Large). Lütfen daha küçük bir dosya seçin.');
            }
            throw new Error(`Sunucu Hatası (${response.status}): ${errorText}`);
          }

          const result = await response.json();
          if (!result.success || !result.exam) {
            throw new Error(result.error || 'Sınav oluşturulamadı.');
          }

          setCurrentExam(result.exam);
          setTimeLeft(result.exam.durationMinutes * 60);
          setUserAnswers({});
          setCurrentQuestionIndex(0);
          setActiveTab('exam');
        } catch (err: any) {
          alert('Hata: ' + err.message);
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (err: any) {
      alert('Dosya işleme hatası: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleAutoSubmit = () => {
    alert('Süre doldu! Cevaplarınız otomatik olarak değerlendirmeye gönderiliyor.');
    submitExamForGrading();
  };

  // Sınavı Notlandırmaya Gönder
  const submitExamForGrading = async () => {
    if (!currentExam) return;
    setIsGrading(true);

    try {
      const response = await fetch('/api/grade-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: currentExam.id,
          questions: currentExam.questions,
          userAnswers,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Değerlendirme Hatası (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      if (!result.success || !result.evaluation) {
        throw new Error(result.error || 'Değerlendirme yapılamadı.');
      }

      setEvaluation(result.evaluation);
      setActiveTab('results');

      // Analitik verisini güncelle
      setAnalyticsData((prev) => [
        ...prev,
        {
          name: currentExam.title.slice(0, 15),
          score: result.evaluation.percentage,
          totalMarks: currentExam.totalMarks,
        },
      ]);
    } catch (err: any) {
      alert('Notlandırma sırasında bir hata oluştu: ' + err.message);
    } finally {
      setIsGrading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Üst Menü */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                CAIE A-Level AI Examiner
              </span>
            </div>
          </div>

          <nav className="flex gap-2">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                activeTab === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Upload className="w-4 h-4" /> Materyal & Sınav
            </button>
            <button
              onClick={() => setActiveTab('exam')}
              disabled={!currentExam}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition disabled:opacity-40 ${
                activeTab === 'exam' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Sınav Portalı
            </button>
            <button
              onClick={() => setActiveTab('results')}
              disabled={!evaluation}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition disabled:opacity-40 ${
                activeTab === 'results' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Award className="w-4 h-4" /> Sonuç & Geri Bildirim
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> İlerleme Analitiği
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 1. SEKME: Materyal Yükleme & Sınav Oluşturma */}
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold mb-2 text-white">Ders Materyali Yükleyin</h2>
            <p className="text-slate-400 text-sm mb-6">
              Cambridge International A-Level müfredatına uygun PDF notlarınızı veya çıkmış sorularınızı yükleyin. Yapay zeka Mark Scheme kriterlerine göre otomatik deneme sınavı üretecektir.
            </p>

            <form onSubmit={handleFileUpload} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ders / Alan Seçimi</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Computer Science (9618)">Computer Science (9618)</option>
                  <option value="Mathematics (9709)">Mathematics (9709)</option>
                  <option value="Physics (9702)">Physics (9702)</option>
                  <option value="Chemistry (9701)">Chemistry (9701)</option>
                  <option value="Economics (9708)">Economics (9708)</option>
                  <option value="Business (9609)">Business (9609)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Zorluk Seviyesi</label>
                  <select
                    value={difficulty}
                    onChange={(e: any) => setDifficulty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All">Karma Zorluk</option>
                    <option value="Easy">Easy (Temel Kavramlar)</option>
                    <option value="Medium">Medium (Standart A-Level)</option>
                    <option value="Hard">Hard (Analitik & Problem Çözme)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Soru Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ders Materyali (PDF &lt; 4.5MB)</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition mt-6 shadow-lg shadow-indigo-600/20"
              >
                {isProcessing ? (
                  <>
                    <RefreshCcw className="w-5 h-5 animate-spin" />
                    <span>{statusMessage}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Sınavı Hazırla & Başlat</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 2. SEKME: Sınav Çözüm Portalı */}
        {activeTab === 'exam' && currentExam && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <h3 className="font-bold text-white text-lg">{currentExam.title}</h3>
                <p className="text-sm text-slate-400">Toplam Puan: {currentExam.totalMarks} | {currentExam.subject}</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg">
                <Timer className="w-5 h-5 text-indigo-400" />
                <span className="font-mono text-lg font-bold text-indigo-300">{formatTime(timeLeft)}</span>
              </div>
            </div>

            {/* Soru İçeriği */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
                <span className="text-xs font-semibold px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
                  Soru {currentQuestionIndex + 1} / {currentExam.questions.length}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  [{currentExam.questions[currentQuestionIndex].marks} Marks] ({currentExam.questions[currentQuestionIndex].difficulty})
                </span>
              </div>

              <p className="text-slate-100 text-base leading-relaxed whitespace-pre-wrap mb-6">
                {currentExam.questions[currentQuestionIndex].questionText}
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Cevabınız:</label>
                <textarea
                  rows={6}
                  value={userAnswers[currentExam.questions[currentQuestionIndex].id] || ''}
                  onChange={(e) =>
                    setUserAnswers({
                      ...userAnswers,
                      [currentExam.questions[currentQuestionIndex].id]: e.target.value,
                    })
                  }
                  placeholder="Cambridge Mark Scheme standartlarına uygun olarak cevabınızı buraya yazın..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono text-sm leading-relaxed"
                />
              </div>

              {/* Soru Gezinme Butonları */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-sm transition"
                >
                  Önceki Soru
                </button>

                {currentQuestionIndex < currentExam.questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
                  >
                    Sonraki Soru
                  </button>
                ) : (
                  <button
                    onClick={submitExamForGrading}
                    disabled={isGrading}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    {isGrading ? (
                      <>
                        <RefreshCcw className="w-4 h-4 animate-spin" />
                        <span>AI Puanlıyor...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Sınavı Tamamla & Puanla</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. SEKME: Sınav Sonuçları & AI Değerlendirmesi */}
        {activeTab === 'results' && evaluation && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl">
              <div>
                <h3 className="text-xl font-bold text-white">Sınav Değerlendirmesi</h3>
                <p className="text-sm text-slate-400 mt-1">{evaluation.overallFeedback}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-indigo-400">
                  {evaluation.totalScore} / {evaluation.maxScore}
                </div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">
                  Başarı Oranı: %{evaluation.percentage}
                </div>
              </div>
            </div>

            {/* Soru Bazlı Geri Bildirim Listesi */}
            <div className="space-y-4">
              {evaluation.evaluations.map((item, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-200">Soru #{idx + 1} Değerlendirmesi</span>
                    <span className="text-sm font-bold text-indigo-400">
                      Puan: {item.score} / {item.maxMarks}
                    </span>
                  </div>

                  <p className="text-sm text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <strong className="text-slate-400">AI Feedback:</strong> {item.feedback}
                  </p>

                  {item.missedCriteria && item.missedCriteria.length > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                      <span className="text-xs font-semibold text-rose-400 block mb-1">Eksik Kalan / Kaçırılan Noktalar:</span>
                      <ul className="list-disc list-inside text-xs text-rose-300 space-y-1">
                        {item.missedCriteria.map((c, cIdx) => (
                          <li key={cIdx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. SEKME: Analitik Grafiği */}
        {activeTab === 'analytics' && (
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-2">Başarı Trendi & Analiz</h3>
            <p className="text-sm text-slate-400 mb-6">Tamamlanan tüm CAIE deneme sınavlarının başarı oranları grafiği.</p>
            
            <div className="h-72 w-full">
              {analyticsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Bar dataKey="score" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Henüz çözülmüş bir sınav kaydı bulunmuyor. Bir sınav tamamladığınızda grafik burada görüntülenecektir.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}