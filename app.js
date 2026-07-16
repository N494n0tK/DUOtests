let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let mistakes = [];
let timeLeft = 30;
let timerInterval;
const TIME_LIMIT = 30;

let combo = 0;
let maxCombo = 0;
let totalPoints = 0;
let lastTickSecond = null;

let isSuddenDeath = false;
let isPracticeMode = false;
let isClozeMode = false;
let isCustomRange = false;
let inPracticeFeedback = false;
let hasMistakedCurrent = false; 
let isShiftHeld = false;
let isQuizPaused = false;
let resumeTimerAfterPause = false;
let pausedFocusElement = null;
let clozeBlankCount = 3;
let currentCloze = null;
let answerModeSnapshot = { mode: 'full', blankCount: 3 };

let warningWords = JSON.parse(localStorage.getItem('duoTrainingWarnings')) || [];

const views = {
    setup: document.getElementById('view-setup'),
    quiz: document.getElementById('view-quiz'),
    result: document.getElementById('view-result'),
    warningDb: document.getElementById('view-warning-db')
};
const lessonSelect = document.getElementById('lesson-select');
const sectionSelect = document.getElementById('section-select');
const customRange = document.getElementById('custom-range');
const rangeStart = document.getElementById('range-start');
const rangeEnd = document.getElementById('range-end');
const rangeError = document.getElementById('range-error');
const randomCheck = document.getElementById('random-check');
const suddenDeathCheck = document.getElementById('sudden-death-check');
const practiceCheck = document.getElementById('practice-check');
const modeFull = document.getElementById('mode-full');
const modeCloze = document.getElementById('mode-cloze');
const answerModeModal = document.getElementById('answer-mode-modal');
const answerModeSettingsButton = document.getElementById('answer-mode-settings-button');
const answerModeSummary = document.getElementById('answer-mode-summary');
const clozeCountSetting = document.getElementById('cloze-count-setting');
const blankCountInput = document.getElementById('blank-count-input');
const pauseModal = document.getElementById('pause-modal');
const pauseTime = document.getElementById('pause-time');
const versionModal = document.getElementById('version-modal');
const versionButton = document.getElementById('version-button');
const versionNumber = document.getElementById('version-number');
const versionUpdatedAt = document.getElementById('version-updated-at');
const jaQuestion = document.getElementById('ja-question');
const hintText = document.getElementById('hint-text');
const clozeSentence = document.getElementById('cloze-sentence');
const fullAnswerWrapper = document.getElementById('full-answer-wrapper');
const answerInput = document.getElementById('answer-input');
const progressText = document.getElementById('progress-text');
const timeText = document.getElementById('time-text');
const timerBar = document.getElementById('timer-bar');
const popFeedback = document.getElementById('pop-feedback');
const practiceWarningCheck = document.getElementById('practice-warning-check');
const practiceWarningLabel = document.getElementById('practice-warning-label');
const practiceOverlay = document.getElementById('practice-overlay');
const practiceQuestionNumber = document.getElementById('practice-question-number');
const practiceCorrection = document.getElementById('po-correction');
const warningImportInput = document.getElementById('warning-import-input');
const warningDataStatus = document.getElementById('warning-data-status');
const comboDisplay = document.getElementById('combo-display');
const timerContainer = document.querySelector('.timer-container');
const questionWrapper = document.querySelector('.question-wrapper');
const soundToggle = document.getElementById('sound-toggle');

