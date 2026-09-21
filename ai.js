const DEFAULT_GEMINI_API_KEY = "AIzaSyBSfj3753Yg-07AehpNgExGev1N6u4cL9g";
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const answerBox = document.getElementById("answer");
const questionInput = document.getElementById("question");
const askButton = document.getElementById("askBtn");
const speakButton = document.getElementById("speakBtn");
const summaryButton = document.getElementById("summaryBtn");

let lastNarration = "";
let cachedModels = null;

function getTutorState() {
  return window.gravityLabState || {
    velocity: 7.9,
    circular: 7.67,
    escape: 10.85,
    gravityAccel: 8.69,
    force: 8690,
    ratio: 1.03,
    energyPerKg: -29.4,
    state: "Stable orbit",
    type: "Circle",
    planet: "Earth",
    lesson: "Velocity is close to circular speed, so gravity bends the motion into orbit."
  };
}

function getGeminiApiKey() {
  return sessionStorage.getItem("gemini-api-key") || DEFAULT_GEMINI_API_KEY;
}

function buildPrompt(question) {
  const state = getTutorState();
  return `
You are the friendly AI tutor inside a futuristic learning game called Gravity Motion Lab.

Student request: ${question}

Current simulator values:
- Planet/world: ${state.planet || "Earth"}
- Launch velocity: ${state.velocity.toFixed(1)} km/s
- Circular orbit speed: ${state.circular.toFixed(2)} km/s
- Escape velocity: ${state.escape.toFixed(2)} km/s
- Gravity acceleration: ${state.gravityAccel.toFixed(2)} m/s^2
- Gravity force: ${(state.force / 1000).toFixed(2)} kN
- Velocity ratio: ${state.ratio.toFixed(2)}x circular speed
- Outcome: ${state.state}
- Path type: ${state.type}

Explain in simple English for a student. Use the numbers above. Keep it under 110 words.
`;
}

function extractGeminiText(data) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function askAI(customQuestion) {
  const question = (customQuestion || questionInput.value).trim();
  if (!question) {
    answerBox.textContent = "Ask a question like: why does higher velocity escape gravity?";
    return;
  }

  sessionStorage.setItem("asked-tutor", "1");
  askButton.disabled = true;
  answerBox.textContent = "AI tutor is thinking...";

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("Missing Gemini API key.");
    const text = await callGemini(apiKey, question);
    if (!text) throw new Error("Gemini returned an empty response.");
    answerBox.textContent = text;
    lastNarration = text;
  } catch (error) {
    console.error(error);
    if (/denied access|api key|permission|forbidden|403/i.test(error.message)) {
      sessionStorage.removeItem("gemini-api-key");
    }
    answerBox.textContent = `AI request failed: ${error.message}`;
    lastNarration = "";
  } finally {
    askButton.disabled = false;
    if (window.updateGravityProgress) window.updateGravityProgress();
  }
}

async function callGemini(apiKey, question) {
  let lastError = "";
  const models = await getAvailableGeminiModels(apiKey);

  for (const model of models) {
    const modelPath = model.startsWith("models/") ? model : `models/${model}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(question) }] }],
        generationConfig: { temperature: 0.45, maxOutputTokens: 700 }
      })
    });

    const data = await response.json();
    if (response.ok) return extractGeminiText(data);
    lastError = data.error?.message || `Gemini request failed for ${modelPath}.`;
  }

  throw new Error(lastError);
}

async function getAvailableGeminiModels(apiKey) {
  if (cachedModels) return cachedModels;

  try {
    const response = await fetch(`${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not list Gemini models.");
    const available = (data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => model.name)
      .sort((a, b) => getModelRank(a) - getModelRank(b));
    if (available.length > 0) {
      cachedModels = available;
      return cachedModels;
    }
  } catch (error) {
    console.warn("Gemini model listing failed. Trying default model names.", error);
  }
  cachedModels = GEMINI_MODELS;
  return cachedModels;
}

function getModelRank(modelName) {
  if (modelName.includes("2.0-flash")) return 0;
  if (modelName.includes("flash-latest")) return 1;
  if (modelName.includes("2.5-flash")) return 2;
  if (modelName.includes("flash")) return 0;
  if (modelName.includes("pro")) return 1;
  return 2;
}

function speak(text) {
  const message = text || answerBox.textContent || lastNarration;
  if (!("speechSynthesis" in window) || !message) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.95;
  utterance.pitch = 1.04;
  speechSynthesis.speak(utterance);
}

askButton.addEventListener("click", () => askAI());
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") askAI();
});
speakButton.addEventListener("click", () => speak());
summaryButton.addEventListener("click", () => askAI("Generate a short topic summary about gravity, velocity, orbit, escape velocity, free fall, and planet gravity."));

window.askAI = askAI;
