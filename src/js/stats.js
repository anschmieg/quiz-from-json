document.addEventListener('DOMContentLoaded', () => {
    // Multi-quiz support
    let currentQuizId = localStorage.getItem('currentQuizId') || 'semlex';
    const STATS_PREFIX = 'quizStats_';
    
    const TOPIC_SEPARATORS = /\s*\|\s*|\s*-\s*|\s*–\s*|;\s*|:\s*|\/|\s*>\s*/;
    let allQuestions = [];
    let quizTitle = '';
    let userStats = {};

    // DOM Elements
    const masterySummaryEl = document.getElementById('mastery-summary');
    const masterySummaryBarEl = document.getElementById('mastery-summary-bar');
    const weakestTopicSummaryEl = document.getElementById('weakest-topic-summary');
    const weakestTopicAccuracyEl = document.getElementById('weakest-topic-accuracy');
    const topicsTbody = document.getElementById('topics-tbody');
    const quizSelect = document.getElementById('quiz-select');

    function getStorageKey() {
        return STATS_PREFIX + currentQuizId;
    }

    function loadData() {
        try {
            const storedStats = localStorage.getItem(getStorageKey());
            userStats = storedStats ? JSON.parse(storedStats) : {};
        } catch (e) { userStats = {}; }
    }
    
    function calculateAccuracy(history) {
        if (!history || history.length === 0) return { correct: 0, total: 0, percentage: 0 };
        const correct = history.filter(Boolean).length;
        const total = history.length;
        const percentage = Math.round((correct / total) * 100);
        return { correct, total, percentage };
    }

    function calculateImprovement(history) {
        if (!history || history.length < 4) return { text: "N/A", value: 0 };
        const half = Math.ceil(history.length / 2);
        const firstHalf = history.slice(0, half);
        const secondHalf = history.slice(-half);
        const firstHalfAccuracy = calculateAccuracy(firstHalf).percentage;
        const secondHalfAccuracy = calculateAccuracy(secondHalf).percentage;
        const improvement = secondHalfAccuracy - firstHalfAccuracy;

        if (improvement > 0) return { text: `<span class="improving">+${improvement}%</span>`, value: improvement };
        if (improvement < 0) return { text: `<span class="declining">${improvement}%</span>`, value: improvement };
        return { text: `<span>Stable</span>`, value: 0 };
    }
    
    function normalizeTopicPaths(rawTopic) {
        const normalized = [];
        if (Array.isArray(rawTopic)) {
            rawTopic.forEach(entry => {
                if (typeof entry !== 'string') return;
                const trimmed = entry.trim();
                if (!trimmed) return;
                const segments = trimmed.split(TOPIC_SEPARATORS).map(part => part.trim()).filter(Boolean);
                if (segments.length) normalized.push(segments);
            });
        } else if (typeof rawTopic === 'string' && rawTopic.trim()) {
            const segments = rawTopic.split(TOPIC_SEPARATORS).map(part => part.trim()).filter(Boolean);
            if (segments.length) normalized.push(segments);
        }
        return normalized.length ? normalized : [['General']];
    }

    function buildTopicTree(questions) {
        const root = { name: 'All Topics', children: {}, history: [] };

        questions.forEach(q => {
            const stats = userStats[q.id];
            const history = Array.isArray(stats?.history) ? stats.history : [];
            if (history.length === 0) return;

            const topicPaths = normalizeTopicPaths(q.topic);
            const seenPaths = new Set();

            topicPaths.forEach(path => {
                const key = path.join('|||');
                if (seenPaths.has(key)) return;
                seenPaths.add(key);

                let currentNode = root;
                path.forEach(part => {
                    if (!currentNode.children[part]) {
                        currentNode.children[part] = { name: part, children: {}, history: [] };
                    }
                    currentNode = currentNode.children[part];
                    currentNode.history.push(...history);
                });
            });
            root.history.push(...history);
        });
        return root;
    }

    function renderTopicRows(node, depth, parentId) {
        let html = '';
        const nodeId = parentId ? `${parentId}-${node.name.replace(/\s+/g, '-')}` : node.name.replace(/\s+/g, '-');
        const accuracy = calculateAccuracy(node.history);
        const improvement = calculateImprovement(node.history);
        const historyHtml = node.history.slice(-10).map(isCorrect => `<span class="history-dot ${isCorrect ? 'correct' : 'incorrect'}"></span>`).join('');
        
        const hasChildren = Object.keys(node.children).length > 0;
        const toggleIcon = hasChildren ? `<span class="toggle-icon">+</span>` : '';

        html += `
            <tr class="topic-row ${parentId ? `child-of-${parentId}` : ''}" data-id="${nodeId}" data-depth="${depth}" style="display: ${depth > 0 ? 'none' : 'table-row'};">
                <td style="padding-left: ${depth * 20 + 10}px;">${toggleIcon}${node.name}</td>
                <td>${accuracy.percentage}% (${accuracy.correct}/${accuracy.total})</td>
                <td>${improvement.text}</td>
                <td>${historyHtml || 'N/A'}</td>
            </tr>
        `;

        if (hasChildren) {
            for (const childName in node.children) {
                html += renderTopicRows(node.children[childName], depth + 1, nodeId);
            }
        }
        return html;
    }

    function findWeakestTopic(node) {
        let weakest = { name: 'N/A', accuracy: 101 };
        if (node.history.length > 0) {
            const accuracy = calculateAccuracy(node.history).percentage;
            if (accuracy < weakest.accuracy) {
                weakest = { name: node.name, accuracy };
            }
        }
        for (const childName in node.children) {
            const childWeakest = findWeakestTopic(node.children[childName]);
            if (childWeakest.accuracy < weakest.accuracy) {
                weakest = childWeakest;
            }
        }
        return weakest;
    }

    async function loadStatsForQuiz(quizId) {
        currentQuizId = quizId;
        localStorage.setItem('currentQuizId', quizId);
        
        try {
            const response = await fetch(`/_data/${quizId}.json`);
            if (!response.ok) throw new Error('Could not load question data.');
            const data = await response.json();
            allQuestions = data.questions || [];
            quizTitle = data.title || 'Quiz';
            
            loadData();
            
            const topicTree = buildTopicTree(allQuestions);
            
            // Render main table
            topicsTbody.innerHTML = renderTopicRows(topicTree, 0, null);

            // Render summary cards
            const mastery = calculateAccuracy(topicTree.history);
            masterySummaryEl.textContent = `${mastery.percentage}% (${mastery.correct}/${mastery.total})`;
            masterySummaryBarEl.style.width = `${mastery.percentage}%`;

            const weakest = findWeakestTopic(topicTree);
            weakestTopicSummaryEl.textContent = weakest.name;
            weakestTopicAccuracyEl.textContent = `at ${weakest.accuracy}% accuracy`;

            // Update page title
            const pageTitle = document.querySelector('.stats-page-container h1');
            if (pageTitle) {
                pageTitle.textContent = `${quizTitle} - Progress Breakdown`;
            }

            // Add event listeners for folding/unfolding
            topicsTbody.removeEventListener('click', handleTopicClick);
            topicsTbody.addEventListener('click', handleTopicClick);

        } catch (error) {
            console.error("Failed to load stats:", error);
            topicsTbody.innerHTML = '<tr><td colspan="4">Error loading stats. Please try again.</td></tr>';
        }
    }

    function handleTopicClick(e) {
        const row = e.target.closest('.topic-row');
        if (row && row.querySelector('.toggle-icon')) {
            const rowId = row.dataset.id;
            const children = topicsTbody.querySelectorAll(`.child-of-${rowId}`);
            const icon = row.querySelector('.toggle-icon');
            const isExpanded = icon.textContent === '-';

            children.forEach(child => {
                if (isExpanded) {
                    child.style.display = 'none';
                    const grandChildren = topicsTbody.querySelectorAll(`.child-of-${child.dataset.id}`);
                    grandChildren.forEach(gc => gc.style.display = 'none');
                    if(child.querySelector('.toggle-icon')) child.querySelector('.toggle-icon').textContent = '+';
                } else {
                    if (parseInt(child.dataset.depth) === parseInt(row.dataset.depth) + 1) {
                        child.style.display = 'table-row';
                    }
                }
            });
            icon.textContent = isExpanded ? '+' : '-';
        }
    }

    // Quiz selector change handler
    if (quizSelect) {
        quizSelect.value = currentQuizId;
        quizSelect.addEventListener('change', (e) => {
            loadStatsForQuiz(e.target.value);
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

    loadStatsForQuiz(currentQuizId);
});
