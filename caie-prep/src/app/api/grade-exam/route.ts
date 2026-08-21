import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { quizId, studentAnswers, questions } = await req.json();

    if (!quizId || !questions) {
      return NextResponse.json({ error: 'Sınav bilgisi veya sorular eksik.' }, { status: 400 });
    }

    const prompt = `
You are an Official Cambridge Assessment International Education (CAIE) Senior Examiner and Lead Moderator for A-Level subjects (Psychology 9990, Sociology 9699, Thinking Skills 9694).

Evaluate the following student exam answers strictly according to the official Cambridge Mark Scheme, Level Descriptors, and Assessment Objectives (AOs).

ASSESSMENT OBJECTIVES SPECIFICATION:
- AO1 (Knowledge & Understanding): Precision of factual recall, terminology, names, theories, and procedure details.
- AO2 (Application & Analysis): Ability to apply concepts directly to the given scenario/question without generic definitions.
- AO3 (Evaluation & Analysis): Evaluation of methodological strengths/weaknesses, ethical issues, validity, reliability, and structured reasoned judgements.

QUESTIONS, MARK SCHEMES & STUDENT RESPONSES:
${JSON.stringify({ questions, studentAnswers }, null, 2)}

GRADING INSTRUCTIONS:
1. For Multiple Choice (MCQ): Award 1 mark only if the selected letter matches the Mark Scheme.
2. For Structured/Essay Questions: Evaluate against the official CAIE Levels of Response (Level 1: Basic, Level 2: Sound, Level 3: Thorough/Detailed).
3. Do NOT give full marks unless specific terminology and relevant study details (sample, design, findings) are present where required.

Respond ONLY with a valid JSON object matching this exact schema (NO markdown formatting or extra text):
{
  "total_score": 12,
  "max_score": 15,
  "percentage": 80,
  "grade_boundary": "A",
  "ao_breakdown": {
    "AO1_Knowledge": "X/Y",
    "AO2_Application": "X/Y",
    "AO3_Evaluation": "X/Y"
  },
  "detailed_feedback": {
    "en": "Official Chief Examiner commentary in English detailing CAIE standard performance, referencing specific AO levels achieved.",
    "tr": "Cambridge standartlarına göre öğrencinin güçlü ve geliştirilmesi gereken yönlerini açıklayan resmi Türkçe değerlendirme özeti."
  },
  "improvement_points": [
    {
      "en": "Strict CAIE Mark Scheme advice in English (e.g., 'Ensure you reference specific quantitative findings (mean 5.3 vs 4.3) rather than general assertions to secure Level 3 AO1 marks').",
      "tr": "Türkçe Mark Scheme tavsiyesi (Örn: 'Level 3 AO1 tam puanı alabilmek için genel ifadeler yerine çalışmadaki net sayısal verileri (ortalama 5.3 vs 4.3) belirtin')."
    }
  ],
  "question_evaluations": [
    {
      "question_id": 1,
      "awarded_marks": 1,
      "max_marks": 1,
      "examiner_comment": "Official brief mark rationale referencing specific criteria."
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    let rawText = response.text || '{}';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const gradeData = JSON.parse(rawText);

    // Supabase attempts tablosuna kaydet
    await supabase.schema('caie').from('attempts').insert({
      quiz_id: quizId,
      student_answers: studentAnswers,
      total_score: gradeData.total_score || 0,
      max_score: gradeData.max_score || 1,
      ao_breakdown: gradeData.ao_breakdown || {},
      detailed_feedback: typeof gradeData.detailed_feedback === 'string' ? gradeData.detailed_feedback : gradeData.detailed_feedback?.tr || '',
      improvement_points: gradeData.improvement_points || [],
    });

    return NextResponse.json({ success: true, result: gradeData });
  } catch (error: any) {
    console.error('Grade Exam API Hatası:', error);
    return NextResponse.json({ error: error.message || 'Puanlama hatası' }, { status: 500 });
  }
}