document.addEventListener('DOMContentLoaded', () => {
    const renderMath = (element) => {
        if (window.renderMathInElement) {
            window.renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }
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

    // Multi-quiz support
    let currentQuizId = localStorage.getItem('currentQuizId') || 'semlex';
    let allQuestions = [];
    let quizTitle = '';
    let userStats = {};
    let sessionStats = { history: [] };
    let lastQuestionId = null;

    const STATS_PREFIX = 'quizStats_';
    const SESSION_PREFIX = 'quizSession_';

    const flashcardContainer = document.getElementById('flashcard-container');
    const completeMessage = document.getElementById('quiz-complete-message');
    const masteryAccuracyValEl = document.getElementById('mastery-accuracy-val');
    const masteryAccuracyBarEl = document.getElementById('mastery-accuracy-bar');
    const quizSelect = document.getElementById('quiz-select');

    function getStorageKey(prefix) {
        return prefix + currentQuizId;
    }

    function loadStats() {
        try {
            userStats = JSON.parse(localStorage.getItem(getStorageKey(STATS_PREFIX))) || {};
            sessionStats = JSON.parse(sessionStorage.getItem(getStorageKey(SESSION_PREFIX))) || { history: [] };
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
        localStorage.setItem(getStorageKey(STATS_PREFIX), JSON.stringify(userStats));
        sessionStorage.setItem(getStorageKey(SESSION_PREFIX), JSON.stringify(sessionStats));
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

        // Update header with quiz title
        const headerTitle = document.querySelector('.quiz-header-stats h3');
        if (headerTitle) {
            headerTitle.textContent = quizTitle ? `${quizTitle} - Overall Mastery` : 'Overall Mastery';
        }
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
            const resetBtn = document.getElementById('reset-progress');
            if (resetBtn) {
                resetBtn.replaceWith(resetBtn.cloneNode(true));
                document.getElementById('reset-progress').addEventListener('click', resetAllProgress);
            }
            return;
        }
        flashcardContainer.style.display = 'block';
        completeMessage.style.display = 'none';
        const shuffledOptions = shuffleArray([...q.options]);
        const optionsHtml = shuffledOptions.map(option => `<label class="option-label"><input type="radio" name="answer" value="${option.replace(/"/g, '&quot;')}"><span>${option}</span></label>`).join('');
        const difficultyClass = q.difficulty ? `question-difficulty ${q.difficulty.toLowerCase()}` : '';
        // Inline SVG gauge (arc + center dot + needle). SVG uses 1em sizing so it matches the text height.
        // Needle angle and color are set per-difficulty. The arc and center dot inherit the badge color (currentColor).
        let needleAngle = 0;
        let needleColor = '#111';
        // Assumption: map easy -> blue, medium -> yellow, hard -> red
        const diffLower = (q.difficulty || '').toLowerCase();
        if (diffLower === 'easy' || diffLower === 'leicht') {
            needleAngle = -40; // left-leaning
            needleColor = '#007bff';
        } else if (diffLower === 'medium' || diffLower === 'mittel' || diffLower === 'moderate') {
            needleAngle = 0; // center
            needleColor = '#ffc107';
        } else if (diffLower === 'hard' || diffLower === 'schwer') {
            needleAngle = 40; // right-leaning
            needleColor = '#dc3545';
        } else {
            needleAngle = 0;
            needleColor = '#111';
        }

        const iconName = 'speed';
        const difficultyBadge = q.difficulty ? `<div class="${difficultyClass}" aria-label="Difficulty: ${q.difficulty}">` +
            `<span class="material-symbols-outlined difficulty-icon" aria-hidden="true" title="${q.difficulty}">${iconName}</span>` +
            `<span class="difficulty-text">${q.difficulty}</span></div>` : '';

        // If the template already rendered a difficulty badge (server-side include), update it
        // rather than inserting a second badge. This allows the Eleventy `gauge` shortcode
        // to be used in templates while client JS still injects the rest of the question.
        const headerHtml = `<h2 class="question-topic">${q.topic || 'Question'}</h2>`;
        flashcardContainer.innerHTML = `<div class="question-header">${headerHtml}${/* placeholder for badge */ ''}</div><p class="question-text">${q.questionText}</p><div class="options">${optionsHtml}</div><div id="feedback-area"></div><button class="action-button" id="check-answer-btn">Check Answer</button>`;
        const headerEl = flashcardContainer.querySelector('.question-header');
        if (headerEl) {
            const existingBadge = headerEl.querySelector('.question-difficulty');
            if (existingBadge) {
                // update class and text
                existingBadge.className = `question-difficulty ${q.difficulty ? q.difficulty.toLowerCase() : ''}`.trim();
                const textEl = existingBadge.querySelector('.difficulty-text');
                if (textEl) textEl.textContent = q.difficulty || '';
            } else {
                // no server badge; insert client badge
                headerEl.insertAdjacentHTML('beforeend', difficultyBadge);
            }
        }
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
        if (confirm('Are you sure you want to reset all your progress for this quiz?')) {
            localStorage.removeItem(getStorageKey(STATS_PREFIX));
            sessionStorage.removeItem(getStorageKey(SESSION_PREFIX));
            userStats = {};
            sessionStats = { history: [] };
            loadStats();
            renderQuestion(selectNextQuestion());
        }
    }

    async function loadQuiz(quizId) {
        currentQuizId = quizId;
        localStorage.setItem('currentQuizId', quizId);

        try {
            const response = await fetch(`/_data/${quizId}.json`);
            if (!response.ok) throw new Error(`Could not load ${quizId}.json (status: ${response.status})`);
            const data = await response.json();
            allQuestions = data.questions || [];
            quizTitle = data.title || 'Quiz';
            loadStats();
            renderQuestion(selectNextQuestion());
        } catch (error) {
            flashcardContainer.innerHTML = `<p>Could not load quiz questions. Please check console for errors.</p><p style="color: red;"><strong>Details:</strong> ${error.message}</p>`;
            console.error('Quiz loading failed:', error);
        }
    }

    // Quiz selector change handler
    if (quizSelect) {
        quizSelect.value = currentQuizId;
        quizSelect.addEventListener('change', (e) => {
            loadQuiz(e.target.value);
        });
    }

    // Page navigation active state
    const currentPage = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPage ||
            (currentPage === '/' && link.getAttribute('data-page') === 'quiz') ||
            (currentPage.startsWith('/stats') && link.getAttribute('data-page') === 'stats')) {
            link.classList.add('active');
        }
    });

    // Initialize quiz
    loadQuiz(currentQuizId);
});
