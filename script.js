document.addEventListener('DOMContentLoaded', () => {
    const questionElement = document.getElementById('question');
    const optionsContainer = document.getElementById('options-container');
    const nextButton = document.getElementById('next-button');
    const resultElement = document.getElementById('result');

    let questions = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let answered = false;

    // Cargar preguntas desde questions.json
    fetch('questions.json')
        .then(response => response.json())
        .then(data => {
            questions = data;
            loadQuestion();
        })
        .catch(error => console.error('Error al cargar las preguntas:', error));

    function loadQuestion() {
        answered = false;
        const currentQuestion = questions[currentQuestionIndex];
        questionElement.textContent = currentQuestion.question;
        optionsContainer.innerHTML = '';
        resultElement.textContent = '';
        nextButton.style.display = 'none'; // Ocultar botón "Siguiente" al cargar nueva pregunta

        currentQuestion.options.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option;
            button.classList.add('option-button');
            button.addEventListener('click', () => selectOption(button, option, currentQuestion.answer));
            optionsContainer.appendChild(button);
        });
    }

    function selectOption(selectedButton, selectedAnswer, correctAnswer) {
        if (answered) return; // Evitar que el usuario seleccione múltiples opciones
        answered = true;

        const allOptionButtons = optionsContainer.querySelectorAll('.option-button');
        allOptionButtons.forEach(button => {
            button.disabled = true; // Deshabilitar todos los botones después de seleccionar una opción
            if (button.textContent === correctAnswer) {
                button.classList.add('correct');
            } else if (button === selectedButton && selectedAnswer !== correctAnswer) {
                button.classList.add('wrong');
            }
        });

        if (selectedAnswer === correctAnswer) {
            score++;
            resultElement.textContent = '¡Correcto! 🎉';
            resultElement.style.color = '#4CAF50';
        } else {
            resultElement.textContent = `Incorrecto. La respuesta correcta era: ${correctAnswer} 😢`;
            resultElement.style.color = '#F44336';
        }
        nextButton.style.display = 'block'; // Mostrar botón "Siguiente"
    }

    nextButton.addEventListener('click', () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < questions.length) {
            loadQuestion();
        } else {
            displayFinalResult();
        }
    });

    function displayFinalResult() {
        questionElement.textContent = `¡Juego Terminado! Tu puntuación final es: ${score} de ${questions.length}`;
        optionsContainer.innerHTML = '';
        nextButton.style.display = 'none';
        resultElement.textContent = '¡Gracias por jugar!';
        resultElement.style.color = '#333';
    }
});