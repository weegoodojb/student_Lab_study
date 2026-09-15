const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

export async function gradeDescriptiveAnswer({ prompt, rubric, studentAnswer, maxPoints }) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const body = {
    contents: [
      {
        parts: [
          {
            text: [
              '당신은 임상병리학과 실습 과목의 채점 보조원입니다.',
              '아래 문항, 정답 기준(루브릭), 학생 답안을 보고 0점~만점 사이 점수를 매기고 이유를 한 문장으로 설명하세요.',
              '정답 기준의 핵심 요지가 답안에 담겨 있으면 만점을, 부분적으로만 담겨 있으면 비례해서 감점하세요.',
              '',
              `[문항] ${prompt}`,
              `[정답 기준] ${rubric}`,
              `[만점] ${maxPoints}`,
              `[학생 답안] ${studentAnswer || '(답안 없음)'}`
            ].join('\n')
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          score: { type: 'NUMBER' },
          rationale: { type: 'STRING' }
        },
        required: ['score', 'rationale']
      }
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${text}`);
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    throw new Error('Gemini 응답에서 채점 결과를 찾을 수 없습니다.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Gemini 응답을 JSON으로 해석하지 못했습니다.');
  }

  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    throw new Error('Gemini 응답에 유효한 점수가 없습니다.');
  }

  return {
    score: Math.max(0, Math.min(maxPoints, score)),
    rationale: String(parsed.rationale || '')
  };
}