function questionCenter() {
    const rect = questionWrapper.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function showCombo(count) {
    if (count < 2) {
        hideCombo();
        return;
    }
    const tier = count >= 10 ? 3 : count >= 5 ? 2 : 1;
    comboDisplay.innerHTML = `<span class="combo-num">${count}</span><span class="combo-word">COMBO</span>`;
    comboDisplay.className = `combo-display show tier-${tier}`;
    comboDisplay.classList.remove('pop');
    void comboDisplay.offsetWidth;
    comboDisplay.classList.add('pop');
}

function hideCombo() {
    comboDisplay.classList.remove('show', 'pop', 'tier-1', 'tier-2', 'tier-3');
}

function flashQuestion(isCorrect) {
    questionWrapper.classList.remove('flash-good', 'flash-bad');
    void questionWrapper.offsetWidth;
    questionWrapper.classList.add(isCorrect ? 'flash-good' : 'flash-bad');
}

function animateNumber(el, target, duration, formatter) {
    const format = formatter || (v => String(v));
    const start = performance.now();
    function step(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = format(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function updateSoundToggle() {
    soundToggle.textContent = SFX.enabled ? '🔊' : '🔇';
    soundToggle.title = SFX.enabled ? '効果音 ON' : '効果音 OFF';
}

function handleModeChange(mode) {
    if (mode === 'sudden' && suddenDeathCheck.checked) {
        practiceCheck.checked = false;
    } else if (mode === 'practice' && practiceCheck.checked) {
        suddenDeathCheck.checked = false;
    }
}

function insertApostropheShortcut(event) {
    const input = event.target;
    const isBracketRight = event.key === ']' || event.code === 'BracketRight';
    const isAnswerField = input.matches?.('#answer-input, .cloze-input');

    if (!isBracketRight || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !isAnswerField) {
        return false;
    }

    event.preventDefault();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText("'", start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function formatUpdatedAt(dateText) {
    const [year, month, day] = dateText.split('-').map(Number);
    return `${year}年${month}月${day}日`;
}

function openVersionModal() {
    versionNumber.textContent = `Ver.${APP_META.version}`;
    versionUpdatedAt.textContent = formatUpdatedAt(APP_META.updatedAt);
    versionModal.hidden = false;
    document.getElementById('version-close-button').focus();
}

function closeVersionModal() {
    versionModal.hidden = true;
    versionButton.focus();
}

function init() {
    updateLessonSelect();
    updateSections();
    const totalQuestions = getAllQuestions().length;
    rangeStart.max = totalQuestions;
    rangeEnd.max = totalQuestions;
    rangeEnd.value = totalQuestions;
    document.getElementById('range-help').textContent = `AVAILABLE: 1 - ${totalQuestions}`;
    
    lessonSelect.addEventListener('change', updateSections);
    [rangeStart, rangeEnd].forEach(input => {
        input.addEventListener('input', clearRangeError);
    });
    answerModeSettingsButton.addEventListener('click', openAnswerModeModal);
    modeFull.addEventListener('change', updateAnswerModeModal);
    modeCloze.addEventListener('change', updateAnswerModeModal);
    document.getElementById('answer-mode-confirm').addEventListener('click', confirmAnswerMode);
    document.getElementById('answer-mode-cancel').addEventListener('click', closeAnswerModeModal);
    blankCountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            confirmAnswerMode();
        }
    });
    document.getElementById('pause-resume-button').addEventListener('click', resumeQuiz);
    document.getElementById('pause-quit-button').addEventListener('click', quitQuizFromPause);
    versionButton.addEventListener('click', openVersionModal);
    document.getElementById('version-close-button').addEventListener('click', closeVersionModal);
    versionModal.addEventListener('click', (e) => {
        if (e.target === versionModal) closeVersionModal();
    });
    practiceWarningCheck.addEventListener('change', () => {
        const question = currentQuestions[currentIndex];
        if (!question) return;
        toggleWarning(question.en, question.ja, practiceWarningCheck.checked);
        updatePracticeWarningLabel();
    });
    document.getElementById('warning-export-button').addEventListener('click', exportWarningData);
    document.getElementById('warning-import-button').addEventListener('click', () => warningImportInput.click());
    warningImportInput.addEventListener('change', importWarningData);
    updateSoundToggle();
    soundToggle.addEventListener('click', () => {
        SFX.toggle();
        updateSoundToggle();
        SFX.play('click');
    });
    document.addEventListener('click', (e) => {
        if (e.target.closest('button:not(#sound-toggle), .mode-option, .duo-check')) SFX.play('click');
    });

    document.addEventListener('keydown', (e) => {
        if (insertApostropheShortcut(e)) return;
        if (e.key === 'Shift') {
            isShiftHeld = true;
            setPracticeCorrectionMode(true);
            return;
        }
        if (!versionModal.hidden) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeVersionModal();
            }
            return;
        }
        if (!answerModeModal.hidden) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeAnswerModeModal();
            }
            return;
        }
        if (!pauseModal.hidden) {
            if (e.key === 'Enter') {
                e.preventDefault();
                quitQuizFromPause();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                resumeQuiz();
            }
            return;
        }
        if ((e.key === ' ' || e.code === 'Space') && inPracticeFeedback && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            practiceWarningCheck.checked = !practiceWarningCheck.checked;
            practiceWarningCheck.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        if (e.key === 'Escape' && views.quiz.classList.contains('active')) {
            e.preventDefault();
            openPauseModal();
            return;
        }
        if (e.key === 'Enter') {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return; 
            if (inPracticeFeedback) {
                e.preventDefault();
                hidePracticeFeedback();
                return;
            }
            if (views.setup.classList.contains('active')) {
                e.preventDefault();
                startQuiz();
            } else if (views.result.classList.contains('active') || views.warningDb.classList.contains('active')) {
                e.preventDefault();
                backToTitle();
            } else if (views.quiz.classList.contains('active')) {
                e.preventDefault();
                submitAnswer();
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            isShiftHeld = false;
            setPracticeCorrectionMode(false);
        }
    });
    window.addEventListener('blur', () => {
        isShiftHeld = false;
        setPracticeCorrectionMode(false);
    });
}

function updateAnswerModeModal() {
    clozeCountSetting.hidden = !modeCloze.checked;
}

function openAnswerModeModal() {
    answerModeSnapshot = {
        mode: modeCloze.checked ? 'cloze' : 'full',
        blankCount: clozeBlankCount
    };
    blankCountInput.value = clozeBlankCount;
    blankCountInput.setCustomValidity('');
    updateAnswerModeModal();
    answerModeModal.hidden = false;
    requestAnimationFrame(() => {
        if (modeCloze.checked) blankCountInput.select();
        else modeFull.focus();
    });
}

function closeAnswerModeModal() {
    modeFull.checked = answerModeSnapshot.mode === 'full';
    modeCloze.checked = answerModeSnapshot.mode === 'cloze';
    clozeBlankCount = answerModeSnapshot.blankCount;
    answerModeModal.hidden = true;
}

function confirmAnswerMode() {
    if (modeCloze.checked) {
        const count = Number(blankCountInput.value);
        if (!Number.isSafeInteger(count) || count < 1) {
            blankCountInput.setCustomValidity('1以上の整数を入力してください。');
            blankCountInput.reportValidity();
            return;
        }
        blankCountInput.setCustomValidity('');
        clozeBlankCount = count;
        answerModeSummary.textContent = `穴埋め / ${count} ${count === 1 ? 'BLANK' : 'BLANKS'}`;
    } else {
        answerModeSummary.textContent = '全文入力';
    }
    answerModeModal.hidden = true;
    answerModeSettingsButton.focus();
}

function saveWarnings() {
    localStorage.setItem('duoTrainingWarnings', JSON.stringify(warningWords));
    updateLessonSelect();
}

function setWarningDataStatus(message, isError = false) {
    warningDataStatus.textContent = message;
    warningDataStatus.classList.toggle('error', isError);
}

function exportWarningData() {
    const saveData = {
        format: 'duo3-warning-save',
        version: 1,
        exportedAt: new Date().toISOString(),
        warnings: warningWords.map(word => ({
            number: getGlobalQuestionNumber(word),
            ja: word.ja,
            en: word.en
        }))
    };
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duo3-warning-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setWarningDataStatus(`${warningWords.length}件のセーブデータを書き出しました。`);
}

function getWarningsFromSaveData(data) {
    const records = Array.isArray(data) ? data : data?.warnings;
    if (!Array.isArray(records)) throw new Error('セーブデータの形式が正しくありません。');

    const allQuestions = getAllQuestions();
    const restored = [];
    records.forEach(record => {
        if (!record || typeof record !== 'object') return;
        const number = Number(record.number);
        let question = null;

        if (Number.isSafeInteger(number) && number >= 1 && number <= allQuestions.length) {
            const numberedQuestion = allQuestions[number - 1];
            if (!record.en || record.en === numberedQuestion.en) question = numberedQuestion;
        }
        if (!question && typeof record.en === 'string') {
            question = allQuestions.find(item => item.en === record.en) || null;
        }
        if (question && !restored.some(item => item.en === question.en)) {
            restored.push({ ja: question.ja, en: question.en });
        }
    });

    if (records.length > 0 && restored.length === 0) {
        throw new Error('現在の問題集と一致するデータがありません。');
    }
    return restored;
}

async function importWarningData(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const data = JSON.parse(await file.text());
        const restored = getWarningsFromSaveData(data);
        if (!window.confirm(`現在のWARNING DATABASEを${restored.length}件のセーブデータで置き換えます。`)) return;

        warningWords = restored;
        saveWarnings();
        openWarningDB();
        setWarningDataStatus(`${restored.length}件を読み込みました。`);
    } catch (error) {
        setWarningDataStatus(error.message || 'セーブデータを読み込めませんでした。', true);
    } finally {
        warningImportInput.value = '';
    }
}

