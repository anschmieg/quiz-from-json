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
        const questionText = q.questionText || q.question || q.text || '';
        const optionsHtml = shuffledOptions.map(option => `<label class="option-label"><input type="radio" name="answer" value="${option.replace(/"/g, '&quot;')}"><span>${option}</span></label>`).join('');
        const difficultyClass = q.difficulty ? `question-difficulty ${q.difficulty.toLowerCase()}` : '';
        // Inline SVG gauge (arc + center dot + needle). SVG uses 1em sizing so it matches the text height.
        // Needle angle and color are set per-difficulty. The arc and center dot inherit the badge color (currentColor).
        let needleAngle = 0;
        // Read canonical difficulty colors from CSS variables so client-inserted gauges
        // match the site's variables. Fall back to previous hard-coded colors if vars are missing.
        const rootStyles = getComputedStyle(document.documentElement);
        const easyColorVar = rootStyles.getPropertyValue('--difficulty-easy-bg').trim() || '#007bff';
        const mediumColorVar = rootStyles.getPropertyValue('--difficulty-medium-bg').trim() || '#ffc107';
        const hardColorVar = rootStyles.getPropertyValue('--difficulty-hard-bg').trim() || '#dc3545';
        let needleColor = '#111';
        const diffLower = (q.difficulty || '').toLowerCase();
        if (diffLower === 'easy' || diffLower === 'leicht') {
            needleAngle = -40; // left-leaning
            needleColor = easyColorVar;
        } else if (diffLower === 'medium' || diffLower === 'mittel' || diffLower === 'moderate') {
            needleAngle = 0; // center
            needleColor = mediumColorVar;
        } else if (diffLower === 'hard' || diffLower === 'schwer') {
            needleAngle = 40; // right-leaning
            needleColor = hardColorVar;
        } else {
            needleAngle = 0;
            needleColor = '#111';
        }

        // Provide both a Material Symbols span and an inline SVG fallback.
        // The CSS will hide the font span by default until the font is detected,
        // so the inline SVG is shown immediately for robustness. When the
        // font loads, JS will add `material-loaded` to <html> and the span will
        // be shown while the SVG is hidden.
        const materialSpan = `<span class="material-symbols-outlined difficulty-icon" aria-hidden="true" title="${q.difficulty}">speed</span>`;
        const inlineSvg = `<svg class="difficulty-svg difficulty-icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
            `<path d="M3.5 12a8.5 8.5 0 0 1 17 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<line x1="7.2" y1="13.8" x2="12.2" y2="9.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
            `</svg>`;
        const speedIconHtml = materialSpan + inlineSvg;
        const difficultyBadgeHtml = q.difficulty ? `<div class="${difficultyClass}" aria-label="Difficulty: ${q.difficulty}">` +
            speedIconHtml +
            `<span class="difficulty-text">${q.difficulty}</span></div>` : '';

        // Build or update the flashcard markup. If the server/template already provided
        // a `.question-header`, update it in-place; otherwise create the full structure.
        let headerEl = flashcardContainer.querySelector('.question-header');
        if (!headerEl) {
            flashcardContainer.innerHTML = `
                <div class="question-header">
                    <h2 class="question-topic">${q.topic || 'Question'}</h2>
                    ${difficultyBadgeHtml}
                </div>
                <div class="question-text">${questionText}</div>
                <div class="options">${optionsHtml}</div>
                <div id="feedback-area"></div>
                <button id="check-answer-btn" class="action-button">Check Answer</button>
            `;
            headerEl = flashcardContainer.querySelector('.question-header');
        } else {
            // Update existing header/topic
            const topicEl = headerEl.querySelector('.question-topic');
            if (topicEl) topicEl.textContent = q.topic || 'Question';
            const existingBadge = headerEl.querySelector('.question-difficulty');
            if (q.difficulty) {
                if (existingBadge) {
                    existingBadge.className = `question-difficulty ${q.difficulty.toLowerCase()}`;
                    const textEl = existingBadge.querySelector('.difficulty-text');
                    if (textEl) textEl.textContent = q.difficulty;
                } else {
                    headerEl.insertAdjacentHTML('beforeend', difficultyBadgeHtml);
                }
            } else if (existingBadge) {
                existingBadge.remove();
            }

            // Update or insert question text and options
            const qt = flashcardContainer.querySelector('.question-text');
            if (qt) qt.textContent = questionText;
            const opts = flashcardContainer.querySelector('.options');
            if (opts) opts.innerHTML = optionsHtml;

            if (!document.getElementById('check-answer-btn')) {
                flashcardContainer.insertAdjacentHTML('beforeend', '<button id="check-answer-btn" class="action-button">Check Answer</button>');
            } else {
                document.getElementById('check-answer-btn').textContent = 'Check Answer';
            }
        }
        renderMath(flashcardContainer);
    // Ensure icon fallbacks: if the Material Symbols font isn't available,
    // replace symbol spans with inline SVG icons so glyphs remain visible.
    ensureMaterialSymbolFallbacks();
        const feedbackAreaEl = document.getElementById('feedback-area');
        const checkAnswerBtn = document.getElementById('check-answer-btn');
        if (!checkAnswerBtn) return;
        const handleCheckAnswer = () => checkAnswer(q, feedbackAreaEl, checkAnswerBtn, handleCheckAnswer);
        checkAnswerBtn.addEventListener('click', handleCheckAnswer);
    }

    // Replace .material-symbols-outlined spans with inline SVGs when the
    // Material Symbols font isn't actually being used (blocked or missing).
    // This handles theme icons (light_mode/dark_mode) and other named glyphs.
    function ensureMaterialSymbolFallbacks() {
        // Quick font-availability probe: if font appears available, do nothing.
        try {
            const probe = document.createElement('span');
            probe.className = 'material-symbols-outlined';
            probe.style.position = 'absolute';
            probe.style.opacity = '0';
            probe.textContent = 'speed';
            document.body.appendChild(probe);
            const usedFont = getComputedStyle(probe).fontFamily || '';
            document.body.removeChild(probe);
            if (usedFont.toLowerCase().includes('material symbols')) return; // font available
        } catch (e) {
            // fall through to apply fallbacks
        }

        // mapping from icon name -> inline SVG markup (keeps currentColor)
        const iconSvgs = {
            'speed': `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
                `<path d="M3.5 12a8.5 8.5 0 0 1 17 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<line x1="7.2" y1="13.8" x2="12.2" y2="9.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
            'light_mode': `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
                `<g fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4"/>` +
                `<rect x="11.5" y="1.5" width="1" height="3" rx="0.2"></rect>` +
                `<rect x="11.5" y="19.5" width="1" height="3" rx="0.2"></rect>` +
                `<rect x="1.5" y="11.5" width="3" height="1" rx="0.2"></rect>` +
                `<rect x="19.5" y="11.5" width="3" height="1" rx="0.2"></rect>` +
                `<rect x="4.2" y="4.2" width="1" height="3" transform="rotate(-45 4.7 5.7)" rx="0.2"></rect>` +
                `<rect x="18.8" y="18.8" width="1" height="3" transform="rotate(-45 19.3 20.3)" rx="0.2"></rect>` +
                `<rect x="18.8" y="4.2" width="1" height="3" transform="rotate(45 19.3 5.7)" rx="0.2"></rect>` +
                `<rect x="4.2" y="18.8" width="1" height="3" transform="rotate(45 4.7 20.3)" rx="0.2"></rect></g></svg>`,
            'dark_mode': `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
                `<path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg>`
        };

        document.querySelectorAll('span.material-symbols-outlined').forEach(sp => {
            if (sp.dataset.fallbackApplied) return;
            const name = (sp.textContent || '').trim();
            const svgHtml = iconSvgs[name] || null;
            if (svgHtml) {
                // insert the SVG inside the span so existing JS toggles still target the span
                const wrapper = document.createElement('span');
                wrapper.innerHTML = svgHtml;
                // clear text and append svg node
                sp.textContent = '';
                sp.appendChild(wrapper.firstElementChild);
                sp.dataset.fallbackApplied = '1';
            }
        });
    }

    // Detect whether the Material Symbols font is actually active. If it is,
    // add `material-loaded` to the <html> element so CSS can toggle visibility
    // between the font span and the inline SVG fallback.
    function detectMaterialSymbols() {
        // Prefer Font Loading API check if available
        try {
            if (document.fonts && typeof document.fonts.check === 'function') {
                // Ask whether the Material Symbols face is available for 1em
                const ok = document.fonts.check("1em 'Material Symbols Outlined'");
                if (ok) {
                    document.documentElement.classList.add('material-loaded');
                    return true;
                }
            }
        } catch (e) {
            // continue to fallback
        }

        // Fallback: measure rendered width of a test string using the symbol font vs a generic fallback.
        // If widths differ meaningfully, the font likely applied.
        try {
            const testText = 'speed';
            const span = document.createElement('span');
            span.style.position = 'absolute';
            span.style.opacity = '0';
            span.style.left = '-9999px';
            span.style.top = '-9999px';
            span.style.fontSize = '16px';
            span.textContent = testText;
            // first measure with the symbol font declared
            span.style.fontFamily = "'Material Symbols Outlined', monospace";
            document.body.appendChild(span);
            const widthWith = span.getBoundingClientRect().width;
            // then force a generic fallback and measure
            span.style.fontFamily = 'monospace';
            const widthWithout = span.getBoundingClientRect().width;
            document.body.removeChild(span);
            if (Math.abs(widthWith - widthWithout) > 0.5) {
                document.documentElement.classList.add('material-loaded');
                return true;
            }
        } catch (e) {
            // ignore
        }

        document.documentElement.classList.remove('material-loaded');
        return false;
    }

    // Run detection early and also after font loading events if available.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        detectMaterialSymbols();
    } else {
        document.addEventListener('DOMContentLoaded', detectMaterialSymbols, { once: true });
    }
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(detectMaterialSymbols).catch(() => {});
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
