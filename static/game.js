console.log("game.js loaded at", new Date().toISOString());

// DOM Elements
const canvas = document.getElementById("game-canvas");
const ctx = canvas?.getContext("2d");
const modal = document.getElementById("modal");
const scoreZone = document.getElementById("score-zone");
const animalZone = document.getElementById("animal-zone");
const restartButton = document.getElementById("restart-button");
const pauseButton = document.getElementById("pause-button");
const resetButton = document.getElementById("reset-button");
const leaderboardContainer = document.getElementById("leaderboard-table");

// Validate DOM elements
if (!modal) console.error("Modal element not found");
if (!canvas) console.error("Canvas element not found");
if (!ctx) console.error("Canvas context not found");
if (!scoreZone) console.error("Score zone not found");
if (!animalZone) console.error("Animal zone not found");
if (!restartButton) console.error("Restart button not found");
if (!pauseButton) console.error("Pause button not found");
if (!resetButton) console.error("Reset button not found");
if (!leaderboardContainer) console.error("Leaderboard container not found");

// Game Constants
const GRID_SIZE = 8;
let SQUARE_SIZE = 50;
const DIFFICULTIES = {
    Easy: { flash: 3000, maxFlashes: 1 },
    Medium: { flash: 2000, maxFlashes: 2 },
    Hard: { flash: 1000, maxFlashes: 3 }
};
const TYPES = {
    blank: 0.2375,
    number: 0.2,
    letter: 0.2,
    animal: 0.075,
    trap: 0.05,
    green: 0.1,
    yellowTap: 0.05,
    red: 0.0375,
    blue: 0.0375,
    yellow: 0.0375,
    white: 0.0375
};
const ANIMALS = ["🐱", "🐶", "🐦", "🐢", "🦁", "🐼", "🐘", "🐔", "🐠"];
const TRAPS = ["snake", "black", "number0"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Game State
let activeTimeouts = [];
let particles = [];
let lastFrameTime = performance.now();
let speedUpInterval = null;
let recentAnimalTaps = [];

let localData = (() => {
    try {
        const stored = JSON.parse(localStorage.getItem("squarePulse"));
        if (stored && stored.player && Array.isArray(stored.scores)) {
            console.log("Loaded localStorage:", JSON.stringify(stored));
            return stored;
        }
    } catch (e) {
        console.error("Invalid localStorage data:", e);
    }
    const defaultData = {
        player: { name: "Guest" },
        scores: []
    };
    localStorage.setItem("squarePulse", JSON.stringify(defaultData));
    console.log("Initialized localStorage with default data");
    return defaultData;
})();

let gameState = {
    grid: Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill({
        type: "blank", state: "dormant", timer: 0, value: null, startTime: 0
    })),
    score: 0,
    lives: 4,
    streak: 0,
    slots: { letters: Array(8).fill(null), numbers: Array(8).fill(null) },
    coloredDrags: { red: 0, blue: 0, yellow: 0, white: 0 },
    greenTaps: 0,
    player: { name: localData.player.name },
    mode: "1-minute",
    difficulty: "Medium",
    flashDur: DIFFICULTIES.Medium.flash,
    activeFlashes: 0,
    activeAnimals: [],
    multiplier: 1,
    paused: true,
    timer: 60
};
let dragStart = null;
let dragActive = false;
let dragPath = [];

function adjustCanvasForMobile() {
    const isMobile = window.innerWidth <= 600;
    const logicalWidth = isMobile ? 400 : 500;
    const logicalHeight = isMobile ? 400 : 500;
    SQUARE_SIZE = logicalWidth / (GRID_SIZE + 4);
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    if (ctx) ctx.scale(dpr, dpr);
    console.log(`Canvas adjusted: logicalWidth=${logicalWidth}, logicalHeight=${logicalHeight}, canvasWidth=${canvas.width}, canvasHeight=${canvas.height}, SQUARE_SIZE=${SQUARE_SIZE}, dpr=${dpr}`);
}
adjustCanvasForMobile();