function toggleWarning(en, ja, isChecked) {
    if (isChecked) {
        if (!warningWords.some(w => w.en === en)) warningWords.push({ ja, en });
    } else {
        warningWords = warningWords.filter(w => w.en !== en);
    }
    saveWarnings();
}

function updatePracticeWarningLabel() {
    practiceWarningLabel.textContent = practiceWarningCheck.checked
        ? 'WARNING DATABASE に登録済み'
        : 'WARNING DATABASE に登録';
}

function updateLessonSelect() {
    const currentVal = lessonSelect.value;
    lessonSelect.innerHTML = `
        <option value="All">GLOBAL // 全範囲から出題</option>
        <option value="Custom">CUSTOM RANGE // 番号で範囲指定</option>
    `;
    
    if (warningWords.length > 0) {
        const warningOpt = document.createElement('option');
        warningOpt.value = 'Warning';
        warningOpt.textContent = `⚠️ WARNING // 要注意リスト (${warningWords.length}件)`;
        lessonSelect.appendChild(warningOpt);
    }

    Object.keys(wordData).forEach(lesson => {
        const option = document.createElement('option');
        option.value = lesson;
        option.textContent = `TARGET: ${lesson}`;
        lessonSelect.appendChild(option);
    });

    if (Array.from(lessonSelect.options).some(opt => opt.value === currentVal)) {
        lessonSelect.value = currentVal;
    } else {
        lessonSelect.value = 'All';
    }
}

