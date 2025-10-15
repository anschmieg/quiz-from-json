document.addEventListener('DOMContentLoaded', () => {
    const STATS_STORAGE_KEY = 'quizUserStats';
    let allQuestions = [];
    let userStats = {};

    // DOM Elements
    const masterySummaryEl = document.getElementById('mastery-summary');
    const masterySummaryBarEl = document.getElementById('mastery-summary-bar');
    const weakestTopicSummaryEl = document.getElementById('weakest-topic-summary');
    const weakestTopicAccuracyEl = document.getElementById('weakest-topic-accuracy');
    const topicsTbody = document.getElementById('topics-tbody');

    function loadData() {
        try {
            const storedStats = localStorage.getItem(STATS_STORAGE_KEY);
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

    // **NEW**: More accurate improvement calculation
    function calculateImprovement(history) {
        if (!history || history.length < 4) return { text: "N/A", value: 0 }; // Need at least 2 answers in each half
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
    
    // **NEW**: Recursive function to build the nested topic tree
    function buildTopicTree(questions) {
        const root = { name: 'All Topics', children: {}, history: [] };
        const topicSeparators = / \| | - | – |; |: /;

        questions.forEach(q => {
            const stats = userStats[q.id];
            if (!stats || stats.history.length === 0) return;

            const path = (q.topic || 'General').split(topicSeparators).map(t => t.trim());
            let currentNode = root;
            
            path.forEach(part => {
                if (!currentNode.children[part]) {
                    currentNode.children[part] = { name: part, children: {}, history: [] };
                }
                currentNode = currentNode.children[part];
                currentNode.history.push(...stats.history);
            });
            root.history.push(...stats.history);
        });
        return root;
    }

    // **NEW**: Recursive function to render the foldable table
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

    async function initializeStatsPage() {
        try {
            const response = await fetch('/_data/questions.json');
            if (!response.ok) throw new Error('Could not load question data.');
            const data = await response.json();
            allQuestions = data.questions || [];
            
            loadData();
            
            const topicTree = buildTopicTree(allQuestions);
            
            // Render main table
            topicsTbody.innerHTML = renderTopicRows(topicTree, 0, null);

            // Render summary cards
            const mastery = calculateAccuracy(topicTree.history); // Overall accuracy
            masterySummaryEl.textContent = `${mastery.percentage}% (${mastery.correct}/${mastery.total})`;
            masterySummaryBarEl.style.width = `${mastery.percentage}%`;

            const weakest = findWeakestTopic(topicTree);
            weakestTopicSummaryEl.textContent = weakest.name;
            weakestTopicAccuracyEl.textContent = `at ${weakest.accuracy}% accuracy`;

            // Add event listeners for folding/unfolding
            topicsTbody.addEventListener('click', e => {
                const row = e.target.closest('.topic-row');
                if (row && row.querySelector('.toggle-icon')) {
                    const rowId = row.dataset.id;
                    const children = topicsTbody.querySelectorAll(`.child-of-${rowId}`);
                    const icon = row.querySelector('.toggle-icon');
                    const isExpanded = icon.textContent === '-';

                    children.forEach(child => {
                        if (isExpanded) {
                            child.style.display = 'none';
                            // Also hide grandchildren
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
            });

        } catch (error) {
            console.error("Failed to initialize stats page:", error);
            topicsTbody.innerHTML = '<tr><td colspan="4">Error loading stats. Please try again.</td></tr>';
        }
    }

    initializeStatsPage();
});