function resetGame() {
    console.log("Resetting game...");
    try {
        gameState.score = 0;
        gameState.lives = 4;
        gameState.streak = 0;
        gameState.slots.letters.fill(null);
        gameState.slots.numbers.fill(null);
        gameState.grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill({
            type: "blank", state: "dormant", timer: 0, value: null, startTime: 0
        }));
        gameState.activeFlashes = 0;
        gameState.activeAnimals = [];
        gameState.multiplier = 1;
        gameState.paused = true;
        gameState.timer = gameState.mode === "1-minute" ? 60 : gameState.mode === "2-minute" ? 120 : 0;
        gameState.flashDur = DIFFICULTIES[gameState.difficulty].flash;
        particles = [];
        recentAnimalTaps = [];
        activeTimeouts.forEach(clearTimeout);
        activeTimeouts = [];
        if (speedUpInterval) clearInterval(speedUpInterval);
        speedUpInterval = null;

        if (ctx) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#000";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("SquarePulse - Press Start", canvas.width / 2, canvas.height / 2);
        } else {
            console.error("Cannot render initial canvas: ctx is null");
            alert("Error: Canvas context not found.");
        }
        if (animalZone) animalZone.textContent = "";
        updateScoreText();

        if (!modal) {
            console.error("Cannot show home page: modal element is missing");
            alert("Error: Modal element not found.");
            return;
        }
        modal.style.display = "block";
        modal.classList.remove("hidden");

        const mode = gameState.mode;
        const difficulty = gameState.difficulty;
        const localScores = localData.scores
            .filter(entry => entry.mode === mode && entry.difficulty === difficulty)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        modal.innerHTML = `
            <h2>SquarePulse</h2>
            <p><label for="player-name">Name (3-15 chars):</label></p>
            <input id="player-name" type="text" value="${gameState.player.name}" placeholder="Enter name">
            <p><label for="mode">Mode:</label></p>
            <select id="mode">
                <option value="Endless" ${mode === "Endless" ? "selected" : ""}>Endless</option>
                <option value="1-minute" ${mode === "1-minute" ? "selected" : ""}>1-Minute</option>
                <option value="2-minute" ${mode === "2-minute" ? "selected" : ""}>2-Minute</option>
            </select>
            <p><label for="difficulty">Difficulty:</label></p>
            <select id="difficulty">
                <option value="Easy" ${difficulty === "Easy" ? "selected" : ""}>Easy</option>
                <option value="Medium" ${difficulty === "Medium" ? "selected" : ""}>Medium</option>
                <option value="Hard" ${difficulty === "Hard" ? "selected" : ""}>Hard</option>
            </select>
            <h3>Leaderboard (${difficulty} ${mode})</h3>
            <table class="leaderboard-table fade-in">
                <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                ${localScores.length > 0
                    ? localScores.map((entry, i) => `
                        <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                            <td>${i + 1}</td>
                            <td>${entry.name}</td>
                            <td>${entry.score}</td>
                        </tr>
                    `).join("")
                    : "<tr><td colspan='3'>No scores yet</td></tr>"}
            </table>
            <p><button id="start-button">Start</button></p>
        `;
        console.log(`Home page modal set up: mode=${mode}, difficulty=${difficulty}, scores=${JSON.stringify(localScores)}`);

        const modeSelect = document.getElementById("mode");
        const difficultySelect = document.getElementById("difficulty");
        const updateModalLeaderboard = () => {
            const newMode = modeSelect?.value || gameState.mode;
            const newDifficulty = difficultySelect?.value || gameState.difficulty;
            gameState.mode = newMode;
            gameState.difficulty = newDifficulty;
            gameState.timer = newMode === "1-minute" ? 60 : newMode === "2-minute" ? 120 : 0;
            gameState.flashDur = DIFFICULTIES[newDifficulty].flash;
            const scores = localData.scores
                .filter(entry => entry.mode === newMode && entry.difficulty === newDifficulty)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            const leaderboardDiv = modal.querySelector("table");
            if (leaderboardDiv) {
                leaderboardDiv.innerHTML = `
                    <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                    ${scores.length > 0
                        ? scores.map((entry, i) => `
                            <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                                <td>${i + 1}</td>
                                <td>${entry.name}</td>
                                <td>${entry.score}</td>
                            </tr>
                        `).join("")
                        : "<tr><td colspan='3'>No scores yet</td></tr>"}
                `;
                modal.querySelector("h3").textContent = `Leaderboard (${newDifficulty} ${newMode})`;
                console.log(`Modal leaderboard updated: mode=${newMode}, difficulty=${newDifficulty}, scores=${JSON.stringify(scores)}`);
            }
            updateLeaderboard(newMode, newDifficulty);
        };
        modeSelect?.addEventListener("change", updateModalLeaderboard);
        difficultySelect?.addEventListener("change", updateModalLeaderboard);

        const startButton = document.getElementById("start-button");
        if (startButton) {
            startButton.onclick = () => {
                console.log("Start button clicked");
                const playerNameInput = document.getElementById("player-name");
                const name = playerNameInput?.value.trim() || "Guest";
                if (name.length < 3 || name.length > 15) {
                    alert("Name must be 3-15 characters");
                    console.log("Invalid name:", name);
                    return;
                }
                gameState.player.name = name;
                localData.player.name = name;
                gameState.mode = modeSelect?.value || gameState.mode;
                gameState.difficulty = difficultySelect?.value || gameState.difficulty;
                gameState.flashDur = DIFFICULTIES[gameState.difficulty].flash;
                gameState.timer = gameState.mode === "1-minute" ? 60 : gameState.mode === "2-minute" ? 120 : 0;
                gameState.lives = 4;
                localStorage.setItem("squarePulse", JSON.stringify(localData));
                console.log(`Starting game: name=${name}, mode=${gameState.mode}, difficulty=${gameState.difficulty}, lives=${gameState.lives}`);
                startGame();
                if (restartButton) restartButton.style.display = "none";
                updateLeaderboard(gameState.mode, gameState.difficulty);
            };
        } else {
            console.error("Start button not found");
            alert("Error: Start button not found.");
        }

        if (canvas) canvas.classList.add("paused");
        if (pauseButton) pauseButton.textContent = "Pause";
        if (restartButton) restartButton.style.display = "block";
        render();
        console.log(`Game reset: mode=${gameState.mode}, difficulty=${gameState.difficulty}, timer=${gameState.timer}, lives=${gameState.lives}, score=${gameState.score}, paused=${gameState.paused}`);
    } catch (e) {
        console.error("resetGame error:", e);
        alert("Error resetting game.");
    }
}

function startGame() {
    console.log("Starting game...");
    try {
        if (!modal || !canvas || !ctx) {
            console.error("Cannot start game: missing modal, canvas, or ctx");
            alert("Error: Required elements missing.");
            return;
        }
        gameState.paused = false;
        modal.style.display = "none";
        modal.classList.add("hidden");
        canvas.classList.remove("paused");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        recentAnimalTaps = [];
        updateScoreText();
        lastFrameTime = performance.now();
        if (speedUpInterval) clearInterval(speedUpInterval);
        speedUpInterval = setInterval(() => {
            if (!gameState.paused) {
                gameState.flashDur = Math.max(gameState.flashDur - 100, gameState.flashDur * 0.8);
                console.log(`Flash duration: ${gameState.flashDur}`);
            }
        }, 30000);
        initFlashes();
        console.log(`Game started: mode=${gameState.mode}, difficulty=${gameState.difficulty}, timer=${gameState.timer}, lives=${gameState.lives}`);
        canvas.focus();
        render();
    } catch (e) {
        console.error("startGame error:", e);
        alert("Error starting game.");
        gameState.paused = true;
        resetGame();
    }
}

