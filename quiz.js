const quizData = [
  {
    module: "Gravity Basics",
    type: "mcq",
    question: "Mass and weight are different because...",
    options: [
      "mass is matter, while weight is gravity pulling on that mass",
      "mass only exists on Earth",
      "weight never changes on other planets"
    ],
    correct: 0,
    feedback: "Correct. Mass stays the same, but weight changes when gravity changes."
  },
  {
    module: "Velocity & Orbit",
    type: "mcq",
    question: "What happens if velocity exceeds escape velocity?",
    options: [
      "The object follows an open escape path",
      "Gravity becomes zero instantly",
      "The object must crash into the planet"
    ],
    correct: 0,
    feedback: "Correct. Gravity still pulls, but the object has enough energy to leave."
  },
  {
    module: "Velocity & Orbit",
    type: "mcq",
    question: "Why does a satellite stay in orbit instead of falling straight down?",
    options: [
      "It has sideways velocity while gravity pulls inward",
      "There is no gravity in space",
      "Solar panels push it upward"
    ],
    correct: 0,
    feedback: "Correct. Orbit is continuous falling around the planet."
  },
  {
    module: "Planet Lab",
    type: "mcq",
    question: "On the Moon, the same throw travels farther than on Earth mainly because...",
    options: [
      "the Moon has lower gravity",
      "the ball has more mass",
      "velocity does not matter"
    ],
    correct: 0,
    feedback: "Correct. Lower gravity gives the projectile more time before it lands."
  },
  {
    module: "Drag Lab",
    type: "drag",
    question: "Match each launch speed with the likely outcome.",
    pairs: [
      { term: "Low velocity", match: "Falls back" },
      { term: "Orbital velocity", match: "Stable orbit" },
      { term: "Escape velocity", match: "Leaves planet" }
    ],
    feedback: "Great matching. Velocity decides whether gravity wins, balances, or gets escaped."
  }
];

const titleEl = document.getElementById("quizTitle");
const questionEl = document.getElementById("quizQuestion");
const optionsEl = document.getElementById("quizOptions");
const dragZone = document.getElementById("dragZone");
const resultEl = document.getElementById("quizResult");
const scoreEl = document.getElementById("scoreText");
const quizProgress = document.getElementById("quizProgress");

let currentQuestion = Number(sessionStorage.getItem("gml-current-question") || 0);
let score = Number(sessionStorage.getItem("gml-quiz-score") || 0);
let answeredCount = Number(sessionStorage.getItem("gml-quiz-answered") || 0);
let dragMatches = new Map();
let quizScoreSaved = false;

function persistQuiz() {
  sessionStorage.setItem("gml-current-question", String(currentQuestion));
  sessionStorage.setItem("gml-quiz-score", String(score));
  sessionStorage.setItem("gml-quiz-answered", String(answeredCount));
}

function updateScore() {
  scoreEl.textContent = `Score: ${score}/${quizData.length}`;
  quizProgress.style.width = `${Math.min(100, (answeredCount / quizData.length) * 100)}%`;
  window.gravityQuizScore = score;
  window.gravityQuizAnswered = answeredCount;
  persistQuiz();
  if (window.updateGravityProgress) window.updateGravityProgress();
}

function loadQuiz() {
  if (currentQuestion >= quizData.length) {
    saveCompletedQuizScore();
    titleEl.textContent = "Mission Complete";
    questionEl.textContent = "Quiz finished";
    optionsEl.innerHTML = "";
    dragZone.innerHTML = "";
    resultEl.textContent = `Final score: ${score}/${quizData.length}. ${score >= 4 ? "Excellent mission performance." : "Review the lab and run another attempt."}`;

    const answers = document.createElement("div");
    answers.className = "answer-key";
    answers.innerHTML = quizData.map((item, index) => {
      const answer = item.type === "drag"
        ? item.pairs.map((pair) => `${pair.term} = ${pair.match}`).join(", ")
        : item.options[item.correct];
      return `<p><b>${index + 1}. ${item.module}</b><span>${answer}</span></p>`;
    }).join("");
    optionsEl.appendChild(answers);

    const retry = document.createElement("button");
    retry.className = "primary-btn";
    retry.type = "button";
    retry.textContent = "Restart quiz";
    retry.addEventListener("click", () => {
      currentQuestion = 0;
      score = 0;
      answeredCount = 0;
      quizScoreSaved = false;
      sessionStorage.removeItem("gml-quiz-complete");
      sessionStorage.removeItem("gml-last-saved-quiz-score");
      updateScore();
      loadQuiz();
    });
    optionsEl.appendChild(retry);
    return;
  }

  const item = quizData[currentQuestion];
  titleEl.textContent = item.module;
  questionEl.textContent = item.question;
  resultEl.textContent = item.type === "drag" ? "Drag each card onto the matching outcome." : "Choose an answer for instant feedback.";
  optionsEl.innerHTML = "";
  dragZone.innerHTML = "";
  dragMatches = new Map();

  if (item.type === "drag") {
    loadDragQuestion(item);
  } else {
    loadMcqQuestion(item);
  }
  updateScore();
}

