import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Tüm dersleri al
    const { data: subjects, error: subErr } = await supabase
      .schema('caie')
      .from('subjects')
      .select('*');

    if (subErr) throw subErr;

    // 2. Tüm sınavları al
    const { data: quizzes, error: qErr } = await supabase
      .schema('caie')
      .from('quizzes')
      .select('id, title, paper_type, subject_id');

    if (qErr) throw qErr;

    // 3. Tüm sınav denemelerini al
    const { data: attempts, error: attErr } = await supabase
      .schema('caie')
      .from('attempts')
      .select('*')
      .order('created_at', { ascending: true });

    if (attErr) throw attErr;

    // 4. Verileri birleştir
    const formattedAttempts = (attempts || []).map((att) => {
      const quiz = (quizzes || []).find((q) => q.id === att.quiz_id);
      const subject = (subjects || []).find((s) => s.id === quiz?.subject_id);

      return {
        ...att,
        quizzes: {
          id: quiz?.id,
          title: quiz?.title || 'Bilinmeyen Sınav',
          paper_type: quiz?.paper_type || 'Paper 1',
          subjects: {
            id: subject?.id,
            code: subject?.code || '9990',
            name: subject?.name || 'Psychology',
          },
        },
      };
    });

    return NextResponse.json({ success: true, subjects, attempts: formattedAttempts });
  } catch (err: any) {
    console.error('Analytics API Hatası:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}