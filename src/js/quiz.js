document.addEventListener('DOMContentLoaded', () => {
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
        if (storedStats) {
            userStats = JSON.parse(storedStats);
        }
        // Ensure stats object is populated for all questions from the loaded JSON
        allQuestions.forEach(q => {
            if (!userStats[q.id]) {
                userStats[q.id] = { correct: 0, incorrect: 0, lastResult: null };
            }
        });
    }

    function saveStats() {
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(userStats));
    }

    function renderStats() {
        const totalQuestions = allQuestions.length;
        if (totalQuestions === 0) return;
        const answeredQuestions = Object.values(userStats).filter(s => s.correct > 0 || s.incorrect > 0).length;
        const masteredQuestions = Object.values(userStats).filter(s => s.correct > s.incorrect && s.correct > 1).length;
        
        statsPanel.innerHTML = `
            <p><strong>Total Questions:</strong> ${totalQuestions}</p>
            <p><strong>Answered:</strong> ${answeredQuestions} / ${totalQuestions}</p>
            <p><strong>Mastered:</strong> ${masteredQuestions} / ${totalQuestions}</p>
        `;
    }

    function selectNextQuestion() {
        let highestPriority = -1;
        let priorityCandidates = [];

        if (allQuestions.length === 0) return null;

        allQuestions.forEach(q => {
            const stats = userStats[q.id];
            const priority = (stats.incorrect + 1) / (stats.correct + 1);

            if (priority > highestPriority) {
                highestPriority = priority;
                priorityCandidates = [q];
            } else if (priority === highestPriority) {
                priorityCandidates.push(q);
            }
        });
        
        const allMastered = allQuestions.every(q => userStats[q.id].correct > 1 && userStats[q.id].correct > userStats[q.id].incorrect);
        if (allMastered) {
           return null; // All questions considered mastered
        }

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
            const cleanOption = option.replace(/"/g, '&quot;'); // Sanitize quotes
            return `
            <label class="option-label">
                <input type="radio" name="answer" value="${cleanOption}">
                <span>${option}</span>
            </label>
        `}).join('');

        flashcardContainer.innerHTML = `
            <p class="question-text">${q.questionText}</p>
            <div class="options">${optionsHtml}</div>
            <div class="feedback" id="feedback-area"></div>
            <button class="action-button" id="check-answer-btn">Check Answer</button>
        `;

        document.getElementById('check-answer-btn').addEventListener('click', () => checkAnswer(q));
    }
    
    function checkAnswer(q) {
        const selectedOption = document.querySelector('input[name="answer"]:checked');
        const feedbackArea = document.getElementById('feedback-area');
        const checkButton = document.getElementById('check-answer-btn');

        if (!selectedOption) {
            feedbackArea.textContent = "Please select an answer.";
            return;
        }

        const isCorrect = selectedOption.value === q.correctAnswer;
        const stats = userStats[q.id];

        // **THIS IS THE CHANGE**: Create a metadata div to show after answering.
        const metadataHtml = `
            <div class="question-meta">
                <span><strong>Topic:</strong> ${q.topic || 'General'}</span>
                <span><strong>Difficulty:</strong> ${q.difficulty || 'Normal'}</span>
            </div>
        `;
        
        if (isCorrect) {
            stats.correct++;
            stats.lastResult = 'correct';
            feedbackArea.innerHTML = `<p>✅ Correct!</p>${metadataHtml}`;
            feedbackArea.className = 'feedback correct';
        } else {
            stats.incorrect++;
            stats.lastResult = 'incorrect';
            feedbackArea.innerHTML = `<p>❌ Incorrect. The answer is: <strong>${q.correctAnswer}</strong></p>${metadataHtml}`;
            feedbackArea.className = 'feedback incorrect';
        }
        
        saveStats();
        renderStats();

        checkButton.textContent = 'Next Question';
        checkButton.onclick = () => renderQuestion(selectNextQuestion());
    }

    async function initializeQuiz() {
        try {
            const response = await fetch('/_data/questions.json');
            if (!response.ok) throw new Error('Network response was not ok.');
            
            // The user's JSON has a root key "questions", not "items"
            const data = await response.json();
            allQuestions = data.questions || data.items || [];
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
            quizTitle.textContent = "Error";
            flashcardContainer.innerHTML = `<p>Could not load quiz questions. Please make sure <em>questions.json</em> exists in <em>src/_data/</em> and is correctly formatted.</p><p><em>${error.message}</em></p>`;
            console.error('Quiz initialization failed:', error);
        }
    }

    initializeQuiz();
});
