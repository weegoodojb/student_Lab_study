const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

async function callFormsApi(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Forms API 오류 (${response.status}): ${body}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function buildIdentificationItems() {
  return ['학번', '성명', '반'].map((title, index) => ({
    createItem: {
      item: {
        title,
        questionItem: { question: { required: true, textQuestion: { paragraph: false } } }
      },
      location: { index }
    }
  }));
}

function buildQuestionItem(question, index, offset) {
  const isObjective = question.type === 'mc';
  const questionBody = {
    required: true,
    textQuestion: { paragraph: question.type === 'paragraph' }
  };

  if (isObjective) {
    questionBody.grading = {
      pointValue: question.points,
      correctAnswers: { answers: [{ value: question.correctAnswer }] }
    };
  }

  return {
    createItem: {
      item: {
        title: question.prompt,
        questionItem: { question: questionBody }
      },
      location: { index: index + offset } // after 학번/성명/반
    }
  };
}

function buildFooterItem(footerPrompt, index) {
  return {
    createItem: {
      item: {
        title: footerPrompt,
        questionItem: { question: { required: false, textQuestion: { paragraph: true } } }
      },
      location: { index }
    }
  };
}

export async function createQuizForm({ title, description, questions, footerPrompt, accessToken }) {
  const created = await callFormsApi(FORMS_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify({ info: { title } })
  });

  const formId = created.formId;

  const prefixRequests = [
    {
      updateSettings: {
        settings: { quizSettings: { isQuiz: true } },
        updateMask: 'quizSettings.isQuiz'
      }
    },
    // forms.create's info.title only sets the Drive file name, not the heading respondents
    // see on the form itself (which defaults to "제목 없는 설문지") - that needs its own
    // updateFormInfo request.
    {
      updateFormInfo: {
        info: description ? { title, description } : { title },
        updateMask: description ? 'title,description' : 'title'
      }
    }
  ];
  const identRequests = buildIdentificationItems();
  const identCount = identRequests.length;
  const questionRequests = questions.map((q, idx) => buildQuestionItem(q, idx, identCount));
  const footerRequests = footerPrompt
    ? [buildFooterItem(footerPrompt, questions.length + identCount)]
    : [];

  const requests = [...prefixRequests, ...identRequests, ...questionRequests, ...footerRequests];

  const updated = await callFormsApi(`${FORMS_API_BASE}/${formId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requests })
  });

  const replies = updated.replies || [];
  const prefixCount = prefixRequests.length;
  const studentIdQuestionId = replies[prefixCount]?.createItem?.questionId;
  const nameQuestionId = replies[prefixCount + 1]?.createItem?.questionId;
  const classQuestionId = replies[prefixCount + 2]?.createItem?.questionId;
  const questionIdByOrder = {};
  questions.forEach((q, idx) => {
    questionIdByOrder[q.order] = replies[prefixCount + identCount + idx]?.createItem?.questionId;
  });
  const footerQuestionId = footerPrompt
    ? replies[prefixCount + identCount + questions.length]?.createItem?.questionId
    : null;

  const info = await callFormsApi(`${FORMS_API_BASE}/${formId}`, accessToken);
  await renameGoogleFormFile({ formId, name: title, accessToken });

  return {
    formId,
    responderUri: info.responderUri,
    editUri: `https://docs.google.com/forms/d/${formId}/edit`,
    studentIdQuestionId,
    nameQuestionId,
    classQuestionId,
    questionIdByOrder,
    footerQuestionId
  };
}

export async function listQuizResponses({ formId, accessToken }) {
  const responses = [];
  let pageToken;

  do {
    const url = new URL(`${FORMS_API_BASE}/${formId}/responses`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await callFormsApi(url.toString(), accessToken);
    responses.push(...(page.responses || []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return responses.map(r => ({
    responseId: r.responseId,
    answers: r.answers || {},
    lastSubmittedTime: r.lastSubmittedTime || r.createTime || null
  }));
}

export function extractAnswerText(answers, questionId) {
  const textAnswers = answers?.[questionId]?.textAnswers?.answers;
  if (!textAnswers || textAnswers.length === 0) return '';
  return textAnswers.map(a => a.value).join(', ').trim();
}

export function extractAutoGrade(answers, questionId) {
  const grade = answers?.[questionId]?.grade;
  if (!grade || typeof grade.score !== 'number') return null;
  return grade.score;
}

// Forms are Drive files under the hood, so renaming/trashing them goes through the Drive
// API (requires the drive.file scope) - the Forms API itself has no way to touch the Drive
// file name (Info.title only controls the heading respondents see, not the Drive listing).
async function patchDriveFile(formId, body, accessToken) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${formId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Drive API 오류 (${response.status}): ${text}`);
    error.status = response.status;
    throw error;
  }
}

export async function renameGoogleFormFile({ formId, name, accessToken }) {
  await patchDriveFile(formId, { name }, accessToken);
}

// Moves it to trash rather than a hard delete, so the admin can still recover it from
// Google Drive's 휴지통 if this was a mistake.
export async function trashGoogleForm({ formId, accessToken }) {
  await patchDriveFile(formId, { trashed: true }, accessToken);
}
