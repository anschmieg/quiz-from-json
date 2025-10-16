document.addEventListener('DOMContentLoaded', () => {
    const renderMath = (element) => {
        if (window.renderMathInElement) {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}
                ]
            });
        }
    };

    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    const STATS_STORAGE_KEY = 'quizUserStats';
    const SESSION_STORAGE_KEY = 'quizSessionStats';
    let allQuestions = [];
    let userStats = {};
    let sessionStats = { history: [] };
    let lastQuestionId = null;

    const flashcardContainer = document.getElementById('flashcard-container');
    const completeMessage = document.getElementById('quiz-complete-message');
    const masteryAccuracyValEl = document.getElementById('mastery-accuracy-val');
    const masteryAccuracyBarEl = document.getElementById('mastery-accuracy-bar');

    function loadStats() {
        try {
            userStats = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY)) || {};
            sessionStats = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)) || { history: [] };
        } catch (e) {
            userStats = {};
            sessionStats = { history: [] };
        }
        allQuestions.forEach(q => {
            if (!userStats[q.id] || !Array.isArray(userStats[q.id].history)) {
                userStats[q.id] = { history: [] };
            }
        });
    }

    function saveStats() {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(userStats));
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionStats));
    }

    function calculateAccuracy(history) {
        if (!history || history.length === 0) return { correct: 0, total: 0, percentage: 0 };
        const correct = history.filter(Boolean).length;
        const total = history.length;
        const percentage = Math.round((correct / total) * 100);
        return { correct, total, percentage };
    }

    function calculateMastery() {
        const attemptedQuestions = allQuestions.filter(q => userStats[q.id]?.history.length > 0);
        if (attemptedQuestions.length === 0) return { correct: 0, total: 0, percentage: 0 };
        const correctOnLastTry = attemptedQuestions.filter(q => userStats[q.id].history.slice(-1)[0]).length;
        const total = attemptedQuestions.length;
        const percentage = Math.round((correctOnLastTry / total) * 100);
        return { correct: correctOnLastTry, total, percentage };
    }

    function renderMastery() {
        const mastery = calculateMastery();
        masteryAccuracyValEl.textContent = `${mastery.percentage}% (${mastery.correct}/${mastery.total} Attempted)`;
        masteryAccuracyBarEl.style.width = `${mastery.percentage}%`;
    }

    function selectNextQuestion() {
        const masteredQuestions = new Set(allQuestions.filter(q => {
            const history = userStats[q.id]?.history || [];
            return history.length >= 3 && history.slice(-3).every(Boolean);
        }).map(q => q.id));
        if (masteredQuestions.size === allQuestions.length && allQuestions.length > 0) return null;
        const availableQuestions = allQuestions.filter(q => !masteredQuestions.has(q.id));
        const candidatePool = availableQuestions.length > 1 ? availableQuestions.filter(q => q.id !== lastQuestionId) : availableQuestions;
        if (candidatePool.length === 0) return null;
        let worstScore = Infinity;
        let candidates = [];
        candidatePool.forEach(q => {
            const history = userStats[q.id]?.history || [];
            let score = 0;
            history.forEach((isCorrect, index) => {
                score += (isCorrect ? 1 : -1) * Math.pow(0.9, history.length - 1 - index);
            });
            if (score < worstScore) {
                worstScore = score;
                candidates = [q];
            } else if (score === worstScore) {
                candidates.push(q);
            }
        });
        const nextQuestion = candidates[Math.floor(Math.random() * candidates.length)];
        lastQuestionId = nextQuestion.id;
        return nextQuestion;
    }

    function renderQuestion(q) {
        renderMastery();
        if (!q) {
            flashcardContainer.style.display = 'none';
            completeMessage.style.display = 'block';
            document.getElementById('reset-progress').addEventListener('click', resetAllProgress);
            return;
        }
        flashcardContainer.style.display = 'block';
        completeMessage.style.display = 'none';
        const shuffledOptions = shuffleArray([...q.options]);
        const optionsHtml = shuffledOptions.map(option => `<label class="option-label"><input type="radio" name="answer" value="${option.replace(/"/g, '&quot;')}"><span>${option}</span></label>`).join('');
        flashcardContainer.innerHTML = `<h2 class="question-topic">${q.topic || 'Question'}</h2><p class="question-text">${q.questionText}</p><div class="options">${optionsHtml}</div><div id="feedback-area"></div><button class="action-button" id="check-answer-btn">Check Answer</button>`;
        renderMath(flashcardContainer);
        const feedbackAreaEl = document.getElementById('feedback-area');
        const checkAnswerBtn = document.getElementById('check-answer-btn');
        if (!checkAnswerBtn) return;
        const handleCheckAnswer = () => checkAnswer(q, feedbackAreaEl, checkAnswerBtn, handleCheckAnswer);
        checkAnswerBtn.addEventListener('click', handleCheckAnswer);
    }

    function checkAnswer(q, feedbackAreaEl, checkButton, checkHandler) {
        const selectedOptionEl = document.querySelector('input[name="answer"]:checked');
        if (!selectedOptionEl) return;
        const userAnswer = selectedOptionEl.value;
        const isCorrect = userAnswer === q.correctAnswer;
        userStats[q.id].history.push(isCorrect);
        if (!Array.isArray(sessionStats.history)) sessionStats.history = [];
        sessionStats.history.push(isCorrect);
        document.querySelectorAll('.option-label').forEach(label => {
            const input = label.querySelector('input');
            input.disabled = true;
            label.classList.add('disabled');
            if (input.value === q.correctAnswer) label.classList.add('correct-answer');
            if (input.value === userAnswer && !isCorrect) label.classList.add('selected-incorrect');
        });
        const qStats = userStats[q.id];
        const lifetime = calculateAccuracy(qStats.history);
        const historyHtml = qStats.history.slice(-5).map(isCorrect => `<span class="history-dot ${isCorrect ? 'correct' : 'incorrect'}"></span>`).join('');
        let feedbackHtml = `<div class="review-section">`;
        if (q.explanation) feedbackHtml += `<div class="explanation">${q.explanation}</div>`;
        feedbackHtml += `<div class="question-meta"><span><strong>Accuracy:</strong> ${lifetime.percentage}%</span><span><strong>History:</strong> ${historyHtml}</span></div></div>`;
        let feedbackTarget = feedbackAreaEl;
        if (!feedbackTarget) {
            feedbackTarget = document.createElement('div');
            feedbackTarget.id = 'feedback-area';
            flashcardContainer.appendChild(feedbackTarget);
        }
        feedbackTarget.innerHTML = feedbackHtml;
        renderMath(feedbackTarget);
        saveStats();
        renderMastery();
        if (!checkButton) return;
        if (typeof checkHandler === 'function') checkButton.removeEventListener('click', checkHandler);
        checkButton.textContent = 'Next Question';
        checkButton.setAttribute('aria-label', 'Load the next question');
        const handleNextQuestion = () => {
            checkButton.removeEventListener('click', handleNextQuestion);
            renderQuestion(selectNextQuestion());
        };
        checkButton.addEventListener('click', handleNextQuestion);
    }

    function resetAllProgress() {
        if (confirm('Are you sure you want to reset all your progress?')) {
            localStorage.removeItem(STATS_STORAGE_KEY);
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            userStats = {};
            sessionStats = { history: [] };
            loadStats();
            renderQuestion(selectNextQuestion());
        }
    }

    async function initializeQuiz() {
        try {
            const response = await fetch('/_data/questions.json');
            if (!response.ok) throw new Error(`Could not load questions.json (status: ${response.status})`);
            const data = await response.json();
            allQuestions = data.questions || [];
            loadStats();
            renderQuestion(selectNextQuestion());
        } catch (error) {
            flashcardContainer.innerHTML = `<p>Could not load quiz questions. Please check console for errors.</p><p style="color: red;"><strong>Details:</strong> ${error.message}</p>`;
            console.error('Quiz initialization failed:', error);
        }
    }

    initializeQuiz();
});
