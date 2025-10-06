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
    let allQuestions = [];
    let userStats = {};
    let sessionStats = { history: [] };
    let lastQuestionId = null;

    const flashcardContainer = document.getElementById('flashcard-container');
    const quizTitle = document.getElementById('quiz-title');
    const resetButton = document.getElementById('reset-progress');
    const completeMessage = document.getElementById('quiz-complete-message');
    const sessionAccuracyValEl = document.getElementById('session-accuracy-val');
    const sessionAccuracyBarEl = document.getElementById('session-accuracy-bar');
    const overallImprovementEl = document.getElementById('overall-improvement');
    const masteryAccuracyValEl = document.getElementById('mastery-accuracy-val');
    const masteryAccuracyBarEl = document.getElementById('mastery-accuracy-bar');
    const currentQuestionStatsContainer = document.getElementById('current-question-stats-container');
    const currentQuestionStatsEl = document.getElementById('current-question-stats-content');

    function loadStats() {
        const storedStats = localStorage.getItem(STATS_STORAGE_KEY);
        try {
            userStats = storedStats ? JSON.parse(storedStats) : {};
        } catch (e) { userStats = {}; }
        allQuestions.forEach(q => {
            if (!userStats[q.id] || !Array.isArray(userStats[q.id].history)) {
                userStats[q.id] = { history: [] };
            }
        });
    }

    function saveStats() {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(userStats));
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

    // **NEW**: Calculates improvement and returns a percentage string
    function calculateImprovement(history, sliceSize = 10) {
        if (!history || history.length < sliceSize * 2) return "Not enough data";
        const recentAccuracy = calculateAccuracy(history.slice(-sliceSize)).percentage;
        const priorAccuracy = calculateAccuracy(history.slice(-sliceSize * 2, -sliceSize)).percentage;
        const improvement = recentAccuracy - priorAccuracy;

        if (improvement > 0) return `<span class="improving">+${improvement}%</span>`;
        if (improvement < 0) return `<span class="declining">${improvement}%</span>`;
        return `<span>Stable</span>`;
    }

    function renderAllStats(currentQuestion) {
        const sessionAccuracy = calculateAccuracy(sessionStats.history);
        sessionAccuracyValEl.textContent = `${sessionAccuracy.percentage}% (${sessionAccuracy.correct}/${sessionAccuracy.total})`;
        sessionAccuracyBarEl.style.width = `${sessionAccuracy.percentage}%`;
        overallImprovementEl.innerHTML = calculateImprovement(sessionStats.history);

        const mastery = calculateMastery();
        masteryAccuracyValEl.textContent = `${mastery.percentage}% (${mastery.correct}/${mastery.total})`;
        masteryAccuracyBarEl.style.width = `${mastery.percentage}%`;

        // **NEW**: Hide or show the current question stats section
        if (currentQuestion && userStats[currentQuestion.id]?.history.length > 0) {
            currentQuestionStatsContainer.style.display = 'block';
            const qStats = userStats[currentQuestion.id];
            const lifetime = calculateAccuracy(qStats.history);
            const improvement = calculateImprovement(qStats.history, 5);
            const historyHtml = qStats.history.slice(-10).map(isCorrect => `<span class="history-dot ${isCorrect ? 'correct' : 'incorrect'}"></span>`).join('');
            currentQuestionStatsEl.innerHTML = `<p><strong>All-Time Accuracy:</strong> ${lifetime.percentage}% (${lifetime.correct}/${lifetime.total})</p><p><strong>Recent Trend:</strong> ${improvement}</p><p><strong>History:</strong> ${historyHtml}</p>`;
        } else {
            currentQuestionStatsContainer.style.display = 'none';
        }
    }

    function selectNextQuestion() {
        const masteredQuestions = new Set(allQuestions.filter(q => {
            const history = userStats[q.id]?.history || [];
            return history.length >= 3 && history.slice(-3).every(Boolean);
        }).map(q => q.id));

        if (masteredQuestions.size === allQuestions.length) return null;

        const availableQuestions = allQuestions.filter(q => !masteredQuestions.has(q.id));
        const candidatePool = availableQuestions.length > 1 ? availableQuestions.filter(q => q.id !== lastQuestionId) : availableQuestions;

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
        renderAllStats(q);
        if (!q) {
            flashcardContainer.style.display = 'none';
            completeMessage.style.display = 'block';
            return;
        }
        flashcardContainer.style.display = 'block';
        completeMessage.style.display = 'none';

        const shuffledOptions = shuffleArray([...q.options]);
        const optionsHtml = shuffledOptions.map(option => `<label class="option-label"><input type="radio" name="answer" value="${option.replace(/"/g, '&quot;')}"><span>${option}</span></label>`).join('');
        flashcardContainer.innerHTML = `<p class="question-text">${q.questionText}</p><div class="options">${optionsHtml}</div><div id="feedback-area"></div><button class="action-button" id="check-answer-btn">Check Answer</button>`;
        renderMath(flashcardContainer);
        document.getElementById('check-answer-btn').addEventListener('click', () => checkAnswer(q));
    }

    function checkAnswer(q) {
        const selectedOptionEl = document.querySelector('input[name="answer"]:checked');
        if (!selectedOptionEl) return;

        const userAnswer = selectedOptionEl.value;
        const isCorrect = userAnswer === q.correctAnswer;
        userStats[q.id].history.push(isCorrect);
        sessionStats.history.push(isCorrect);

        document.querySelectorAll('.option-label').forEach(label => {
            const input = label.querySelector('input');
            input.disabled = true;
            label.classList.add('disabled');
            if (input.value === q.correctAnswer) label.classList.add('correct-answer');
            if (input.value === userAnswer && !isCorrect) label.classList.add('selected-incorrect');
        });

        let feedbackHtml = `<div class="review-section">`;
        if (q.explanation) feedbackHtml += `<div class="explanation">${q.explanation}</div>`;
        feedbackHtml += `<div class="question-meta"><span><strong>Topic:</strong> ${q.topic || 'General'}</span><span><strong>Difficulty:</strong> ${q.difficulty || 'Normal'}</span></div></div>`;
        
        document.getElementById('feedback-area').innerHTML = feedbackHtml;
        renderMath(document.getElementById('feedback-area'));
        saveStats();
        renderAllStats(q);

        const checkButton = document.getElementById('check-answer-btn');
        checkButton.textContent = 'Next Question';
        checkButton.onclick = () => renderQuestion(selectNextQuestion());
    }

    async function initializeQuiz() {
        try {
            const response = await fetch('/_data/questions.json');
            if (!response.ok) throw new Error(`Could not load questions.json (status: ${response.status})`);
            const data = await response.json();
            allQuestions = data.questions || [];
            quizTitle.textContent = data.title || 'Learning Quiz';
            loadStats();
            renderQuestion(selectNextQuestion());
            resetButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all your progress?')) {
                    localStorage.removeItem(STATS_STORAGE_KEY);
                    sessionStats.history = [];
                    userStats = {};
                    loadStats();
                    renderQuestion(selectNextQuestion());
                }
            });
        } catch (error) {
            quizTitle.textContent = "Error Loading Quiz";
            flashcardContainer.innerHTML = `<p>Could not load quiz questions. Please check the file and console for errors.</p><p style="color: red;"><strong>Details:</strong> ${error.message}</p>`;
            console.error('Quiz initialization failed:', error);
        }
    }

    initializeQuiz();
});