restartButton?.addEventListener("click", () => {
    console.log("Restart button clicked");
    try {
        startGame();
        if (restartButton) restartButton.style.display = "none";
    } catch (e) {
        console.error("Restart game error:", e);
        alert("Error restarting game.");
    }
});

pauseButton?.addEventListener("click", () => {
    console.log(`Pause button clicked, current paused: ${gameState.paused}`);
    gameState.paused = !gameState.paused;
    if (pauseButton) pauseButton.textContent = gameState.paused ? "Resume" : "Pause";
    if (canvas) canvas.classList.toggle("paused", gameState.paused);
    console.log(`Game ${gameState.paused ? "paused" : "resumed"}`);
    if (!gameState.paused) initFlashes();
});

resetButton?.addEventListener("click", () => {
    console.log("Reset button clicked");
    try {
        endGame();
        resetGame();
    } catch (e) {
        console.error("Reset game error:", e);
        alert("Error resetting game.");
    }
});

function initFlashes() {
    if (gameState.paused || gameState.activeFlashes >= DIFFICULTIES[gameState.difficulty].maxFlashes) {
        console.log(`initFlashes skipped: paused=${gameState.paused}, activeFlashes=${gameState.activeFlashes}`);
        return;
    }
    let row, col;
    do {
        row = Math.floor(Math.random() * GRID_SIZE);
        col = Math.floor(Math.random() * GRID_SIZE);
    } while (gameState.grid[row][col].state !== "dormant");

    const rand = Math.random();
    let type, value = null;
    if (rand < TYPES.blank) type = "blank";
    else if (rand < TYPES.blank + TYPES.number) { type = "number"; value = Math.floor(Math.random() * 9) + 1; }
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter) { type = "letter"; value = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal) { type = "animal"; value = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]; }
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap) { type = "trap"; value = TRAPS[Math.floor(Math.random() * TRAPS.length)]; }
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap + TYPES.green) type = "green";
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap + TYPES.green + TYPES.yellowTap) type = "yellowTap";
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap + TYPES.green + TYPES.yellowTap + TYPES.red) type = "red";
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap + TYPES.green + TYPES.yellowTap + TYPES.red + TYPES.blue) type = "blue";
    else if (rand < TYPES.blank + TYPES.number + TYPES.letter + TYPES.animal + TYPES.trap + TYPES.green + TYPES.yellowTap + TYPES.red + TYPES.blue + TYPES.yellow) type = "yellow";
    else type = "white";

    gameState.grid[row][col] = { type, state: "flashing", timer: gameState.flashDur, value, startTime: Date.now() };
    gameState.activeFlashes++;
    console.log(`Flash: ${type} at (${row},${col}), value=${value}`);
    activeTimeouts.push(setTimeout(() => fadeSquare(row, col), gameState.flashDur));
}

function fadeSquare(row, col) {
    if (gameState.paused || gameState.grid[row][col].state !== "flashing") {
        console.log(`fadeSquare skipped: row=${row}, col=${col}, paused=${gameState.paused}, state=${gameState.grid[row][col].state}`);
        return;
    }
    gameState.grid[row][col].state = "fading";
    gameState.activeFlashes--;
    if (gameState.grid[row][col].type === "blank") {
        gameState.streak = 0;
        updateScoreText();
        if (canvas) canvas.classList.add("shake");
        setTimeout(() => canvas?.classList.remove("shake"), 300);
    }
    activeTimeouts.push(setTimeout(() => {
        gameState.grid[row][col] = { type: "blank", state: "dormant", timer: 0, value: null, startTime: 0 };
        if (!gameState.paused) initFlashes();
    }, 200));
}

canvas?.addEventListener("touchstart", startInput, { passive: false });
canvas?.addEventListener("mousedown", startInput);
canvas?.addEventListener("touchmove", moveInput, { passive: false });
canvas?.addEventListener("mousemove", moveInput);
canvas?.addEventListener("touchend", endInput, { passive: false });
canvas?.addEventListener("mouseup", endInput);
canvas?.addEventListener("touchcancel", (e) => {
    console.log("Touchcancel fired");
    resetDrag();
    gameState.paused = false;
    initFlashes();
});

function startInput(e) {
    if (gameState.paused) {
        console.log(`startInput skipped: paused=${gameState.paused}`);
        return;
    }
    e.preventDefault();
    const { x, y } = getCoords(e);
    const row = Math.floor((y - SQUARE_SIZE) / SQUARE_SIZE);
    const col = Math.floor((x - SQUARE_SIZE * 2) / SQUARE_SIZE);
    console.log(`startInput: x=${x.toFixed(2)}, y=${y.toFixed(2)}, row=${row}, col=${col}, touchType=${e.type}, touchCount=${e.touches?.length || 0}`);
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE && gameState.grid[row][col].state === "flashing") {
        dragStart = { row, col, x, y, type: gameState.grid[row][col].type, value: gameState.grid[row][col].value };
        dragActive = true;
        dragPath = [{ x, y }];
        if (canvas) {
            canvas.classList.remove("highlight-left", "highlight-right", "highlight-top", "highlight-bottom", "color-top", "color-bottom", "color-left", "color-right");
            if (dragStart.type === "red") canvas.classList.add("highlight-top", "color-top");
            else if (dragStart.type === "blue") canvas.classList.add("highlight-bottom", "color-bottom");
            else if (dragStart.type === "yellow") canvas.classList.add("highlight-left", "color-left");
            else if (dragStart.type === "white") canvas.classList.add("highlight-right", "color-right");
            else if (dragStart.type === "letter") canvas.classList.add("highlight-left");
            else if (dragStart.type === "number") canvas.classList.add("highlight-right");
        }
        console.log(`Input started: ${dragStart.type} (${dragStart.value}) at (${row},${col}), x:${x.toFixed(2)}, y:${y.toFixed(2)}`);
    } else {
        console.log(`Input ignored: row=${row}, col=${col}, x=${x.toFixed(2)}, y=${y.toFixed(2)}, state=${gameState.grid[row]?.[col]?.state}`);
        gameState.paused = false;
    }
}