function updateSections() {
    const lesson = lessonSelect.value;
    const hasSectionChoices = !['All', 'Warning', 'Custom'].includes(lesson);
    sectionSelect.innerHTML = '';
    sectionSelect.hidden = !hasSectionChoices;
    customRange.hidden = lesson !== 'Custom';
    clearRangeError();
    
    if (!hasSectionChoices) {
        sectionSelect.innerHTML = '<option value="All">---</option>';
        sectionSelect.disabled = true;
    } else {
        sectionSelect.disabled = false;
        const sections = Object.keys(wordData[lesson]);
        sections.forEach(sec => {
            const option = document.createElement('option');
            option.value = sec;
            option.textContent = sec;
            sectionSelect.appendChild(option);
        });
    }
}

function getAllQuestions() {
    const questions = [];
    Object.keys(wordData).forEach(lesson => {
        Object.keys(wordData[lesson]).forEach(section => {
            wordData[lesson][section].forEach(question => {
                questions.push({ ...question, globalNumber: questions.length + 1 });
            });
        });
    });
    return questions;
}

function clearRangeError() {
    rangeError.textContent = '';
    customRange.classList.remove('has-error');
}

function getCustomQuestions() {
    const allQuestions = getAllQuestions();
    const start = Number(rangeStart.value);
    const end = Number(rangeEnd.value);

    if (!Number.isSafeInteger(start) || start < 1 || start > allQuestions.length) {
        rangeError.textContent = `STARTは1〜${allQuestions.length}の整数で入力してください。`;
        customRange.classList.add('has-error');
        rangeStart.focus();
        return null;
    }
    if (!Number.isSafeInteger(end) || end < 1 || end > allQuestions.length) {
        rangeError.textContent = `ENDは1〜${allQuestions.length}の整数で入力してください。`;
        customRange.classList.add('has-error');
        rangeEnd.focus();
        return null;
    }
    if (start > end) {
        rangeError.textContent = 'STARTはEND以下の番号にしてください。';
        customRange.classList.add('has-error');
        rangeStart.focus();
        return null;
    }

    return allQuestions.slice(start - 1, end);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getCleanWord(enText) {
    if(!enText) return '';
    let clean = enText.replace(/[.,?!"':;—\-～~…]/g, ' ');
    return clean.replace(/\s+/g, ' ').trim().toLowerCase();
}

const COMMON_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
    'come', 'did', 'do', 'does', 'for', 'from', 'get', 'give', 'go', 'had', 'has', 'have', 'he',
    'her', 'hers', 'him', 'his',
    'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or',
    'our', 'ours', 'say', 'see', 'she', 'so', 'take', 'tell', 'than', 'that', 'the', 'their', 'them',
    'there', 'they', 'think', 'this', 'those', 'to', 'too', 'up', 'us', 'want', 'was', 'we', 'were',
    'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'make', 'must', 'you',
    'your', 'yours'
]);

function getDifficultyWeight(word) {
    const normalized = word.toLowerCase().replace(/[’]/g, "'");
    const baseWord = normalized.replace(/'s$|n't$|'re$|'ve$|'ll$|'d$|'m$/g, '');
    let weight = COMMON_WORDS.has(baseWord) ? 0.12 : 1.2;

    weight += Math.max(0, baseWord.length - 4) * 0.32;
    if (baseWord.length >= 9) weight += 1.1;
    if (/(tion|sion|ment|ness|ity|ous|ive|ical|ology|graphy|ence|ance|ize|ise)$/.test(baseWord)) weight += 0.9;
    if (/^[A-Z]/.test(word) && baseWord.length > 3) weight += 0.25;
    return Math.max(0.1, weight);
}

function selectWeightedWords(candidates, count) {
    const pool = [...candidates];
    const selected = [];

    while (selected.length < count && pool.length > 0) {
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        let target = Math.random() * totalWeight;
        let selectedIndex = pool.length - 1;

        for (let i = 0; i < pool.length; i++) {
            target -= pool[i].weight;
            if (target <= 0) {
                selectedIndex = i;
                break;
            }
        }
        selected.push(pool.splice(selectedIndex, 1)[0]);
    }

    return selected.sort((a, b) => a.start - b.start);
}

function createClozeQuestion(sentence, requestedCount) {
    const candidates = Array.from(sentence.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g), match => ({
        start: match.index,
        end: match.index + match[0].length,
        answer: match[0],
        weight: getDifficultyWeight(match[0])
    }));
    const count = Math.min(requestedCount, candidates.length);
    return {
        blanks: selectWeightedWords(candidates, count),
        wordCount: candidates.length
    };
}

function renderClozeQuestion(sentence) {
    clozeSentence.replaceChildren();
    let cursor = 0;

    currentCloze.blanks.forEach((blank, index) => {
        clozeSentence.append(document.createTextNode(sentence.slice(cursor, blank.start)));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cloze-input';
        input.dataset.clozeIndex = index;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', `空欄 ${index + 1}`);
        input.style.setProperty('--blank-width', `${Math.min(190, Math.max(80, blank.answer.length * 13 + 30))}px`);
        clozeSentence.append(input);
        cursor = blank.end;
    });
    clozeSentence.append(document.createTextNode(sentence.slice(cursor)));
}

function getClozeUserAnswer(sentence) {
    let result = '';
    let cursor = 0;
    const inputs = clozeSentence.querySelectorAll('.cloze-input');

    currentCloze.blanks.forEach((blank, index) => {
        result += sentence.slice(cursor, blank.start);
        result += inputs[index].value.trim();
        cursor = blank.end;
    });
    return result + sentence.slice(cursor);
}

function clearCurrentAnswer() {
    if (isClozeMode) {
        clozeSentence.querySelectorAll('.cloze-input').forEach(input => { input.value = ''; });
        clozeSentence.querySelector('.cloze-input')?.focus();
    } else {
        answerInput.value = '';
        answerInput.focus();
    }
}

function escapeHtml(str) {
    if(!str) return '';
    return str.replace(/[&'`"<>]/g, function(match) {
        return { '&': '&amp;', "'": '&#x27;', '`': '&#x60;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[match];
    });
}

function tokenize(text) {
    return text.split(/([\s.,?!'":;—\-]+)/).filter(t => t.length > 0);
}

function getWordDiffHTML(correct, user) {
    if (!user) user = "";
    const cArr = tokenize(correct);
    const uArr = tokenize(user);
    
    const dp = Array(cArr.length + 1).fill(null).map(() => Array(uArr.length + 1).fill(0));
    
    for (let i = 1; i <= cArr.length; i++) {
        for (let j = 1; j <= uArr.length; j++) {
            if (cArr[i - 1] === uArr[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    let i = cArr.length, j = uArr.length;
    let cHTML = "", uHTML = "";
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && cArr[i - 1] === uArr[j - 1]) {
            cHTML = escapeHtml(cArr[i - 1]) + cHTML;
            uHTML = escapeHtml(uArr[j - 1]) + uHTML;
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            const val = escapeHtml(uArr[j - 1]);
            if (uArr[j - 1].trim().length > 0) {
                uHTML = `<span class="diff-wrong">${val}</span>` + uHTML;
            } else {
                uHTML = val + uHTML;
            }
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            const val = escapeHtml(cArr[i - 1]);
            if (cArr[i - 1].trim().length > 0) {
                cHTML = `<span class="diff-missing">${val}</span>` + cHTML;
            } else {
                cHTML = val + cHTML;
            }
            i--;
        }
    }
    return { cHTML, uHTML };
}

function getCorrectionHTML(correct, user) {
    const correctWords = correct.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || [];
    const userWords = user.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || [];
    const dp = Array(correctWords.length + 1).fill(null)
        .map(() => Array(userWords.length + 1).fill(0));

    for (let i = 0; i <= correctWords.length; i++) dp[i][0] = i;
    for (let j = 0; j <= userWords.length; j++) dp[0][j] = j;

    for (let i = 1; i <= correctWords.length; i++) {
        for (let j = 1; j <= userWords.length; j++) {
            if (correctWords[i - 1].toLowerCase() === userWords[j - 1].toLowerCase()) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 1
                );
            }
        }
    }

    const edits = [];
    let i = correctWords.length;
    let j = userWords.length;

    while (i > 0 || j > 0) {
        const correctWord = correctWords[i - 1];
        const userWord = userWords[j - 1];
        if (i > 0 && j > 0 && correctWord.toLowerCase() === userWord.toLowerCase()) {
            edits.push(escapeHtml(userWord));
            i--; j--;
        } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            edits.push(`<del class="correction-delete">${escapeHtml(userWord)}</del>`);
            j--;
        } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            edits.push(`<ins class="correction-insert">${escapeHtml(correctWord)}</ins>`);
            i--;
        } else {
            edits.push(`<span class="correction-replace"><del>${escapeHtml(userWord)}</del><ins>${escapeHtml(correctWord)}</ins></span>`);
            i--; j--;
        }
    }

    return edits.reverse().join(' ');
}

function getGlobalQuestionNumber(question) {
    if (question.globalNumber) return question.globalNumber;
    const index = getAllQuestions().findIndex(item => item.en === question.en && item.ja === question.ja);
    return index >= 0 ? index + 1 : currentIndex + 1;
}

function setPracticeCorrectionMode(active) {
    practiceOverlay.classList.toggle('correction-mode', active && inPracticeFeedback);
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

function startQuiz() {
    const lesson = lessonSelect.value;
    const section = sectionSelect.value;
    const isRandom = randomCheck.checked;
    isSuddenDeath = suddenDeathCheck.checked;
    isPracticeMode = practiceCheck.checked;
    isClozeMode = modeCloze.checked;
    isCustomRange = lesson === 'Custom';
    
    currentQuestions = [];
    
    if (lesson === 'Custom') {
        const customQuestions = getCustomQuestions();
        if (!customQuestions) return;
        currentQuestions = customQuestions;
    } else if (lesson === 'Warning') {
        if (warningWords.length === 0) {
            alert("要注意リストが登録されていません！");
            return;
        }
        currentQuestions = [...warningWords];
    } else if (lesson === 'All') {
        currentQuestions = getAllQuestions();
    } else {
        currentQuestions = [...wordData[lesson][section]];
    }
    
    if (isRandom) shuffleArray(currentQuestions);
    
    currentIndex = 0;
    score = 0;
    mistakes = [];
    combo = 0;
    maxCombo = 0;
    totalPoints = 0;
    hideCombo();

    SFX.play('start');
    switchView('quiz');
    loadQuestion();
}

function loadQuestion() {
    const q = currentQuestions[currentIndex];
    const cleanEn = getCleanWord(q.en);
    const wordCount = cleanEn.split(' ').length;

    progressText.textContent = isCustomRange
        ? `NO. ${q.globalNumber} // ${currentIndex + 1} / ${currentQuestions.length}`
        : `SEQ. ${currentIndex + 1} / ${currentQuestions.length}`;
    jaQuestion.textContent = q.ja;
    fullAnswerWrapper.hidden = isClozeMode;
    clozeSentence.classList.toggle('active', isClozeMode);

    if (isClozeMode) {
        currentCloze = createClozeQuestion(q.en, clozeBlankCount);
        renderClozeQuestion(q.en);
        hintText.textContent = `[ ${currentCloze.blanks.length} BLANKS / ${currentCloze.wordCount} WORDS ]`;
    } else {
        currentCloze = null;
        clozeSentence.replaceChildren();
        hintText.textContent = `[ HINT: ${wordCount} WORDS ]`;
    }
    hintText.style.display = 'block';

    clearCurrentAnswer();
    hasMistakedCurrent = false;

    resetTimerBar();
    startTimer();
}

function resetTimerBar() {
    timerContainer.classList.remove('danger');
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth; 
    timerBar.style.transition = `width ${TIME_LIMIT}s linear`;
    timerBar.style.width = '0%';
}

function startTimer(reset = true) {
    clearInterval(timerInterval);
    if (reset) {
        timeLeft = TIME_LIMIT;
        lastTickSecond = null;
    }
    timeText.textContent = `TIME: ${timeLeft.toFixed(1)}`;
    timeText.style.color = timeLeft <= 5 ? 'var(--duo-red)' : 'var(--duo-yellow)';
    timerContainer.classList.toggle('danger', timeLeft <= 5);

    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        timeText.textContent = `TIME: ${Math.max(0, timeLeft).toFixed(1)}`;
        if (timeLeft <= 5) {
            timeText.style.color = 'var(--duo-red)';
            timerContainer.classList.add('danger');
            const whole = Math.ceil(timeLeft);
            if (timeLeft > 0 && whole !== lastTickSecond) {
                lastTickSecond = whole;
                SFX.play('tick');
            }
        }
        if (timeLeft <= 0) {
            submitAnswer(true);
        }
    }, 100);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerBar.style.transition = 'none';
    timerBar.style.width = `${Math.max(0, timeLeft / TIME_LIMIT) * 100}%`;
}

function resumeTimer() {
    timerBar.style.transition = 'none';
    timerBar.style.width = `${Math.max(0, timeLeft / TIME_LIMIT) * 100}%`;
    void timerBar.offsetWidth;
    timerBar.style.transition = `width ${Math.max(0, timeLeft)}s linear`;
    timerBar.style.width = '0%';
    startTimer(false);
}

function openPauseModal() {
    if (isQuizPaused) return;
    isQuizPaused = true;
    resumeTimerAfterPause = !inPracticeFeedback;
    pausedFocusElement = document.activeElement;
    if (resumeTimerAfterPause) pauseTimer();
    pauseTime.textContent = `TIME: ${Math.max(0, timeLeft).toFixed(1)}`;
    pauseModal.hidden = false;
    document.getElementById('pause-resume-button').focus();
}

function resumeQuiz() {
    pauseModal.hidden = true;
    isQuizPaused = false;
    if (resumeTimerAfterPause) resumeTimer();
    resumeTimerAfterPause = false;
    if (!inPracticeFeedback && pausedFocusElement?.isConnected) pausedFocusElement.focus();
    pausedFocusElement = null;
}

function quitQuizFromPause() {
    clearInterval(timerInterval);
    hideCombo();
    pauseModal.hidden = true;
    practiceOverlay.classList.remove('active', 'correction-mode');
    isQuizPaused = false;
    inPracticeFeedback = false;
    resumeTimerAfterPause = false;
    pausedFocusElement = null;
    backToTitle();
}

function triggerPopAnim(isCorrect) {
    popFeedback.classList.remove('pop-anim');
    void popFeedback.offsetWidth;
    if(isCorrect) {
        popFeedback.textContent = '⭕';
        popFeedback.style.color = '#fff';
    } else {
        popFeedback.textContent = '❌';
        popFeedback.style.color = 'var(--duo-red)';
    }
    popFeedback.classList.add('pop-anim');
}

function showPracticeFeedback(correctEn, rawUserAns, isTimeUp) {
    inPracticeFeedback = true;
    const poUser = document.getElementById('po-user');
    const poCorrect = document.getElementById('po-correct');
    const question = currentQuestions[currentIndex];

    practiceQuestionNumber.textContent = `QUESTION NO. ${getGlobalQuestionNumber(question)}`;
    practiceWarningCheck.checked = warningWords.some(word => word.en === question.en);
    updatePracticeWarningLabel();

    if (isTimeUp) {
        if (rawUserAns.trim()) {
            const diff = getWordDiffHTML(correctEn, rawUserAns);
            poCorrect.innerHTML = diff.cHTML;
            poUser.innerHTML = `<span style="color:var(--duo-red)">[ TIME OUT ]</span><br>${diff.uHTML}`;
            practiceCorrection.innerHTML = `<span class="correction-status">[ TIME OUT ]</span> ${getCorrectionHTML(correctEn, rawUserAns)}`;
        } else {
            poCorrect.innerHTML = escapeHtml(correctEn);
            poUser.innerHTML = '<span style="color:var(--duo-red)">[ TIME OUT / No Input ]</span>';
            practiceCorrection.innerHTML = `<span class="correction-status">[ TIME OUT ]</span> ${getCorrectionHTML(correctEn, '')}`;
        }
    } else if (!rawUserAns.trim()) {
        poCorrect.innerHTML = escapeHtml(correctEn);
        poUser.innerHTML = '<span style="color:#aaa">[ No Input ]</span>';
        practiceCorrection.innerHTML = `<span class="correction-status">[ NO INPUT ]</span> ${getCorrectionHTML(correctEn, '')}`;
    } else {
        const diff = getWordDiffHTML(correctEn, rawUserAns);
        poCorrect.innerHTML = diff.cHTML;
        poUser.innerHTML = diff.uHTML;
        practiceCorrection.innerHTML = getCorrectionHTML(correctEn, rawUserAns);
    }
    
    practiceOverlay.classList.add('active');
    setPracticeCorrectionMode(isShiftHeld);
}

function hidePracticeFeedback() {
    practiceOverlay.classList.remove('active', 'correction-mode');
    inPracticeFeedback = false;
    
    clearCurrentAnswer();
    resetTimerBar();
    startTimer();
}

function submitAnswer(isTimeUp = false) {
    if (inPracticeFeedback) return;
    clearInterval(timerInterval);
    const q = currentQuestions[currentIndex];
    
    const rawUserAnswer = isClozeMode ? getClozeUserAnswer(q.en) : answerInput.value;
    const correctAnswerClean = getCleanWord(q.en);
    const userAnswerClean = getCleanWord(rawUserAnswer);
    const isCorrect = !isTimeUp && (userAnswerClean === correctAnswerClean);

    if (isCorrect) {
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        const timeBonus = Math.max(0, Math.round(timeLeft * 10));
        const gained = Math.round((100 + timeBonus) * (1 + (combo - 1) * 0.1));
        totalPoints += gained;

        const center = questionCenter();
        FX.correctBurst(center.x, center.y, combo);
        FX.floatText(center.x, center.y - 70, `+${gained}`, '#fddb00', 34);
        showCombo(combo);
        flashQuestion(true);
        SFX.play('correct', combo);

        triggerPopAnim(true);
        if (!hasMistakedCurrent) score++;

        currentIndex++;
        if (currentIndex < currentQuestions.length) loadQuestion();
        else showResult(false);
    } else {
        if (!hasMistakedCurrent) {
            mistakes.push({ ja: q.ja, en: q.en, isTimeUp: isTimeUp, userAns: rawUserAnswer });
            hasMistakedCurrent = true;
        }

        combo = 0;
        hideCombo();
        const center = questionCenter();
        FX.wrongBurst(center.x, center.y);
        FX.shake(isSuddenDeath);
        flashQuestion(false);
        SFX.play('wrong');

        if (isSuddenDeath) {
            triggerPopAnim(false);
            setTimeout(() => showResult(true), 100);
            return;
        }

        if (isPracticeMode) {
            showPracticeFeedback(q.en, rawUserAnswer, isTimeUp);
        } else {
            triggerPopAnim(false);
            currentIndex++;
            if (currentIndex < currentQuestions.length) loadQuestion();
            else showResult(false);
        }
    }
}

function getRank(isGameOver, accuracy) {
    if (isGameOver) return 'F';
    if (accuracy === 100) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 50) return 'C';
    return 'D';
}

function showResult(isGameOver = false) {
    clearInterval(timerInterval);
    hideCombo();
    switchView('result');
    const total = currentQuestions.length;
    const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
    const rank = getRank(isGameOver, accuracy);

    const finalScore = document.getElementById('final-score');
    animateNumber(finalScore, score, 900, v => `${v} / ${total}`);
    animateNumber(document.getElementById('stat-points'), totalPoints, 1300, v => v.toLocaleString());
    animateNumber(document.getElementById('stat-accuracy'), accuracy, 1100, v => `${v}%`);
    animateNumber(document.getElementById('stat-combo'), maxCombo, 1100);

    const rankBadge = document.getElementById('result-rank');
    document.getElementById('rank-letter').textContent = rank;
    rankBadge.className = `result-rank rank-${rank.toLowerCase()}`;
    void rankBadge.offsetWidth;
    rankBadge.classList.add('stamp');

    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    title.classList.remove('glitch');

    if (isGameOver) {
        title.textContent = "SYSTEM FAILURE";
        title.style.color = "var(--duo-red)";
        title.classList.add('glitch');
        msg.textContent = "サドンデス終了。";
        msg.style.color = 'var(--duo-red)';
        FX.shake(true);
        SFX.play('gameover');
    } else {
        title.textContent = "MISSION COMPLETE";
        title.style.color = "var(--duo-yellow)";
        if (score === total) {
            msg.textContent = "Perfect! Flawless victory! 🏆";
            msg.style.color = 'var(--duo-yellow)';
            FX.fireworks(8);
            FX.confettiRain(140);
            SFX.play('perfect');
        } else if (score >= total * 0.7) {
            msg.textContent = "Great job! Keep it up! 👍";
            msg.style.color = '#ffffff';
            FX.confettiRain(90);
            SFX.play('fanfare');
        } else {
            msg.textContent = "Keep trying! 反復練習あるのみ！🔥";
            msg.style.color = 'var(--duo-red)';
            SFX.play('fanfare');
        }
    }

    const mistakesContainer = document.getElementById('mistakes-container');
    if (mistakes.length > 0) {
        mistakesContainer.style.display = 'block';
        mistakesContainer.innerHTML = mistakes.map(m => {
            let displayCorrectAns = escapeHtml(m.en);
            let displayUserAns = "";

            if (m.isTimeUp && m.userAns.trim()) {
                const diff = getWordDiffHTML(m.en, m.userAns);
                displayCorrectAns = diff.cHTML;
                displayUserAns = `<span style="color:var(--duo-red)">[ TIME OUT ]</span><br>${diff.uHTML}`;
            } else if (m.isTimeUp) {
                displayUserAns = '<span style="color:var(--duo-red)">[ TIME OUT / No Input ]</span>';
            } else if (!m.userAns.trim()) {
                displayUserAns = '<span style="color:#aaa">[ No Input ]</span>';
            } else {
                const diff = getWordDiffHTML(m.en, m.userAns);
                displayCorrectAns = diff.cHTML;
                displayUserAns = diff.uHTML;
            }

            const jsSafeEn = m.en.replace(/'/g, "\\'");
            const jsSafeJa = m.ja.replace(/'/g, "\\'");
            const isWarned = warningWords.some(w => w.en === m.en);
            const checkedAttr = isWarned ? 'checked' : '';

            return `
                <label class="duo-check mistake-item">
                    <input type="checkbox" onchange="toggleWarning('${jsSafeEn}', '${jsSafeJa}', this.checked)" ${checkedAttr}>
                    <span class="check-box" style="margin-top: 5px; border-color:var(--text-muted)"></span>
                    <div style="flex: 1;">
                        <span class="m-ja">${escapeHtml(m.ja)}</span>
                        <span class="m-en" style="font-size: 1rem; color: var(--duo-blue);"><strong style="color:var(--duo-blue)">CORRECT:</strong> ${displayCorrectAns}</span>
                        <span class="m-ans" style="font-size: 1.3rem; color: var(--text-dark); margin-top: 8px;"><strong style="color:var(--duo-red); font-size:1rem;">YOUR ANS:</strong><br>${displayUserAns}</span>
                    </div>
                </label>
            `;
        }).join('');
    } else {
        mistakesContainer.style.display = 'none';
    }
}

function openWarningDB() {
    switchView('warningDb');
    const container = document.getElementById('warning-db-container');
    
    if (warningWords.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-dark); font-weight:bold;">WARNING DATA IS EMPTY.</p>';
        return;
    }

    container.innerHTML = warningWords.map(w => {
        const safeEn = escapeHtml(w.en);
        const safeJa = escapeHtml(w.ja);
        const questionNumber = getGlobalQuestionNumber(w);
        const jsSafeEn = w.en.replace(/'/g, "\\'");
        const jsSafeJa = w.ja.replace(/'/g, "\\'");
        
        return `
            <label class="duo-check mistake-item">
                <input type="checkbox" onchange="toggleWarning('${jsSafeEn}', '${jsSafeJa}', this.checked)" checked>
                <span class="check-box" style="margin-top: 5px; border-color:var(--text-muted)"></span>
                <div style="flex: 1;">
                    <span class="m-no">NO. ${questionNumber}</span>
                    <span class="m-ja">${safeJa}</span>
                    <span class="m-en" style="font-size: 1.2rem; color: var(--duo-blue);"><strong style="color:var(--duo-blue)">CORRECT:</strong><br>${safeEn}</span>
                </div>
            </label>
        `;
    }).join('');
}

function backToTitle() {
    updateLessonSelect();
    switchView('setup');
}

init();
