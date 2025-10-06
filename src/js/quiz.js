document.addEventListener('DOMContentLoaded', () => {
    // Ensure KaTeX is rendered after dynamic content is added
    const renderMath = (element) => {
        if (window.renderMathInElement) {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ]
            });
        }
    };

    const STATS_STORAGE_KEY = 'quizUserStats';
    let allQuestions = [];
    let userStats = {}; // Stores lifetime stats from localStorage
    let sessionStats = { history: [] }; // Stores stats for this session only

    // DOM Elements
    const flashcardContainer = document.getElementById('flashcard-container');
    const quizTitle = document.getElementById('quiz-title');
    const resetButton = document.getElementById('reset-progress');
    const completeMessage = document.getElementById('quiz-complete-message');
    
    // Stats Panel Elements
    const sessionAccuracyValEl = document.getElementById('session-accuracy-val');
    const sessionAccuracyBarEl = document.getElementById('session-accuracy-bar');
    const overallImprovementEl = document.getElementById('overall-improvement');
    const masteryAccuracyValEl = document.getElementById('mastery-accuracy-val');
    const masteryAccuracyBarEl = document.getElementById('mastery-accuracy-bar');
    const currentQuestionStatsEl = document.getElementById('current-question-stats-content');

    // --- Core Data & Stats Functions ---

    function loadStats() {
        const storedStats = localStorage.getItem(STATS_STORAGE_KEY);
        try {
            userStats = storedStats ? JSON.parse(storedStats) : {};
        } catch (e) {
            console.error("Failed to parse stats from localStorage", e);
            userStats = {};
        }
        
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
    
    // **NEW**: Calculates mastery based on the LAST answer for each attempted question.
    function calculateMastery() {
        const attemptedQuestions = allQuestions.filter(q => userStats[q.id]?.history.length > 0);
        if (attemptedQuestions.length === 0) return { correct: 0, total: 0, percentage: 0 };

        const correctOnLastTry = attemptedQuestions.filter(q => {
            const history = userStats[q.id].history;
            return history[history.length - 1]; // Check if the last entry is true
        }).length;

        const total = attemptedQuestions.length;
        const percentage = Math.round((correctOnLastTry / total) * 100);
        return { correct: correctOnLastTry, total, percentage };
    }

    function calculateImprovement(history, sliceSize = 10) {
        if (!history || history.length < sliceSize * 2) return "Not enough data";
        
        const recentAccuracy = calculateAccuracy(history.slice(-sliceSize)).percentage;
        const priorAccuracy = calculateAccuracy(history.slice(-sliceSize * 2, -sliceSize)).percentage;

        const improvement = recentAccuracy - priorAccuracy;
        if (improvement > 5) return `<span class="improving">Improving</span>`;
        if (improvement < -5) return `<span class="declining">Declining</span>`;
        return `<span>Stable</span>`;
    }

    function renderAllStats(currentQuestion) {
        // Session Stats
        const sessionAccuracy = calculateAccuracy(sessionStats.history);
        sessionAccuracyValEl.textContent = `${sessionAccuracy.percentage}% (${sessionAccuracy.correct}/${sessionAccuracy.total})`;
        sessionAccuracyBarEl.style.width = `${sessionAccuracy.percentage}%`;
        overallImprovementEl.innerHTML = calculateImprovement(sessionStats.history);

        // Mastery Stats
        const mastery = calculateMastery();
        masteryAccuracyValEl.textContent = `${mastery.percentage}% (${mastery.correct}/${mastery.total})`;
        masteryAccuracyBarEl.style.width = `${mastery.percentage}%`;

        // Current Question Stats
        if (currentQuestion) {
            const qStats = userStats[currentQuestion.id] || { history: [] };
            const lifetime = calculateAccuracy(qStats.history);
            const improvement = calculateImprovement(qStats.history, 5);

            const historyHtml = qStats.history.slice(-10).map(isCorrect => 
                `<span class="history-dot ${isCorrect ? 'correct' : 'incorrect'}"></span>`
            ).join('');

            currentQuestionStatsEl.innerHTML = `
                <p><strong>All-Time Accuracy:</strong> ${lifetime.percentage}% (${lifetime.correct}/${lifetime.total})</p>
                <p><strong>Recent Trend:</strong> ${improvement}</p>
                <p><strong>History:</strong> ${historyHtml || 'No attempts yet'}</p>
            `;
        } else {
            currentQuestionStatsEl.innerHTML = `<p>Quiz complete!</p>`;
        }
    }

    function selectNextQuestion() {
        if (!allQuestions || allQuestions.length === 0) return null;
        
        const allMastered = allQuestions.every(q => {
            const history = userStats[q.id]?.history || [];
            if (history.length < 3) return false;
            return history.slice(-3).every(Boolean);
        });

        if (allMastered) return null;

        let worstScore = Infinity;
        let candidates = [];

        allQuestions.forEach(q => {
            const history = userStats[q.id]?.history || [];
            if (history.length >= 3 && history.slice(-3).every(Boolean)) {
                return; // Skip mastered questions
            }

            let score = 0;
            history.forEach((isCorrect, index) => {
                const weight = Math.pow(0.9, history.length - 1 - index);
                score += (isCorrect ? 1 : -1) * weight;
            });

            if (score < worstScore) {
                worstScore = score;
                candidates = [q];
            } else if (score === worstScore) {
                candidates.push(q);
            }
        });
        
        return candidates[Math.floor(Math.random() * candidates.length)];
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

        const optionsHtml = q.options.map(option => `<label class="option-label"><input type="radio" name="answer" value="${option.replace(/"/g, '&quot;')}"><span>${option}</span></label>`).join('');

        flashcardContainer.innerHTML = `
            <p class="question-text">${q.questionText}</p>
            <div class="options">${optionsHtml}</div>
            <div id="feedback-area"></div>
            <button class="action-button" id="check-answer-btn">Check Answer</button>
        `;

        renderMath(flashcardContainer);
        document.getElementById('check-answer-btn').addEventListener('click', () => checkAnswer(q));
    }

    function checkAnswer(q) {
        const selectedOption = document.querySelector('input[name="answer"]:checked');
        const feedbackArea = document.getElementById('feedback-area');
        const checkButton = document.getElementById('check-answer-btn');

        if (!selectedOption) {
            feedbackArea.innerHTML = `<p class="feedback-text">Please select an answer.</p>`;
            return;
        }

        const isCorrect = selectedOption.value === q.correctAnswer;
        
        userStats[q.id].history.push(isCorrect);
        sessionStats.history.push(isCorrect);

        let feedbackHtml = isCorrect ? `<p class="feedback-text correct">✅ Correct!</p>` : `<p class="feedback-text incorrect">❌ Incorrect. The correct answer is: <strong>${q.correctAnswer}</strong></p>`;

        if (q.explanation) {
            feedbackHtml += `<div class="explanation">${q.explanation}</div>`;
        }
        
        feedbackHtml += `<div class="question-meta"><span><strong>Topic:</strong> ${q.topic || 'General'}</span><span><strong>Difficulty:</strong> ${q.difficulty || 'Normal'}</span></div>`;

        feedbackArea.innerHTML = feedbackHtml;
        renderMath(feedbackArea);

        saveStats();
        renderAllStats(q);

        document.querySelectorAll('input[name="answer"]').forEach(input => input.disabled = true);
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