function saveCompletedQuizScore() {
  const quizSignature = `${score}/${quizData.length}`;
  if (quizScoreSaved || sessionStorage.getItem("gml-last-saved-quiz-score") === quizSignature) return;

  quizScoreSaved = true;
  sessionStorage.setItem("gml-quiz-complete", "1");
  sessionStorage.setItem("gml-last-saved-quiz-score", quizSignature);

  if (window.GravityFirestore) {
    window.GravityFirestore.saveQuizScore(score, quizData.length);
    window.GravityFirestore.saveProgress();
  } else {
    console.warn("[Firestore] Quiz finished, but Firestore integration is not loaded.");
  }
}

function loadMcqQuestion(item) {
  item.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => checkAnswer(index));
    optionsEl.appendChild(button);
  });
}

function checkAnswer(answerIndex) {
  const item = quizData[currentQuestion];
  const buttons = [...optionsEl.querySelectorAll("button")];
  const correctAnswer = item.options[item.correct];

  buttons.forEach((button, index) => {
    button.disabled = true;
    if (index === item.correct) button.classList.add("correct");
    if (index === answerIndex && index !== item.correct) button.classList.add("wrong");
  });

  if (answerIndex === item.correct) {
    score += 1;
    resultEl.textContent = `${item.feedback} Answer: ${correctAnswer}`;
  } else {
    resultEl.textContent = `Not quite. Answer: ${correctAnswer}. ${item.feedback.replace("Correct. ", "")}`;
  }

  answeredCount += 1;
  currentQuestion += 1;
  updateScore();
  setTimeout(loadQuiz, 1250);
}

function loadDragQuestion(item) {
  const cards = [...item.pairs].sort(() => Math.random() - 0.5);
  const targets = [...item.pairs].sort(() => Math.random() - 0.5);

  cards.forEach((pair) => {
    const card = document.createElement("div");
    card.className = "drag-card";
    card.draggable = true;
    card.textContent = pair.term;
    card.dataset.term = pair.term;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", pair.term);
    });
    dragZone.appendChild(card);
  });

  targets.forEach((pair) => {
    const drop = document.createElement("div");
    drop.className = "drop-card";
    drop.textContent = pair.match;
    drop.dataset.match = pair.match;
    drop.addEventListener("dragover", (event) => event.preventDefault());
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      const term = event.dataTransfer.getData("text/plain");
      dragMatches.set(term, pair.match);
      drop.textContent = `${pair.match}: ${term}`;
      evaluateDrag(item);
    });
    dragZone.appendChild(drop);
  });
}

function evaluateDrag(item) {
  if (dragMatches.size < item.pairs.length) return;
  let correct = 0;
  item.pairs.forEach((pair) => {
    if (dragMatches.get(pair.term) === pair.match) correct += 1;
  });

  [...dragZone.querySelectorAll(".drop-card")].forEach((drop) => {
    const pair = item.pairs.find((candidate) => dragMatches.get(candidate.term) === drop.dataset.match);
    drop.classList.add(pair && pair.match === drop.dataset.match ? "correct" : "wrong");
  });

  if (correct === item.pairs.length) {
    score += 1;
    resultEl.textContent = `${item.feedback} Answers: ${getDragAnswerText(item)}`;
  } else {
    resultEl.textContent = `You matched ${correct}/${item.pairs.length}. Answers: ${getDragAnswerText(item)}`;
  }

  answeredCount += 1;
  currentQuestion += 1;
  updateScore();
  setTimeout(loadQuiz, 1500);
}

function getDragAnswerText(item) {
  return item.pairs.map((pair) => `${pair.term} = ${pair.match}`).join("; ");
}

updateScore();
loadQuiz();
