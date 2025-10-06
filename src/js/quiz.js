document.addEventListener('DOMContentLoaded', () => {
    const quizForm = document.getElementById('quiz-form');
    if (!quizForm) return;

    // Fetch the quiz data once to get the correct answers
    let correctAnswersData = {};
    fetch('/_data/questions.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("Could not load questions.json");
            }
            return response.json();
        })
        .then(data => {
            // Create a map for quick answer lookup
            correctAnswersData = data.items.reduce((acc, q) => {
                acc[q.id] = q.correctAnswer;
                return acc;
            }, {});
        })
        .catch(error => {
            console.error("Error fetching quiz data:", error);
            const resultsContainer = document.getElementById('results-container');
            if(resultsContainer) {
                resultsContainer.innerHTML = '<h2>Error</h2><p>Could not load the quiz questions. Please check the console for details.</p>';
            }
        });

    quizForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        if (Object.keys(correctAnswersData).length === 0) {
            alert('Quiz data is not loaded yet. Please try again in a moment.');
            return;
        }

        let score = 0;
        const totalQuestions = Object.keys(correctAnswersData).length;
        const formData = new FormData(quizForm);

        // Clear previous feedback
        document.querySelectorAll('.feedback').forEach(el => el.innerHTML = '');
        
        for (const [id, correctAnswer] of Object.entries(correctAnswersData)) {
            const userAnswer = formData.get(id);
            const feedbackEl = document.getElementById(`feedback-${id}`);

            if (userAnswer) {
                if (userAnswer === correctAnswer) {
                    score++;
                    feedbackEl.textContent = '✅ Correct!';
                    feedbackEl.className = 'feedback correct';
                } else {
                    feedbackEl.textContent = `❌ Incorrect. The correct answer is: ${correctAnswer}`;
                    feedbackEl.className = 'feedback incorrect';
                }
            } else {
                feedbackEl.textContent = '⚠️ You did not answer this question.';
                feedbackEl.className = 'feedback incorrect';
            }
        }
        
        const resultsContainer = document.getElementById('results-container');
        const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
        resultsContainer.innerHTML = `<h2>Quiz Complete!</h2>
            <p>You scored <strong>${score}</strong> out of <strong>${totalQuestions}</strong> (${percentage}%)</p>`;
        
        resultsContainer.focus();
    });
});
