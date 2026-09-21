(function () {
  const CONFIG = window.GRAVITY_FIREBASE_CONFIG || {};
  const USER_ID_KEY = "gml-user-id";
  const USER_PROFILE_KEY = "gml-user-profile";
  const PROGRESS_BACKUP_KEY = "gml-progress-backup";
  const QUIZ_BACKUP_KEY = "gml-quiz-score-backup";
  const MODULE_FLAGS = {
    "Gravity Basics": "completed-basics",
    "Velocity & Orbit": "used-sim",
    "AI Tutor": "asked-tutor",
    "Planet Lab": "used-planet-lab",
    "Quiz Arena": "gml-quiz-complete"
  };

  let db = null;
  let initialized = false;

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      console.warn(`[Firestore] Ignoring invalid local backup for ${key}.`, error);
      return fallback;
    }
  }

  function hasFirebaseConfig() {
    return Boolean(
      CONFIG.apiKey &&
      CONFIG.projectId &&
      !String(CONFIG.apiKey).startsWith("YOUR_") &&
      !String(CONFIG.projectId).startsWith("YOUR_")
    );
  }

  function createUserId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `gml-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getUserId() {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = createUserId();
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  }

  function getUserProfile() {
    const savedProfile = readJson(USER_PROFILE_KEY, {});
    return {
      userId: getUserId(),
      name: savedProfile.name || "Gravity Learner",
      email: savedProfile.email || "",
      createdAt: savedProfile.createdAt || new Date().toISOString()
    };
  }

  function initFirebase() {
    if (initialized) return Boolean(db);
    initialized = true;

    if (!hasFirebaseConfig()) {
      console.warn("[Firestore] Firebase config is missing. Local storage backup remains active.");
      return false;
    }

    if (!window.firebase || !firebase.firestore) {
      console.error("[Firestore] Firebase Firestore SDK was not loaded.");
      return false;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG);
      db = firebase.firestore();
      console.log("[Firestore] Firebase Firestore initialized successfully.");
      ensureUser();
      return true;
    } catch (error) {
      console.error("[Firestore] Firebase initialization failed:", error);
      return false;
    }
  }

  async function ensureUser() {
    if (!initFirebase()) return getUserProfile();

    const profile = getUserProfile();
    try {
      const userRef = db.collection("users").doc(profile.userId);
      const snapshot = await userRef.get();
      const userData = {
        userId: profile.userId,
        name: profile.name,
        email: profile.email
      };
      if (!snapshot.exists) userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

      await userRef.set(userData, { merge: true });
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
      console.log("[Firestore] User profile saved.");
    } catch (error) {
      console.error("[Firestore] Failed to save user profile:", error);
    }
    return profile;
  }

  function getCompletedModules() {
    return Object.entries(MODULE_FLAGS)
      .filter(([, key]) => Number(sessionStorage.getItem(key) || 0) > 0)
      .map(([module]) => module);
  }

  function getProgressPercentage() {
    const progressText = localStorage.getItem("gml-progress") || "0%";
    const progressFill = document.getElementById("progressFill");
    const liveProgress = progressFill ? progressFill.style.width : progressText;
    return Number.parseInt(liveProgress || progressText, 10) || 0;
  }

  function applyProgress(progressData) {
    if (!progressData) return;

    (progressData.completedModules || []).forEach((module) => {
      const flag = MODULE_FLAGS[module];
      if (flag) sessionStorage.setItem(flag, "1");
    });

    const percentage = Number(progressData.progressPercentage || 0);
    localStorage.setItem("gml-progress", `${percentage}%`);
    localStorage.setItem(PROGRESS_BACKUP_KEY, JSON.stringify(progressData));

    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    if (progressFill && progressText) {
      progressFill.style.width = `${percentage}%`;
      progressText.textContent = `${percentage}% complete`;
    }

    window.dispatchEvent(new CustomEvent("gravity-progress-loaded", {
      detail: progressData
    }));
  }

  async function loadProgress() {
    const backup = readJson(PROGRESS_BACKUP_KEY, null);
    if (backup) applyProgress(backup);

    if (!initFirebase()) return backup;

    try {
      const userId = getUserId();
      const snapshot = await db.collection("progress").doc(userId).get();
      if (!snapshot.exists) {
        console.log("[Firestore] No saved progress found yet.");
        return backup;
      }

      const progressData = snapshot.data();
      applyProgress(progressData);
      console.log("[Firestore] Saved progress loaded.");
      if (window.updateGravityProgress) window.updateGravityProgress();
      return progressData;
    } catch (error) {
      console.error("[Firestore] Failed to load saved progress:", error);
      return backup;
    }
  }

  async function saveProgress(progressOverride) {
    const progressData = {
      userId: getUserId(),
      completedModules: getCompletedModules(),
      progressPercentage: Number(progressOverride ?? getProgressPercentage()),
      lastUpdated: new Date().toISOString()
    };

    localStorage.setItem(PROGRESS_BACKUP_KEY, JSON.stringify(progressData));
    localStorage.setItem("gml-progress", `${progressData.progressPercentage}%`);

    if (!initFirebase()) return progressData;

    try {
      await db.collection("progress").doc(progressData.userId).set({
        ...progressData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log("[Firestore] Progress saved successfully.");
    } catch (error) {
      console.error("[Firestore] Failed to save progress:", error);
    }
    return progressData;
  }

  async function saveQuizScore(score, totalQuestions) {
    const quizScore = {
      userId: getUserId(),
      score,
      totalQuestions,
      timestamp: new Date().toISOString()
    };

    const backup = readJson(QUIZ_BACKUP_KEY, []);
    backup.push(quizScore);
    localStorage.setItem(QUIZ_BACKUP_KEY, JSON.stringify(backup));

    if (!initFirebase()) return quizScore;

    try {
      await db.collection("quizScores").add({
        ...quizScore,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("[Firestore] Quiz score saved successfully.");
    } catch (error) {
      console.error("[Firestore] Failed to save quiz score:", error);
    }
    return quizScore;
  }

  window.GravityFirestore = {
    getUserId,
    ensureUser,
    loadProgress,
    saveProgress,
    saveQuizScore,
    getCompletedModules
  };

  document.addEventListener("DOMContentLoaded", () => {
    initFirebase();
    loadProgress();
  });
}());
