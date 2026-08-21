import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const subjectCode = formData.get('subjectCode') as string;
    const unitTitle = formData.get('unitTitle') as string;
    const paperType = formData.get('paperType') as string;
    const textContent = (formData.get('textContent') as string) || '';
    const file = formData.get('file') as File | null;

    if (!subjectCode || !unitTitle || (!textContent && !file)) {
      return NextResponse.json(
        { error: 'Lütfen ders bilgisi ile birlikte bir metin veya PDF/Görsel dosyası sağlayın.' },
        { status: 400 }
      );
    }

    const { data: subjectData, error: subErr } = await supabase
      .schema('caie')
      .from('subjects')
      .select('id')
      .eq('code', subjectCode)
      .maybeSingle();

    if (subErr || !subjectData) {
      return NextResponse.json(
        { error: `Ders bulunamadı (${subjectCode}). Veritabanını kontrol edin.` },
        { status: 404 }
      );
    }

    const contentsPayload: any[] = [];

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const base64Data = Buffer.from(bytes).toString('base64');
      const mimeType = file.type || 'application/pdf';

      contentsPayload.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    }

    const prompt = `
Sen Cambridge Assessment International Education (CAIE) A-Level (${subjectCode}) kıdemli baş denetçisisin (Chief Examiner).
Ekteki dokümanı ve metni incele:
${textContent ? `Ek Metin: """${textContent}"""` : ''}

Lütfen Cambridge A-Level standartlarına tam uyumlu olarak JSON formatında yanıt üret. 
SADECE GEÇERLİ BİR JSON NESNESİ DÖNDÜR. Markdown backtick (\`\`\`json) veya fazladan açıklama yazma.

JSON Şeması:
{
  "summary": "Ünitenin akademik özeti (Türkçe ve anahtar İngilizce terimlerle)",
  "key_concepts": [
    {"term": "Kavram / Terminoloji", "definition": "Tanımı ve sınavdaki önemi"}
  ],
  "examiner_tips": [
    "Cambridge sınavında öğrencilerin en sık yaptığı hatalar ve dikkat edilmesi gereken 3-4 püf nokta"
  ],
  "quiz": {
    "title": "${unitTitle} - ${paperType} Değerlendirme Testi",
    "questions": [
      {
        "id": 1,
        "type": "mcq",
        "question": "İngilizce CAIE formatında çoktan seçmeli soru metni",
        "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
        "correct_answer": "A",
        "mark_scheme": "A şıkkının neden doğru olduğuna dair Cambridge Mark Scheme açıklaması",
        "max_marks": 1
      },
      {
        "id": 2,
        "type": "structured",
        "question": "İngilizce CAIE formatında açık uçlu/yapılandırılmış soru metni",
        "options": [],
        "correct_answer": "Model yanıt anahtarı",
        "mark_scheme": "AO1: ... (2 marks), AO2: ... (2 marks)",
        "max_marks": 4
      }
    ]
  }
}`;

    contentsPayload.push(prompt);

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: contentsPayload,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let rawText = response.text || '{}';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedData: any;
    try {
      parsedData = JSON.parse(rawText);
    } catch (parseError) {
      console.error('Gemini JSON Ayrıştırma Hatası:', rawText);
      return NextResponse.json(
        { error: 'Yapay zeka yanıtı geçerli JSON formatında oluşturulamadı.' },
        { status: 500 }
      );
    }

    const { data: material, error: matErr } = await supabase
      .schema('caie')
      .from('study_materials')
      .insert({
        subject_id: subjectData.id,
        unit_title: unitTitle,
        extracted_summary: parsedData.summary || '',
        key_concepts: parsedData.key_concepts || [],
        examiner_tips: parsedData.examiner_tips || [],
      })
      .select()
      .single();

    if (matErr) throw matErr;

    const { data: quiz, error: qErr } = await supabase
      .schema('caie')
      .from('quizzes')
      .insert({
        subject_id: subjectData.id,
        material_id: material.id,
        paper_type: paperType || 'Paper 1',
        title: parsedData.quiz?.title || `${unitTitle} Sınavı`,
        questions: parsedData.quiz?.questions || [],
      })
      .select()
      .single();

    if (qErr) throw qErr;

    return NextResponse.json({ success: true, material, quiz });
  } catch (error: any) {
    console.error('Process Material API Hatası:', error);
    return NextResponse.json(
      { error: error?.message || 'İçerik işlenirken beklenmeyen bir hata oluştu.' },
      { status: 500 }
    );
  }
}