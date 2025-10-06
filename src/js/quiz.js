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
    let userStats = {};

    const statsPanel = document.getElementById('stats-content');
    const flashcardContainer = document.getElementById('flashcard-container');
    const quizTitle = document.getElementById('quiz-title');
    const resetButton = document.getElementById('reset-progress');
    const completeMessage = document.getElementById('quiz-complete-message');

    // --- Core Functions ---

    function loadStats() {
        const storedStats = localStorage.getItem(STATS_STORAGE_KEY);
        try {
            userStats = storedStats ? JSON.parse(storedStats) : {};
        } catch (e) {
            console.error("Failed to parse stats from localStorage", e);
            userStats = {};
        }
        allQuestions.forEach(q => {
            if (!userStats[q.id]) {
                userStats[q.id] = { correct: 0, incorrect: 0 };
            }
        });
    }

    function saveStats() {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(userStats));
    }

    function renderStats() {
        if (!allQuestions || allQuestions.length === 0) return;
        const totalQuestions = allQuestions.length;
        const answeredQuestions = Object.values(userStats).filter(s => s.correct > 0 || s.incorrect > 0).length;
        const masteredQuestions = Object.values(userStats).filter(s => s.correct > 0 && s.correct > s.incorrect).length;

        statsPanel.innerHTML = `
            <p><strong>Total Questions:</strong> ${totalQuestions}</p>
            <p><strong>Answered:</strong> ${answeredQuestions} / ${totalQuestions}</p>
            <p><strong>Mastered:</strong> ${masteredQuestions} / ${totalQuestions}</p>
        `;
    }

    function selectNextQuestion() {
        if (!allQuestions || allQuestions.length === 0) return null;

        const allAnswered = allQuestions.every(q => (userStats[q.id]?.correct || 0) > 0 || (userStats[q.id]?.incorrect || 0) > 0);
        if (allAnswered) {
           const allMastered = allQuestions.every(q => (userStats[q.id]?.correct || 0) > (userStats[q.id]?.incorrect || 0));
           if(allMastered) return null;
        }

        let highestPriority = -Infinity;
        let priorityCandidates = [];

        allQuestions.forEach(q => {
            const stats = userStats[q.id] || { correct: 0, incorrect: 0 };
            const priority = (stats.incorrect + 1) / (stats.correct + 1);

            if (priority > highestPriority) {
                highestPriority = priority;
                priorityCandidates = [q];
            } else if (priority === highestPriority) {
                priorityCandidates.push(q);
            }
        });

        return priorityCandidates[Math.floor(Math.random() * priorityCandidates.length)];
    }

    function renderQuestion(q) {
        if (!q) {
            flashcardContainer.style.display = 'none';
            completeMessage.style.display = 'block';
            return;
        }

        flashcardContainer.style.display = 'block';
        completeMessage.style.display = 'none';

        const optionsHtml = q.options.map(option => {
            const cleanOption = option.replace(/"/g, '&quot;');
            return `
            <label class="option-label">
                <input type="radio" name="answer" value="${cleanOption}">
                <span>${option}</span>
            </label>
            `;
        }).join('');

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
        const stats = userStats[q.id];

        let feedbackHtml = '';
        if (isCorrect) {
            stats.correct++;
            feedbackHtml = `<p class="feedback-text correct">✅ Correct!</p>`;
        } else {
            stats.incorrect++;
            feedbackHtml = `<p class="feedback-text incorrect">❌ Incorrect. The correct answer is: <strong>${q.correctAnswer}</strong></p>`;
        }

        if (q.explanation) {
            feedbackHtml += `<div class="explanation">${q.explanation}</div>`;
        }
        
        feedbackHtml += `
            <div class="question-meta">
                <span><strong>Topic:</strong> ${q.topic || 'General'}</span>
                <span><strong>Difficulty:</strong> ${q.difficulty || 'Normal'}</span>
            </div>
        `;

        feedbackArea.innerHTML = feedbackHtml;
        // *** THIS IS THE FIX ***
        // Re-run the math renderer on the newly added content in the feedback area.
        renderMath(feedbackArea);

        saveStats();
        renderStats();

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
            renderStats();
            renderQuestion(selectNextQuestion());
            
            resetButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all your progress?')) {
                    localStorage.removeItem(STATS_STORAGE_KEY);
                    userStats = {};
                    loadStats();
                    renderStats();
                    renderQuestion(selectNextQuestion());
                }
            });

        } catch (error) {
            quizTitle.textContent = "Error Loading Quiz";
            flashcardContainer.innerHTML = `<p>Could not load quiz questions. Please check that the file <code>/src/_data/questions.json</code> exists and is valid JSON.</p><p style="color: red;"><strong>Details:</strong> ${error.message}</p>`;
            console.error('Quiz initialization failed:', error);
        }
    }

    initializeQuiz();
});

