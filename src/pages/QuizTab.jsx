import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import QRCode from 'qrcode';
import { db, getGoogleAccessToken, reauthorizeGoogle } from '../firebase';
import { createQuizForm, extractAnswerText, extractAutoGrade, listQuizResponses, trashGoogleForm } from '../lib/googleForms';
import { gradeDescriptiveAnswer } from '../lib/gemini';
import './QuizTab.css';

const STATUS_LABEL = {
  draft: '초안',
  form_created: 'Form 생성됨',
  graded: '채점 완료',
  finalized: '확정됨'
};

const MAX_QUESTIONS = 10;
const DEFAULT_FOOTER = '오늘 수업을 마친 후 해결되지 않았거나 가장 궁금한 점 1가지를 적어주세요.';

function formatDateTime(value) {
  if (!value) return '-';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}

function createEmptyRow(order) {
  return { order, type: 'mc', prompt: '', points: 1, correctAnswer: '', rubric: '' };
}

export default function QuizTab({ termId }) {
  const [templates, setTemplates] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [responses, setResponses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [gradingProgress, setGradingProgress] = useState(null);

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateWeek, setTemplateWeek] = useState('');
  const [footerPrompt, setFooterPrompt] = useState(DEFAULT_FOOTER);
  const [questionRows, setQuestionRows] = useState([createEmptyRow(1)]);

  const [activatingTemplateId, setActivatingTemplateId] = useState(null);
  const [deadlineInput, setDeadlineInput] = useState('');

  const [reconcileInput, setReconcileInput] = useState({});
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (termId) {
      loadTemplates();
      loadQuizzes();
      loadEnrollments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  useEffect(() => {
    if (selectedQuizId) loadResponses(selectedQuizId);
    else setResponses([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuizId]);

  const enrollmentsById = useMemo(() => {
    const map = new Map();
    enrollments.forEach(e => map.set(e.studentId, e));
    return map;
  }, [enrollments]);

  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId) || null;
  const activatingTemplate = templates.find(t => t.id === activatingTemplateId) || null;

  useEffect(() => {
    const responderUri = selectedQuiz?.responderUri;
    if (!responderUri) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(responderUri, { width: 200, margin: 1 })
      .then(url => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(error => {
        console.error('QR 코드 생성 실패:', error);
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedQuiz?.responderUri]);

  const loadEnrollments = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'terms', termId, 'enrollments'));
      setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('학생 명단 로드 실패:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'terms', termId, 'quizTemplates'));
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setTemplates(list);
    } catch (error) {
      console.error('템플릿 목록 로드 실패:', error);
      setMessage(`❌ 템플릿 목록 로드 실패: ${error.message}`);
    }
  };

  const loadQuizzes = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'terms', termId, 'quizzes'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setQuizzes(list);
      if (!selectedQuizId && list.length > 0) setSelectedQuizId(list[0].id);
    } catch (error) {
      console.error('퀴즈 목록 로드 실패:', error);
      setMessage(`❌ 퀴즈 목록 로드 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadResponses = async quizId => {
    try {
      const snapshot = await getDocs(collection(db, 'terms', termId, 'quizzes', quizId, 'responses'));
      setResponses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('응답 로드 실패:', error);
    }
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateTitle('');
    setTemplateWeek('');
    setFooterPrompt(DEFAULT_FOOTER);
    setQuestionRows([createEmptyRow(1)]);
  };

  const openNewTemplateForm = () => {
    resetTemplateForm();
    setShowTemplateForm(true);
  };

  const startEditTemplate = template => {
    setEditingTemplateId(template.id);
    setTemplateTitle(template.title || '');
    setTemplateWeek(template.week || '');
    setFooterPrompt(template.footerPrompt || DEFAULT_FOOTER);
    setQuestionRows(
      (template.questions || []).map(q => ({
        order: q.order,
        type: q.type,
        prompt: q.prompt || '',
        points: q.points ?? 1,
        correctAnswer: q.correctAnswer || '',
        rubric: q.rubric || ''
      }))
    );
    setShowTemplateForm(true);
  };

  const closeTemplateForm = () => {
    resetTemplateForm();
    setShowTemplateForm(false);
  };

  const updateRow = (index, patch) => {
    setQuestionRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setQuestionRows(prev => (prev.length >= MAX_QUESTIONS ? prev : [...prev, createEmptyRow(prev.length + 1)]));
  };

  const removeRow = index => {
    setQuestionRows(prev =>
      prev.length <= 1
        ? prev
        : prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, order: i + 1 }))
    );
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim()) {
      setMessage('❌ 퀴즈 제목을 입력하세요.');
      return;
    }
    const invalidRow = questionRows.find(
      row => !row.prompt.trim() || !(row.points > 0) || (row.type === 'mc' ? !row.correctAnswer.trim() : !row.rubric.trim())
    );
    if (invalidRow) {
      setMessage(
        `❌ ${invalidRow.order}번 문항: 내용/배점과 ${invalidRow.type === 'mc' ? '정답' : '정답 기준'}을 모두 입력하세요.`
      );
      return;
    }

    const questions = questionRows.map(row => {
      const base = { order: row.order, type: row.type, prompt: row.prompt.trim(), points: Number(row.points) };
      return row.type === 'mc' ? { ...base, correctAnswer: row.correctAnswer.trim() } : { ...base, rubric: row.rubric.trim() };
    });

    const payload = {
      title: templateTitle.trim(),
      week: templateWeek.trim(),
      footerPrompt: footerPrompt.trim(),
      questions,
      updatedAt: serverTimestamp()
    };

    try {
      setLoading(true);
      if (editingTemplateId) {
        await updateDoc(doc(db, 'terms', termId, 'quizTemplates', editingTemplateId), payload);
        setMessage('✅ 템플릿 수정 완료.');
      } else {
        await addDoc(collection(db, 'terms', termId, 'quizTemplates'), { ...payload, createdAt: serverTimestamp() });
        setMessage('✅ 템플릿 저장 완료. 아래 목록에서 이번 주 퀴즈로 활성화하세요.');
      }
      setShowTemplateForm(false);
      resetTemplateForm();
      await loadTemplates();
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      setMessage(`❌ 템플릿 저장 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async template => {
    if (!window.confirm(`템플릿 "${template.title}"을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'terms', termId, 'quizTemplates', template.id));
      await loadTemplates();
    } catch (error) {
      console.error('템플릿 삭제 실패:', error);
      setMessage(`❌ 템플릿 삭제 실패: ${error.message}`);
    }
  };

  const handleConfirmActivate = async () => {
    if (!activatingTemplate) return;
    try {
      setLoading(true);
      const quizRef = doc(collection(db, 'terms', termId, 'quizzes'));
      await setDoc(quizRef, {
        title: activatingTemplate.title,
        week: activatingTemplate.week,
        templateId: activatingTemplate.id,
        footerPrompt: activatingTemplate.footerPrompt || '',
        status: 'draft',
        questions: activatingTemplate.questions,
        deadlineAt: deadlineInput ? new Date(deadlineInput) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMessage(`✅ "${activatingTemplate.title}" 이번 주 퀴즈로 활성화 완료`);
      setActivatingTemplateId(null);
      setDeadlineInput('');
      await loadQuizzes();
      setSelectedQuizId(quizRef.id);
    } catch (error) {
      console.error('퀴즈 활성화 실패:', error);
      setMessage(`❌ 퀴즈 활성화 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateForm = async quiz => {
    const accessToken = getGoogleAccessToken();
    if (!accessToken) {
      setMessage('❌ Google 로그인 세션이 없습니다. 다시 로그인해주세요.');
      setNeedsReauth(true);
      return;
    }

    try {
      setLoading(true);
      setNeedsReauth(false);
      setMessage('Form 생성 중...');
      const description = quiz.deadlineAt ? `마감: ${formatDateTime(quiz.deadlineAt)}까지 제출해주세요.` : undefined;
      const result = await createQuizForm({
        title: quiz.title,
        description,
        questions: quiz.questions,
        footerPrompt: quiz.footerPrompt,
        accessToken
      });
      await updateDoc(doc(db, 'terms', termId, 'quizzes', quiz.id), {
        formId: result.formId,
        responderUri: result.responderUri,
        editUri: result.editUri,
        studentIdQuestionId: result.studentIdQuestionId,
        nameQuestionId: result.nameQuestionId,
        classQuestionId: result.classQuestionId,
        questionIdByOrder: result.questionIdByOrder,
        footerQuestionId: result.footerQuestionId,
        status: 'form_created',
        updatedAt: new Date()
      });
      await loadQuizzes();
      setMessage('✅ Google Form 생성 완료. 링크를 학생에게 공유하세요.');
    } catch (error) {
      console.error('Form 생성 실패:', error);
      setMessage(`❌ Form 생성 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCollectAndGrade = async quiz => {
    const accessToken = getGoogleAccessToken();
    if (!accessToken) {
      setMessage('❌ Google 로그인 세션이 없습니다. 다시 로그인해주세요.');
      setNeedsReauth(true);
      return;
    }

    try {
      setLoading(true);
      setNeedsReauth(false);
      const rawResponses = await listQuizResponses({ formId: quiz.formId, accessToken });

      // 같은 학번으로 중복 제출한 경우, 가장 마지막(최신) 제출만 채점 대상으로 남긴다.
      const latestByStudentKey = new Map();
      for (const r of rawResponses) {
        const key = extractAnswerText(r.answers, quiz.studentIdQuestionId).trim();
        const existing = latestByStudentKey.get(key);
        if (!existing || (r.lastSubmittedTime || '') > (existing.lastSubmittedTime || '')) {
          latestByStudentKey.set(key, r);
        }
      }
      const dedupedResponses = Array.from(latestByStudentKey.values());
      const skipped = rawResponses.length - dedupedResponses.length;

      setGradingProgress({ done: 0, total: dedupedResponses.length });

      for (let i = 0; i < dedupedResponses.length; i += 1) {
        const r = dedupedResponses[i];
        const rawStudentId = extractAnswerText(r.answers, quiz.studentIdQuestionId).trim();
        const rawName = extractAnswerText(r.answers, quiz.nameQuestionId).trim();
        const feedback = quiz.footerQuestionId ? extractAnswerText(r.answers, quiz.footerQuestionId) : '';
        const enrollment = enrollmentsById.get(rawStudentId);

        const grading = [];
        for (const question of quiz.questions) {
          const qId = quiz.questionIdByOrder?.[question.order];
          const rawAnswer = extractAnswerText(r.answers, qId);

          if (question.type === 'mc') {
            const autoScore = extractAutoGrade(r.answers, qId);
            const score =
              autoScore != null
                ? autoScore
                : rawAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()
                  ? question.points
                  : 0;
            grading.push({ questionOrder: question.order, score, maxScore: question.points, source: 'forms_auto', rawAnswer });
          } else {
            const graded = await gradeDescriptiveAnswer({
              prompt: question.prompt,
              rubric: question.rubric,
              studentAnswer: rawAnswer,
              maxPoints: question.points
            });
            grading.push({
              questionOrder: question.order,
              score: graded.score,
              maxScore: question.points,
              source: 'gemini',
              rationale: graded.rationale,
              rawAnswer
            });
          }
        }

        const aiTotalScore = grading.reduce((sum, g) => sum + g.score, 0);
        const responseId = enrollment ? enrollment.studentId : `unmatched-${r.responseId}`;

        await setDoc(doc(db, 'terms', termId, 'quizzes', quiz.id, 'responses', responseId), {
          studentId: enrollment ? enrollment.studentId : null,
          rawStudentIdInput: rawStudentId,
          name: enrollment ? enrollment.name : rawName,
          studentClass: enrollment?.studentClass ?? null,
          group: enrollment?.group ?? null,
          grading,
          feedback,
          aiTotalScore,
          finalScore: aiTotalScore,
          needsReview: !enrollment,
          reviewed: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        setGradingProgress({ done: i + 1, total: dedupedResponses.length });
      }

      await updateDoc(doc(db, 'terms', termId, 'quizzes', quiz.id), { status: 'graded', updatedAt: new Date() });
      await loadQuizzes();
      await loadResponses(quiz.id);
      setMessage(
        `✅ ${dedupedResponses.length}건 채점 완료` +
          (skipped > 0 ? ` (중복 제출 ${skipped}건은 최신 제출로 대체됨)` : '')
      );
    } catch (error) {
      console.error('채점 실패:', error);
      setMessage(`❌ 채점 실패: ${error.message}`);
    } finally {
      setGradingProgress(null);
      setLoading(false);
    }
  };

  const handleFinalScoreBlur = async (response, value) => {
    const score = Number(value);
    if (!Number.isFinite(score)) return;
    try {
      await updateDoc(doc(db, 'terms', termId, 'quizzes', selectedQuizId, 'responses', response.id), {
        finalScore: score,
        updatedAt: new Date()
      });
      setResponses(prev => prev.map(r => (r.id === response.id ? { ...r, finalScore: score } : r)));
    } catch (error) {
      console.error('점수 수정 실패:', error);
      setMessage(`❌ 점수 수정 실패: ${error.message}`);
    }
  };

  const handleReconcile = async response => {
    const correctId = (reconcileInput[response.id] || '').trim();
    const enrollment = enrollmentsById.get(correctId);
    if (!enrollment) {
      setMessage(`❌ 학번 ${correctId}을(를) 찾을 수 없습니다.`);
      return;
    }

    try {
      const { id, ...rest } = response;
      await setDoc(doc(db, 'terms', termId, 'quizzes', selectedQuizId, 'responses', correctId), {
        ...rest,
        studentId: correctId,
        name: enrollment.name,
        studentClass: enrollment.studentClass,
        group: enrollment.group,
        needsReview: false,
        updatedAt: new Date()
      });
      await deleteDoc(doc(db, 'terms', termId, 'quizzes', selectedQuizId, 'responses', id));
      await loadResponses(selectedQuizId);
      setMessage(`✅ ${correctId}(으)로 재연결 완료`);
    } catch (error) {
      console.error('재연결 실패:', error);
      setMessage(`❌ 재연결 실패: ${error.message}`);
    }
  };

  const handleFinalize = async quiz => {
    if (!window.confirm(`"${quiz.title}" 채점을 확정하고 학생 총점에 반영하시겠습니까?`)) return;

    try {
      setLoading(true);
      for (const r of responses) {
        if (!r.studentId) continue;
        await addDoc(collection(db, 'terms', termId, 'scoreRecords'), {
          studentId: r.studentId,
          name: r.name,
          studentClass: r.studentClass,
          group: r.group,
          score: r.finalScore,
          reason: quiz.title,
          reasonCode: 'QUIZ',
          inputType: 'quiz',
          quizId: quiz.id,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'terms', termId, 'quizzes', quiz.id, 'responses', r.id), {
          reviewed: true,
          updatedAt: new Date()
        });
      }
      await updateDoc(doc(db, 'terms', termId, 'quizzes', quiz.id), { status: 'finalized', updatedAt: new Date() });
      await loadQuizzes();
      await loadResponses(quiz.id);
      setMessage('✅ 확정 완료. 학생 총점(실습점수 합계)에 반영되었습니다.');
    } catch (error) {
      console.error('확정 실패:', error);
      setMessage(`❌ 확정 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async quiz => {
    if (!window.confirm(`"${quiz.title}" 퀴즈를 삭제하시겠습니까? 연결된 Google Form은 휴지통으로 이동합니다.`)) return;

    try {
      setLoading(true);
      if (quiz.formId) {
        const accessToken = getGoogleAccessToken();
        if (accessToken) {
          await trashGoogleForm({ formId: quiz.formId, accessToken });
        } else {
          setMessage('⚠️ Google 로그인 세션이 없어 Form은 그대로 남고 앱 기록만 삭제됩니다.');
        }
      }
      await deleteDoc(doc(db, 'terms', termId, 'quizzes', quiz.id));
      if (selectedQuizId === quiz.id) setSelectedQuizId(null);
      await loadQuizzes();
      setMessage('✅ 퀴즈 삭제 완료.');
    } catch (error) {
      console.error('퀴즈 삭제 실패:', error);
      setMessage(`❌ 퀴즈 삭제 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, successMessage = '✅ 복사 완료') => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage('❌ 복사 실패: 브라우저 권한을 확인하세요.');
    }
  };

  const buildGradingPrompt = quiz => {
    const answerLines = quiz.questions
      .map(q =>
        q.type === 'mc'
          ? `${q.order}번 정답(객관식, 배점 ${q.points}점): ${q.correctAnswer}`
          : `${q.order}번 정답 기준(서술형, 배점 ${q.points}점, 부분점수 가능): ${q.rubric}`
      )
      .join('\n');

    return [
      '임상병리과 학생 미생물학 퀴즈 채점',
      `[퀴즈] ${quiz.title}`,
      '',
      '지금 열려 있는 스프레드시트는 이 퀴즈의 Google Forms 응답입니다. (열 순서: 타임스탬프, 학번, 성명, 반, 문항1, 문항2, ...)',
      '한 학생이 2번 이상 응답한 경우, 가장 마지막(아래쪽) 응답만 채점하고 이전 응답은 무시하세요.',
      '',
      '[정답]',
      answerLines,
      '',
      '[채점 요청]',
      '- 각 학생 행마다 문항별 점수와 총점 열을 오른쪽에 추가해서 채워주세요.',
      '- 객관식은 정답과 실질적으로 같은 의미면 만점, 아니면 0점으로 이분 채점하세요.',
      '- 서술형은 정답 기준의 핵심 요지가 답안에 얼마나 담겼는지에 비례해 0점~배점 사이로 부분점수를 매기세요.',
      '- 오탈자가 있거나 서술형에서 감점이 있는 경우, 학생들에게 피드백할 수 있도록 학번/이름/문항/감점 사유를 별도 표로 정리해주세요.',
      quiz.footerPrompt
        ? `- "${quiz.footerPrompt}" 문항은 채점하지 말고, 반/학번/이름과 함께 별도 목록(새 시트 또는 하단)으로 정리해주세요.`
        : null
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyGradingPrompt = quiz => {
    copyToClipboard(buildGradingPrompt(quiz), '✅ 채점용 프롬프트 복사 완료. Sheet를 연 상태에서 Gemini 사이드 패널에 붙여넣으세요.');
  };

  const handleReauthClick = async () => {
    try {
      setLoading(true);
      await reauthorizeGoogle();
      setNeedsReauth(false);
      setMessage('✅ Google 인증을 다시 받았습니다. 방금 누른 버튼을 다시 클릭해주세요.');
    } catch (error) {
      console.error('재인증 실패:', error);
      setMessage(`❌ 재인증 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="quiz-tab">
      <div className="quiz-list-panel">
        <div className="quiz-list-header">
          <h3>📄 퀴즈 템플릿</h3>
          <button className="btn btn-secondary" onClick={showTemplateForm ? closeTemplateForm : openNewTemplateForm}>
            {showTemplateForm ? '접기' : '+ 템플릿 만들기'}
          </button>
        </div>

        {showTemplateForm && (
          <div className="quiz-create-form">
            <div className="quiz-create-form-header">
              <h4>{editingTemplateId ? '템플릿 수정' : '새 템플릿 만들기'}</h4>
              <button className="btn-small" onClick={closeTemplateForm}>취소</button>
            </div>
            <p className="note">
              학번/성명 입력란은 Form 생성 시 자동으로 맨 앞에 추가됩니다. 아래 문항은 최대 {MAX_QUESTIONS}개까지
              등록할 수 있습니다.
            </p>

            <div className="form-group">
              <label>퀴즈 제목</label>
              <input
                type="text"
                placeholder="예: [3주차 점검] Neisseria Moraxella 동정"
                value={templateTitle}
                onChange={e => setTemplateTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>주차 (선택)</label>
              <input type="text" placeholder="예: 3주차" value={templateWeek} onChange={e => setTemplateWeek(e.target.value)} />
            </div>

            <div className="question-rows">
              {questionRows.map((row, index) => (
                <div key={index} className="question-row">
                  <div className="question-row-header">
                    <span>{row.order}번 문항</span>
                    <button className="btn-small btn-delete" onClick={() => removeRow(index)} disabled={questionRows.length <= 1}>
                      삭제
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="문항 내용"
                    value={row.prompt}
                    onChange={e => updateRow(index, { prompt: e.target.value })}
                  />
                  <div className="question-row-fields">
                    <select value={row.type} onChange={e => updateRow(index, { type: e.target.value })}>
                      <option value="mc">객관식(자동채점)</option>
                      <option value="short">단답형(AI채점)</option>
                      <option value="paragraph">서술형(AI채점)</option>
                    </select>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={row.points}
                      onChange={e => updateRow(index, { points: e.target.value })}
                      placeholder="배점"
                    />
                  </div>
                  {row.type === 'mc' ? (
                    <input
                      type="text"
                      placeholder="정답"
                      value={row.correctAnswer}
                      onChange={e => updateRow(index, { correctAnswer: e.target.value })}
                    />
                  ) : (
                    <textarea
                      rows={2}
                      placeholder="정답 기준 (채점 시 AI가 참고)"
                      value={row.rubric}
                      onChange={e => updateRow(index, { rubric: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <button className="btn btn-secondary" onClick={addRow} disabled={questionRows.length >= MAX_QUESTIONS}>
              + 문항 추가 ({questionRows.length}/{MAX_QUESTIONS})
            </button>

            <div className="form-group">
              <label>마무리 질문 (선택, 0점 · 수정 가능)</label>
              <textarea rows={2} value={footerPrompt} onChange={e => setFooterPrompt(e.target.value)} />
            </div>

            <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={loading}>
              {editingTemplateId ? '템플릿 수정 저장' : '템플릿으로 저장'}
            </button>
          </div>
        )}

        <div className="quiz-list">
          {templates.map(t => (
            <div key={t.id} className="template-list-item">
              <div className="template-item-main">
                <span className="quiz-item-title">{t.title}</span>
                <span className="template-item-meta">{t.week} · {t.questions?.length ?? 0}문항</span>
              </div>
              <div className="template-item-actions">
                <button className="btn-small" onClick={() => setActivatingTemplateId(t.id)}>
                  이번 주 퀴즈로 활성화
                </button>
                <button className="btn-small" onClick={() => startEditTemplate(t)}>
                  수정
                </button>
                <button className="btn-small btn-delete" onClick={() => handleDeleteTemplate(t)}>
                  삭제
                </button>
              </div>

              {activatingTemplateId === t.id && (
                <div className="activate-row">
                  <label>마감(기록용, 선택)</label>
                  <input type="datetime-local" value={deadlineInput} onChange={e => setDeadlineInput(e.target.value)} />
                  <button className="btn-small btn-primary" onClick={handleConfirmActivate} disabled={loading}>
                    확정
                  </button>
                  <button className="btn-small" onClick={() => setActivatingTemplateId(null)}>
                    취소
                  </button>
                </div>
              )}
            </div>
          ))}
          {templates.length === 0 && <p className="note">저장된 템플릿이 없습니다. 위에서 먼저 만드세요.</p>}
        </div>

        <div className="quiz-list-header quiz-list-header-secondary">
          <h3>🗓️ 이번 학기 퀴즈</h3>
        </div>
        <div className="quiz-list">
          {quizzes.map(q => (
            <div key={q.id} className="quiz-list-row">
              <button
                className={`quiz-list-item ${selectedQuizId === q.id ? 'active' : ''}`}
                onClick={() => setSelectedQuizId(q.id)}
              >
                <span className="quiz-item-title">{q.title}</span>
                <span className={`quiz-status-badge status-${q.status}`}>{STATUS_LABEL[q.status] || q.status}</span>
              </button>
              <button className="btn-small btn-delete" onClick={() => handleDeleteQuiz(q)} disabled={loading}>
                삭제
              </button>
            </div>
          ))}
          {quizzes.length === 0 && <p className="note">아직 활성화된 퀴즈가 없습니다.</p>}
        </div>
      </div>

      <div className="quiz-detail-panel">
        {!selectedQuiz && <p className="note">템플릿을 활성화하거나 왼쪽에서 퀴즈를 선택하세요.</p>}

        {selectedQuiz && (
          <>
            <div className="quiz-detail-header">
              <h3>{selectedQuiz.title}</h3>
              <span className={`quiz-status-badge status-${selectedQuiz.status}`}>
                {STATUS_LABEL[selectedQuiz.status] || selectedQuiz.status}
              </span>
            </div>

            {selectedQuiz.deadlineAt && <p className="note">⏰ 마감(기록용): {formatDateTime(selectedQuiz.deadlineAt)}</p>}

            {selectedQuiz.status === 'draft' && (
              <button className="btn btn-primary" onClick={() => handleGenerateForm(selectedQuiz)} disabled={loading}>
                {loading ? '생성 중...' : 'Google Form 생성'}
              </button>
            )}

            {selectedQuiz.status !== 'draft' && selectedQuiz.responderUri && (
              <>
                <div className="quiz-link-row">
                  <input type="text" readOnly value={selectedQuiz.responderUri} />
                  <button className="btn-small" onClick={() => copyToClipboard(selectedQuiz.responderUri, '✅ 링크 복사 완료')}>
                    복사
                  </button>
                </div>
                {qrDataUrl && (
                  <div className="quiz-qr-box">
                    <img src={qrDataUrl} alt="Form 접속 QR 코드" width={160} height={160} />
                    <p className="note">학생들이 이 QR을 스캔하면 바로 Form으로 이동합니다.</p>
                  </div>
                )}

                <div className="grading-prompt-box">
                  <p className="note">
                    Google Form 응답 탭에서 "Sheets에서 만들기"로 스프레드시트를 만든 뒤, 그 시트를 열고
                    Gemini 사이드 패널에 아래 프롬프트를 붙여넣으면 문항별 채점을 맡길 수 있습니다.
                  </p>
                  <button className="btn btn-secondary" onClick={() => handleCopyGradingPrompt(selectedQuiz)}>
                    📋 채점용 프롬프트 복사
                  </button>
                </div>
              </>
            )}

            {selectedQuiz.status === 'form_created' && (
              <button className="btn btn-primary" onClick={() => handleCollectAndGrade(selectedQuiz)} disabled={loading}>
                {loading ? '채점 중...' : '응답 수집 + 채점 시작'}
              </button>
            )}

            {gradingProgress && (
              <p className="note">채점 중... ({gradingProgress.done}/{gradingProgress.total})</p>
            )}

            {(selectedQuiz.status === 'graded' || selectedQuiz.status === 'finalized') && (
              <div className="quiz-responses">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>학번</th>
                      <th>이름</th>
                      <th>AI 총점</th>
                      <th>확정 점수</th>
                      <th>근거</th>
                      <th>의견</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map(r => (
                      <tr key={r.id} className={r.needsReview ? 'row-needs-review' : ''}>
                        <td>
                          {r.studentId || (
                            <div className="reconcile-row">
                              <span>미매칭 ({r.rawStudentIdInput})</span>
                              <input
                                type="text"
                                placeholder="정확한 학번"
                                value={reconcileInput[r.id] || ''}
                                onChange={e => setReconcileInput(prev => ({ ...prev, [r.id]: e.target.value }))}
                              />
                              <button className="btn-small" onClick={() => handleReconcile(r)}>연결</button>
                            </div>
                          )}
                        </td>
                        <td>{r.name}</td>
                        <td>{r.aiTotalScore}</td>
                        <td>
                          <input
                            type="number"
                            step="0.5"
                            defaultValue={r.finalScore}
                            disabled={selectedQuiz.status === 'finalized'}
                            onBlur={e => handleFinalScoreBlur(r, e.target.value)}
                          />
                        </td>
                        <td className="rationale-cell">
                          {(r.grading || [])
                            .filter(g => g.rationale)
                            .map(g => g.rationale)
                            .join(' / ')}
                        </td>
                        <td className="rationale-cell">{r.feedback || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedQuiz.status === 'graded' && (
                  <button className="btn btn-primary" onClick={() => handleFinalize(selectedQuiz)} disabled={loading}>
                    확정 (학생 총점에 반영)
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {message && (
          <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>
            {message}
            {needsReauth && (
              <button className="btn-small btn-primary" onClick={handleReauthClick} disabled={loading}>
                🔑 Google 다시 로그인
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