function moveInput(e) {
    if (!dragActive) {
        console.log(`moveInput skipped: dragActive=${dragActive}`);
        return;
    }
    e.preventDefault();
    const { x, y } = getCoords(e);
    dragPath.push({ x, y });
    console.log(`Drag moved: x=${x.toFixed(2)}, y=${y.toFixed(2)}, touchType=${e.type}, touchCount=${e.touches?.length || 0}`);
}

function endInput(e) {
    if (!dragActive || !dragStart) {
        console.log(`endInput skipped: dragActive=${dragActive}, dragStart=${!!dragStart}`);
        resetDrag();
        gameState.paused = false;
        initFlashes();
        return;
    }
    e.preventDefault();
    const { x, y } = getCoords(e);
    const sq = gameState.grid[dragStart.row][dragStart.col];
    console.log(`endInput: x=${x.toFixed(2)}, y=${y.toFixed(2)}, touchType=${e.type}, touchCount=${e.touches?.length || 0}, canvasWidth=${canvas.width}, SQUARE_SIZE=${SQUARE_SIZE}`);
    if (sq.state !== "flashing") {
        console.log(`Square no longer flashing: state=${sq.state}, type=${sq.type}, value=${sq.value}`);
        resetDrag();
        gameState.paused = false;
        initFlashes();
        return;
    }

    let points = 0;
    let livesLost = 0;
    const isTap = Math.abs(x - dragStart.x) < 10 && Math.abs(y - dragStart.y) < 10;
    const dropZone = sq.type === "letter" ? (x < SQUARE_SIZE * 2.5 ? "letters" : "none") :
                     sq.type === "number" ? (x > canvas.width / (window.devicePixelRatio || 1) - SQUARE_SIZE * 2.5 ? "numbers" : "none") : "none";
    console.log(`End input: isTap=${isTap}, x=${x.toFixed(2)}, y=${y.toFixed(2)}, dx=${(x - dragStart.x).toFixed(2)}, dy=${(y - dragStart.y).toFixed(2)}, dropZone=${dropZone}, type=${sq.type}, value=${sq.value}, rightZoneThreshold=${(canvas.width / (window.devicePixelRatio || 1) - SQUARE_SIZE * 2.5).toFixed(2)}`);

    if (isTap) {
        if (["green", "yellowTap", "animal", "blank", "trap"].includes(sq.type)) {
            if (sq.type === "green" || sq.type === "yellowTap") {
                points = 10;
                gameState.greenTaps++;
                playSound("pop");
            } else if (sq.type === "animal") {
                points = 51;
                handleAnimal(sq.value);
                recentAnimalTaps.push(Date.now());
                recentAnimalTaps = recentAnimalTaps.filter(t => Date.now() - t < 2000);
                if (recentAnimalTaps.length >= 3) {
                    points += 50;
                    console.log(`Animal combo bonus: 3 animals tapped, +50 points`);
                    recentAnimalTaps = [];
                }
                playSound("jingle");
            } else if (sq.type === "blank") {
                const timeSinceStart = Date.now() - sq.startTime;
                points = Math.max(1, Math.floor(10 - timeSinceStart / 100)) * 10;
                playSound("pop");
                console.log(`Blank tapped: time=${timeSinceStart}ms, basePoints=${Math.floor(10 - timeSinceStart / 100)}, totalPoints=${points}`);
            } else if (sq.type === "trap") {
                if (sq.value === "snake") {
                    points = 0;
                    livesLost = 1;
                    playSound("hiss");
                } else if (sq.value === "black") {
                    points = -20;
                    livesLost = 1;
                    gameState.streak = 0;
                    playSound("hiss");
                } else if (sq.value === "number0") {
                    points = -15;
                    livesLost = 1;
                    gameState.streak = 0;
                    playSound("hiss");
                }
                if (canvas) canvas.classList.add("shake");
                setTimeout(() => canvas?.classList.remove("shake"), 300);
            }
            fadeClickedSquare(dragStart.row, dragStart.col);
        } else {
            points = -10;
            livesLost = 1;
            gameState.streak = 0;
            if (canvas) canvas.classList.add("shake");
            setTimeout(() => canvas?.classList.remove("shake"), 300);
            playSound("hiss");
            alert(`Cannot tap ${sq.type} squares! Drag letters left or numbers right.`);
        }
    } else if (sq.type === "letter" || sq.type === "number") {
        if (dropZone !== "none" && sq.value !== "number0") {
            const slots = gameState.slots[dropZone];
            const idx = slots.indexOf(null);
            if (idx !== -1) {
                slots[idx] = sq.value;
                points = sq.type === "letter" ? (sq.value.charCodeAt(0) - 64) : parseInt(sq.value);
                fadeClickedSquare(dragStart.row, dragStart.col);
                playSound("pop");
                console.log(`Dropped ${sq.type} (${sq.value}) in ${dropZone} slot ${idx}, points=${points}, slots=${slots}`);
                const filledCount = slots.filter(s => s !== null).length;
                if (filledCount === 6) {
                    console.log(`${dropZone} has 6 slots filled, auto-submitting with explosion`);
                    triggerExplosion(dropZone);
                    submitSlots(dropZone, true);
                }
            } else {
                points = -10;
                livesLost = 1;
                gameState.streak = 0;
                if (canvas) canvas.classList.add("shake");
                setTimeout(() => canvas?.classList.remove("shake"), 300);
                playSound("hiss");
                alert(`Cannot add more to ${dropZone} slots! Maximum 6 slots.`);
                console.log(`Failed drop: ${dropZone} slots full, slots=${slots}`);
            }
        } else {
            points = -10;
            livesLost = 1;
            gameState.streak = 0;
            if (canvas) canvas.classList.add("shake");
            setTimeout(() => canvas?.classList.remove("shake"), 300);
            playSound("hiss");
            alert(`Invalid drop zone for ${sq.type}! Drag letters left, numbers right.`);
            console.log(`Failed drop: wrong zone for ${sq.type}, x=${x.toFixed(2)}, dropZone=${dropZone}, rightZoneThreshold=${(canvas.width / (window.devicePixelRatio || 1) - SQUARE_SIZE * 2.5).toFixed(2)}`);
        }
    } else if (["red", "blue", "yellow", "white"].includes(sq.type)) {
        const dx = x - dragStart.x, dy = y - dragStart.y;
        const validDrag = (sq.type === "red" && dy < -10 && Math.abs(dx) < 10) ||
                          (sq.type === "blue" && dy > 10 && Math.abs(dx) < 10) ||
                          (sq.type === "yellow" && dx < -10 && Math.abs(dy) < 10) ||
                          (sq.type === "white" && dx > 10 && Math.abs(dy) < 10);
        if (validDrag) {
            points = 5;
            gameState.coloredDrags[sq.type]++;
            fadeClickedSquare(dragStart.row, dragStart.col);
            playSound("pop");
            console.log(`Valid drag: ${sq.type}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, points=${points}, coloredDrags=${JSON.stringify(gameState.coloredDrags)}`);
        } else {
            points = -5;
            livesLost = 1;
            gameState.streak = 0;
            if (canvas) canvas.classList.add("shake");
            setTimeout(() => canvas?.classList.remove("shake"), 300);
            playSound("hiss");
            alert(`Invalid drag direction for ${sq.type} square!`);
            console.log(`Invalid drag: ${sq.type}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
        }
    }

    gameState.score += points * (gameState.streak >= 10 ? 2 : 1);
    gameState.lives -= livesLost;
    if (points > 0) gameState.streak++;
    else if (points < 0 || livesLost > 0) gameState.streak = 0;
    console.log(`Score updated: points=${points}, livesLost=${livesLost}, score=${gameState.score}, lives=${gameState.lives}, streak=${gameState.streak}, letters=${gameState.slots.letters}, numbers=${gameState.slots.numbers}, paused=${gameState.paused}`);
    updateScoreText();

    if (gameState.lives <= 0 || (gameState.mode !== "Endless" && gameState.timer <= 0)) endGame();
    resetDrag();
    gameState.paused = false;
    initFlashes();
}

function resetDrag() {
    dragActive = false;
    dragStart = null;
    dragPath = [];
    if (canvas) canvas.classList.remove("highlight-left", "highlight-right", "highlight-top", "highlight-bottom", "color-top", "color-bottom", "color-left", "color-right");
    gameState.paused = false;
    console.log(`Drag reset: dragActive=${dragActive}, paused=${gameState.paused}`);
}

function fadeClickedSquare(row, col) {
    gameState.grid[row][col].state = "fading";
    gameState.activeFlashes--;
    setTimeout(() => {
        gameState.grid[row][col] = { type: "blank", state: "dormant", timer: 0, value: null, startTime: 0 };
        if (!gameState.paused) initFlashes();
    }, 300);
}

function handleAnimal(value) {
    gameState.activeAnimals.push(value);
    if (value === "🐱" || value === "🐼") {
        gameState.lives++;
        console.log(`Extra life from ${value}: lives=${gameState.lives}`);
    } else if (value === "🐶") {
        gameState.flashDur = Math.min(gameState.flashDur * 1.5, 3000);
        console.log(`Dog slowed flashes: flashDur=${gameState.flashDur}`);
    } else if (value === "🐦") {
        gameState.multiplier = 2;
        console.log(`Bird doubled multiplier: multiplier=${gameState.multiplier}`);
    } else if (value === "🐢") {
        console.log(`Turtle shield activated`);
    } else if (value === "🦁") {
        gameState.slots.letters.fill(null);
        console.log(`Lion cleared letters: slots=${gameState.slots.letters}`);
    } else if (value === "🐘") {
        gameState.slots.numbers.fill(null);
        console.log(`Elephant cleared numbers: slots=${gameState.slots.numbers}`);
    }
    playSound("jingle");
}

function triggerExplosion(zone) {
    const x = zone === "letters" ? SQUARE_SIZE / 2 : canvas.width / (window.devicePixelRatio || 1) - SQUARE_SIZE * 1.5;
    const y = canvas.height / (window.devicePixelRatio || 1) - SQUARE_SIZE * 4;
    for (let i = 0; i < 20; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 500,
            color: zone === "letters" ? "#8fbf8f" : "#bf8f8f"
        });
    }
    if (canvas) canvas.classList.add("explode");
    setTimeout(() => canvas?.classList.remove("explode"), 500);
    playSound("jingle");
    console.log(`Explosion triggered for ${zone}`);
    render();
}

function submitSlots(zone, auto = false) {
    const slots = gameState.slots[zone];
    let points = 0;
    const filledCount = slots.filter(s => s !== null).length;
    if (filledCount >= 3) {
        points = slots.reduce((sum, v) => {
            if (!v) return sum;
            return sum + (zone === "letters" ? (v.charCodeAt(0) - 64) : parseInt(v));
        }, 0);
        if (auto) points *= 1.5;
        points *= (gameState.streak >= 10 ? 2 : 1);
        slots.fill(null);
        playSound("jingle");
        console.log(`Submitted ${zone}${auto ? " (auto)" : ""}, points=${points}, slots=${slots}`);
    } else {
        points = -5;
        gameState.lives -= 1;
        if (canvas) canvas.classList.add("shake");
        setTimeout(() => canvas?.classList.remove("shake"), 300);
        playSound("hiss");
        console.log(`Invalid ${zone} submission${auto ? " (auto)" : ""}, slots=${slots}`);
    }
    gameState.score += points;
    gameState.streak = points > 0 ? gameState.streak + 1 : 0;
    console.log(`Slot submission: zone=${zone}, points=${points}, score=${gameState.score}, streak=${gameState.streak}, slots=${slots}`);
    updateScoreText();
    if (gameState.lives <= 0) endGame();
}

function getCoords(e) {
    if (!canvas) {
        console.error("getCoords: canvas is null");
        return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if (e.touches && e.touches.length) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
    } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    }
    const dpr = window.devicePixelRatio || 1;
    x = (x * (canvas.width / rect.width)) / dpr;
    y = (y * (canvas.height / rect.height)) / dpr;
    x = Math.min(Math.max(x, 0), canvas.width / dpr);
    y = Math.min(Math.max(y, 0), canvas.height / dpr);
    console.log(`getCoords: clientX=${e.clientX || e.touches[0]?.clientX}, clientY=${e.clientY || e.touches[0]?.clientY}, rectLeft=${rect.left}, rectTop=${rect.top}, rectWidth=${rect.width}, rectHeight=${rect.height}, scaledX=${x.toFixed(2)}, scaledY=${y.toFixed(2)}, dpr=${dpr}`);
    return { x, y };
}

function updateScoreText() {
    if (!scoreZone) {
        console.error("updateScoreText: scoreZone is null");
        return;
    }
    const timeText = gameState.mode !== "Endless" ? ` | Time: ${Math.max(0, Math.ceil(gameState.timer))}s` : "";
    scoreZone.textContent = `Score: ${gameState.score} | Lives: ${gameState.lives} | Streak: ${gameState.streak}${timeText}`;
    console.log(`Score display updated: ${scoreZone.textContent}, timer=${gameState.timer.toFixed(1)}`);
}

function drawSlot(x, y, value, type) {
    if (!ctx) {
        console.error("drawSlot: ctx is null");
        return;
    }
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    ctx.fillStyle = type === "letters" ? "#8fbf8f" : "#bf8f8f";
    ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    if (value) {
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.round(SQUARE_SIZE * 0.6)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    }
}

function playSound(type) {
    console.log(`Playing sound: ${type}`);
}

function render() {
    if (!ctx || !canvas) {
        console.error("Cannot render: ctx or canvas is null");
        ctx?.fillStyle && (ctx.fillStyle = "#ff0000");
        ctx?.fillRect && ctx.fillRect(0, 0, canvas?.width || 500, canvas?.height || 500);
        ctx?.fillStyle && (ctx.fillStyle = "#fff");
        ctx?.fillText && ctx.fillText("Render Error - Check Console", canvas?.width / 2 || 250, canvas?.height / 2 || 250);
        return;
    }
    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const dpr = window.devicePixelRatio || 1;
        console.log(`Rendering canvas: letters=${JSON.stringify(gameState.slots.letters)}, numbers=${JSON.stringify(gameState.slots.numbers)}, paused=${gameState.paused}, timer=${gameState.timer.toFixed(1)}, canvasWidth=${canvas.width/dpr}, canvasHeight=${canvas.height/dpr}`);

        if (gameState.paused && modal?.style.display === "block") {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#000";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("SquarePulse - Press Start", canvas.width / 2, canvas.height / 2);
            console.log("Rendered paused state with modal");
            return;
        }

        ctx.fillStyle = "rgba(255, 255, 0, 0.7)";
        ctx.fillRect(0, 0, SQUARE_SIZE * 2, canvas.height);
        ctx.strokeStyle = "#FFFF00";
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, SQUARE_SIZE * 2, canvas.height);
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillRect(canvas.width / dpr - SQUARE_SIZE * 2, 0, SQUARE_SIZE * 2, canvas.height);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 4;
        ctx.strokeRect(canvas.width / dpr - SQUARE_SIZE * 2, 0, SQUARE_SIZE * 2, canvas.height);
        ctx.fillStyle = "#000";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Letters", SQUARE_SIZE / 2, 20);
        ctx.textAlign = "right";
        ctx.fillText("Numbers", canvas.width / dpr - SQUARE_SIZE / 2, 20);
        ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
        ctx.fillRect(SQUARE_SIZE * 2, 0, canvas.width / dpr - SQUARE_SIZE * 4, SQUARE_SIZE);

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const sq = gameState.grid[r][c];
                const x = (c + 2) * SQUARE_SIZE;
                const y = r * SQUARE_SIZE + SQUARE_SIZE;
                drawSquare(x, y, sq);
            }
        }

        for (let i = 0; i < 8; i++) {
            const ly = canvas.height / dpr - SQUARE_SIZE * (8 - i);
            const ny = canvas.height / dpr - SQUARE_SIZE * (8 - i);
            drawSlot(SQUARE_SIZE / 2, ly, gameState.slots.letters[i], "letters");
            drawSlot(canvas.width / dpr - SQUARE_SIZE * 1.5, ny, gameState.slots.numbers[i], "numbers");
        }

        if (dragActive && ["letter", "number"].includes(dragStart?.type)) {
            ctx.fillStyle = dragStart.type === "letter" ? "rgba(255, 255, 0, 0.9)" : "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(dragStart.type === "letter" ? 0 : canvas.width / dpr - SQUARE_SIZE * 2, 0, SQUARE_SIZE * 2, canvas.height);
        }

        if (dragActive && dragPath.length > 1) {
            ctx.beginPath();
            ctx.moveTo(dragPath[0].x, dragPath[0].y);
            for (let i = 1; i < dragPath.length; i++) ctx.lineTo(dragPath[i].x, dragPath[i].y);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 16.67;
        });
    } catch (e) {
        console.error("Render error:", e);
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Render Error - Check Console", canvas.width / 2, canvas.height / 2);
    }
}

function drawSquare(x, y, sq) {
    if (!ctx) {
        console.error("drawSquare: ctx is null");
        return;
    }
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    if (sq.state === "flashing") {
        ctx.fillStyle = getColor(sq.type);
        ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    } else if (sq.state === "fading") {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    }
    ctx.fillStyle = "#000";
    ctx.font = `${Math.round(SQUARE_SIZE * 0.6)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sq.value !== null) {
        ctx.fillStyle = "#fff";
        if (sq.value === "snake") ctx.fillText("🐍", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
        else if (sq.value === "number0") ctx.fillText("Ø", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
        else if (sq.value !== "black") ctx.fillText(sq.value, x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    } else if (sq.type === "red") ctx.fillText("↑", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    else if (sq.type === "blue") ctx.fillText("↓", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    else if (sq.type === "yellow") ctx.fillText("←", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    else if (sq.type === "white") ctx.fillText("→", x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
}

function getColor(type) {
    switch (type) {
        case "red": return "#ff4c4c";
        case "blue": return "#4c6fff";
        case "yellow": return "#f7f748";
        case "white": return "#f7f7f7";
        case "green": return "#3ee23e";
        case "yellowTap": return "#FFFF00";
        case "animal": return "#6b8cff";
        case "letter": return "#8fbf8f";
        case "number": return "#bf8f8f";
        case "trap": return "#222";
        case "blank": default: return "#ddd";
    }
}

function endGame() {
    console.log(`Ending game: score=${gameState.score}, lives=${gameState.lives}, timer=${gameState.timer.toFixed(1)}, mode=${gameState.mode}, difficulty=${gameState.difficulty}`);
    gameState.paused = true;
    activeTimeouts.forEach(clearTimeout);
    activeTimeouts = [];
    if (speedUpInterval) clearInterval(speedUpInterval);
    speedUpInterval = null;

    const scoreEntry = {
        name: gameState.player.name,
        score: gameState.score,
        mode: gameState.mode,
        difficulty: gameState.difficulty,
        timestamp: new Date().toISOString()
    };
    localData.scores.push(scoreEntry);
    localData.scores.sort((a, b) => b.score - a.score);
    localData.scores = localData.scores.slice(0, 50);
    console.log(`Score saved: scoreEntry=${JSON.stringify(scoreEntry)}, scores=${JSON.stringify(localData.scores)}`);

    try {
        localStorage.setItem("squarePulse", JSON.stringify(localData));
        console.log(`Saved to localStorage: entry=${JSON.stringify(scoreEntry)}`);
    } catch (e) {
        console.error("Failed to save to localStorage:", e);
        alert("Error: Failed to save score.");
    }

    const prevBest = localData.scores
        .filter(e => e.name === gameState.player.name && e.mode === gameState.mode && e.difficulty === gameState.difficulty)
        .reduce((max, e) => Math.max(max, e.score), 0);
    const isHighScore = gameState.score > prevBest;

    if (modal) {
        modal.style.display = "block";
        modal.classList.remove("hidden");
        const localScores = localData.scores
            .filter(entry => entry.mode === gameState.mode && entry.difficulty === gameState.difficulty)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        console.log(`End-game modal leaderboard: mode=${gameState.mode}, difficulty=${gameState.difficulty}, scores=${JSON.stringify(localScores)}`);
        modal.innerHTML = `
            <h2>Game Over!</h2>
            <p>Score: ${gameState.score} (${gameState.difficulty} ${gameState.mode})${isHighScore ? "<br><span class='high-score'>New High Score!</span>" : ""}</p>
            <p>Lives: ${gameState.lives}</p>
            <p><label for="mode">Mode:</label></p>
            <select id="mode">
                <option value="Endless" ${gameState.mode === "Endless" ? "selected" : ""}>Endless</option>
                <option value="1-minute" ${gameState.mode === "1-minute" ? "selected" : ""}>1-Minute</option>
                <option value="2-minute" ${gameState.mode === "2-minute" ? "selected" : ""}>2-Minute</option>
            </select>
            <p><label for="difficulty">Difficulty:</label></p>
            <select id="difficulty">
                <option value="Easy" ${gameState.difficulty === "Easy" ? "selected" : ""}>Easy</option>
                <option value="Medium" ${gameState.difficulty === "Medium" ? "selected" : ""}>Medium</option>
                <option value="Hard" ${gameState.difficulty === "Hard" ? "selected" : ""}>Hard</option>
            </select>
            <h3>Leaderboard (${gameState.difficulty} ${gameState.mode})</h3>
            <table class="leaderboard-table fade-in">
                <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                ${localScores.length > 0
                    ? localScores.map((entry, i) => `
                        <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                            <td>${i + 1}</td>
                            <td>${entry.name}</td>
                            <td>${entry.score}</td>
                        </tr>
                    `).join("")
                    : "<tr><td colspan='3'>No scores yet</td></tr>"}
            </table>
            <button id="play-again-button">Play Again</button>
        `;
        const modeSelect = document.getElementById("mode");
        const difficultySelect = document.getElementById("difficulty");
        const updateModalLeaderboard = () => {
            const newMode = modeSelect?.value || gameState.mode;
            const newDifficulty = difficultySelect?.value || gameState.difficulty;
            const scores = localData.scores
                .filter(entry => entry.mode === newMode && entry.difficulty === newDifficulty)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            const leaderboardDiv = modal.querySelector("table");
            if (leaderboardDiv) {
                leaderboardDiv.innerHTML = `
                    <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                    ${scores.length > 0
                        ? scores.map((entry, i) => `
                            <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                                <td>${i + 1}</td>
                                <td>${entry.name}</td>
                                <td>${entry.score}</td>
                            </tr>
                        `).join("")
                        : "<tr><td colspan='3'>No scores yet</td></tr>"}
                `;
                modal.querySelector("h3").textContent = `Leaderboard (${newDifficulty} ${newMode})`;
                console.log(`Modal leaderboard updated: mode=${newMode}, difficulty=${newDifficulty}, scores=${JSON.stringify(scores)}`);
            }
            updateLeaderboard(newMode, newDifficulty);
        };
        modeSelect?.addEventListener("change", updateModalLeaderboard);
        difficultySelect?.addEventListener("change", updateModalLeaderboard);

        const playAgainButton = document.getElementById("play-again-button");
        if (playAgainButton) {
            playAgainButton.onclick = () => {
                console.log("Play again clicked");
                resetGame();
            };
        } else {
            console.error("Play again button not found");
            alert("Error: Play again button not found.");
        }
    } else {
        console.error("Cannot show end-game modal: modal element is missing");
        alert("Error: Modal element not found.");
    }

    if (restartButton) restartButton.style.display = "block";
    if (canvas) canvas.classList.add("paused");
    if (pauseButton) pauseButton.textContent = "Pause";
    updateLeaderboard(gameState.mode, gameState.difficulty);
}

function updateLeaderboard(mode, difficulty) {
    if (!leaderboardContainer) {
        console.error("Cannot update leaderboard: leaderboardContainer element is missing");
        alert("Error: Leaderboard container not found.");
        return;
    }
    try {
        const localScores = localData.scores
            .filter(entry => entry.mode === mode && entry.difficulty === difficulty)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        leaderboardContainer.innerHTML = `
            <div>
                <label for="leaderboard-mode">Mode:</label>
                <select id="leaderboard-mode">
                    <option value="Endless" ${mode === "Endless" ? "selected" : ""}>Endless</option>
                    <option value="1-minute" ${mode === "1-minute" ? "selected" : ""}>1-Minute</option>
                    <option value="2-minute" ${mode === "2-minute" ? "selected" : ""}>2-Minute</option>
                </select>
                <label for="leaderboard-difficulty">Difficulty:</label>
                <select id="leaderboard-difficulty">
                    <option value="Easy" ${difficulty === "Easy" ? "selected" : ""}>Easy</option>
                    <option value="Medium" ${difficulty === "Medium" ? "selected" : ""}>Medium</option>
                    <option value="Hard" ${difficulty === "Hard" ? "selected" : ""}>Hard</option>
                </select>
            </div>
            <h3>Leaderboard (${difficulty} ${mode})</h3>
            <table class="leaderboard-table fade-in">
                <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                ${localScores.length > 0
                    ? localScores.map((entry, i) => `
                        <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                            <td>${i + 1}</td>
                            <td>${entry.name}</td>
                            <td>${entry.score}</td>
                        </tr>
                    `).join("")
                    : "<tr><td colspan='3'>No scores yet</td></tr>"}
            </table>
        `;
        console.log(`Leaderboard updated: mode=${mode}, difficulty=${difficulty}, scores=${JSON.stringify(localScores)}`);

        const modeSelect = document.getElementById("leaderboard-mode");
        const difficultySelect = document.getElementById("leaderboard-difficulty");
        const updateMainLeaderboard = () => {
            const newMode = modeSelect?.value || mode;
            const newDifficulty = difficultySelect?.value || difficulty;
            const scores = localData.scores
                .filter(entry => entry.mode === newMode && entry.difficulty === newDifficulty)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            const table = leaderboardContainer.querySelector("table");
            if (table) {
                table.innerHTML = `
                    <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
                    ${scores.length > 0
                        ? scores.map((entry, i) => `
                            <tr class="${entry.name === gameState.player.name ? "player-highlight" : ""}">
                                <td>${i + 1}</td>
                                <td>${entry.name}</td>
                                <td>${entry.score}</td>
                            </tr>
                        `).join("")
                        : "<tr><td colspan='3'>No scores yet</td></tr>"}
                `;
                leaderboardContainer.querySelector("h3").textContent = `Leaderboard (${newDifficulty} ${newMode})`;
                console.log(`Main leaderboard updated: mode=${newMode}, difficulty=${newDifficulty}, scores=${JSON.stringify(scores)}`);
            }
        };
        modeSelect?.addEventListener("change", updateMainLeaderboard);
        difficultySelect?.addEventListener("change", updateMainLeaderboard);
    } catch (e) {
        console.error("updateLeaderboard error:", e);
        leaderboardContainer.innerHTML = "<p>Error loading leaderboard.</p>";
    }
}

function gameLoop(timestamp) {
    const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;
    if (gameState.mode !== "Endless" && gameState.timer > 0) {
        gameState.timer = Math.max(0, gameState.timer - deltaTime);
        console.log(`gameLoop: deltaTime=${deltaTime.toFixed(3)}, timer=${gameState.timer.toFixed(1)}, mode=${gameState.mode}, paused=${gameState.paused}`);
        if (gameState.timer <= 0) {
            console.log(`Timer reached 0, ending game`);
            endGame();
            return;
        }
    }
    render();
    requestAnimationFrame(gameLoop);
}

// Initialize game
if (!ctx) {
    console.error("Canvas context initialization failed");
    alert("Error: Canvas context not found. Check browser compatibility.");
} else {
    resetGame();
    updateLeaderboard(gameState.mode, gameState.difficulty);
    requestAnimationFrame(gameLoop);
}