(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const highScoreEl = document.getElementById("highScore");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startButton = document.getElementById("startButton");
  const pauseButton = document.getElementById("pauseButton");
  const restartButton = document.getElementById("restartButton");

  const CELL = 20;
  const COLS = Math.floor(canvas.width / CELL);
  const ROWS = Math.floor(canvas.height / CELL);

  const COLORS = {
    bg: "#020604",
    grid: "rgba(255,255,255,0.035)",
    playerHead: "#38f58c",
    playerBody: "#13a45b",
    food: "#ffd447",
    small: "#4aa3ff",
    big: "#ff4a4a",
    poison: "#c85cff",
    eye: "#06120b"
  };

  let player;
  let direction;
  let nextDirection;
  let pendingGrowth;
  let food;
  let enemies;
  let score;
  let level;
  let highScore;
  let state;
  let lastTime;
  let accumulator;
  let tickMs;

  function resetGame() {
    player = [
      { x: 8, y: 16 },
      { x: 7, y: 16 },
      { x: 6, y: 16 },
      { x: 5, y: 16 }
    ];

    direction = "RIGHT";
    nextDirection = "RIGHT";
    pendingGrowth = 0;
    enemies = [];
    score = 0;
    level = 1;
    tickMs = 150;
    state = "ready";
    lastTime = 0;
    accumulator = 0;

    highScore = Number(localStorage.getItem("snakeArenaHighScore") || 0);
    food = getFreePosition(6);

    updateHud();
    showOverlay("Snake Survival Arena", "Press Start, Space, or Enter to play.", "Start Game");
    draw();
  }

  function startGame() {
    if (state === "gameover") {
      resetGame();
    }

    state = "playing";
    hideOverlay();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function pauseGame() {
    if (state === "playing") {
      state = "paused";
      showOverlay("Paused", "Press Space, P, or Resume to continue.", "Resume");
    } else if (state === "paused" || state === "ready") {
      startGame();
    }
  }

  function gameLoop(time) {
    if (state !== "playing") return;

    const delta = Math.min(time - lastTime, 120);
    lastTime = time;
    accumulator += delta;

    while (accumulator >= tickMs) {
      update();
      accumulator -= tickMs;
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  function update() {
    direction = nextDirection;

    const oldHead = player[0];
    const newHead = wrap(movePoint(oldHead, direction));

    player.unshift(newHead);

    if (pendingGrowth > 0) {
      pendingGrowth--;
    } else {
      player.pop();
    }

    if (hitsOwnBody(newHead)) {
      return endGame("You crashed into yourself.");
    }

    if (same(newHead, food)) {
      score += 1;
      pendingGrowth += 1;
      food = getFreePosition(5);
      updateDifficulty();
      updateHud();
    }

    // Check collision after player moves, before enemies move.
    if (checkEnemyCollision()) return;

    maybeSpawnEnemy();
    moveEnemies();

    // Check again after enemies move, so an enemy cannot move through the player.
    checkEnemyCollision();
  }

  function moveEnemies() {
    for (const enemy of enemies) {
      if (Math.random() < enemy.turnChance) {
        enemy.dir = chooseEnemyDirection(enemy);
      }

      const newHead = wrap(movePoint(enemy.body[0], enemy.dir));
      enemy.body.unshift(newHead);
      enemy.body.pop();
    }

    // Remove enemy snakes that overlap each other too much. This prevents messy stacks.
    enemies = enemies.filter((enemy, index) => {
      return !enemies.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        return same(enemy.body[0], other.body[0]);
      });
    });
  }

  function checkEnemyCollision() {
    const head = player[0];

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const hitIndex = enemy.body.findIndex(part => same(part, head));

      if (hitIndex === -1) continue;

      if (enemy.type === "small" && player.length > enemy.body.length) {
        score += 3 + enemy.body.length;
        pendingGrowth += Math.min(5, enemy.body.length);
        enemies.splice(i, 1);
        updateDifficulty();
        updateHud();
        return false;
      }

      if (enemy.type === "small") {
        endGame("That snake was not small enough to eat.");
      } else if (enemy.type === "big") {
        endGame("You hit a bigger snake.");
      } else {
        endGame("You touched a poison snake.");
      }

      return true;
    }

    return false;
  }

  function maybeSpawnEnemy() {
    const maxEnemies = Math.min(2 + level, 9);
    if (enemies.length >= maxEnemies) return;

    const chance = 0.035 + level * 0.006;
    if (Math.random() > chance) return;

    const type = chooseEnemyType();
    const length = enemyLength(type);
    const dir = randomDirection();
    const start = getFreePosition(8);
    const body = buildEnemyBody(start, dir, length);

    if (!body || body.some(p => isOccupied(p, 5))) return;

    enemies.push({
      type,
      dir,
      body,
      turnChance: type === "small" ? 0.28 : 0.18
    });
  }

  function chooseEnemyType() {
    const r = Math.random();

    if (level === 1) {
      return r < 0.85 ? "small" : "big";
    }

    if (level <= 3) {
      if (r < 0.6) return "small";
      if (r < 0.88) return "big";
      return "poison";
    }

    if (r < 0.45) return "small";
    if (r < 0.72) return "big";
    return "poison";
  }

  function enemyLength(type) {
    if (type === "small") return Math.max(2, Math.min(player.length - 1, 2 + Math.floor(Math.random() * 3)));
    if (type === "big") return player.length + 2 + Math.floor(Math.random() * Math.max(2, level));
    return 3 + Math.floor(Math.random() * 3);
  }

  function buildEnemyBody(head, dir, length) {
    const opposite = oppositeDirection(dir);
    const body = [head];

    for (let i = 1; i < length; i++) {
      body.push(wrap(movePoint(body[i - 1], opposite)));
    }

    return body;
  }

  function updateDifficulty() {
    const newLevel = Math.min(10, 1 + Math.floor(score / 10));

    if (newLevel !== level) {
      level = newLevel;
      tickMs = Math.max(62, 155 - (level - 1) * 11);
    }
  }

  function setDirection(dir) {
    if (state === "ready") startGame();

    if (dir === oppositeDirection(direction)) return;
    if (dir === oppositeDirection(nextDirection)) return;

    nextDirection = dir;
  }

  function chooseEnemyDirection(enemy) {
    const dirs = ["UP", "DOWN", "LEFT", "RIGHT"].filter(d => d !== oppositeDirection(enemy.dir));
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  function movePoint(point, dir) {
    if (dir === "UP") return { x: point.x, y: point.y - 1 };
    if (dir === "DOWN") return { x: point.x, y: point.y + 1 };
    if (dir === "LEFT") return { x: point.x - 1, y: point.y };
    return { x: point.x + 1, y: point.y };
  }

  function wrap(point) {
    return {
      x: (point.x + COLS) % COLS,
      y: (point.y + ROWS) % ROWS
    };
  }

  function getFreePosition(buffer = 0) {
    for (let tries = 0; tries < 500; tries++) {
      const point = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };

      if (!isOccupied(point, buffer)) return point;
    }

    return { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  }

  function isOccupied(point, buffer = 0) {
    const allParts = [
      ...player,
      ...enemies.flatMap(enemy => enemy.body),
      food
    ].filter(Boolean);

    return allParts.some(part => distanceWrapped(point, part) <= buffer);
  }

  function distanceWrapped(a, b) {
    const dx = Math.min(Math.abs(a.x - b.x), COLS - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), ROWS - Math.abs(a.y - b.y));
    return Math.max(dx, dy);
  }

  function hitsOwnBody(head) {
    return player.slice(1).some(part => same(part, head));
  }

  function same(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function randomDirection() {
    const dirs = ["UP", "DOWN", "LEFT", "RIGHT"];
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  function oppositeDirection(dir) {
    return {
      UP: "DOWN",
      DOWN: "UP",
      LEFT: "RIGHT",
      RIGHT: "LEFT"
    }[dir];
  }

  function draw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawFood();
    drawEnemies();
    drawPlayer();
  }

  function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += CELL) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawFood() {
    const px = food.x * CELL + CELL / 2;
    const py = food.y * CELL + CELL / 2;

    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    player.forEach((part, index) => {
      const color = index === 0 ? COLORS.playerHead : COLORS.playerBody;
      drawCell(part, color, index === 0 ? 7 : 5);

      if (index === 0) drawEyes(part, direction);
    });
  }

  function drawEnemies() {
    for (const enemy of enemies) {
      const color = enemy.type === "small" ? COLORS.small : enemy.type === "big" ? COLORS.big : COLORS.poison;

      enemy.body.forEach((part, index) => {
        drawCell(part, color, index === 0 ? 7 : 5);
        if (index === 0) drawEyes(part, enemy.dir);
      });
    }
  }

  function drawCell(part, color, radius) {
    const x = part.x * CELL + 2;
    const y = part.y * CELL + 2;
    const size = CELL - 4;

    ctx.fillStyle = color;
    roundRect(x, y, size, size, radius);
    ctx.fill();
  }

  function drawEyes(part, dir) {
    const x = part.x * CELL;
    const y = part.y * CELL;

    const positions = {
      RIGHT: [[13, 6], [13, 14]],
      LEFT: [[7, 6], [7, 14]],
      UP: [[6, 7], [14, 7]],
      DOWN: [[6, 13], [14, 13]]
    }[dir];

    ctx.fillStyle = COLORS.eye;
    for (const [ex, ey] of positions) {
      ctx.beginPath();
      ctx.arc(x + ex, y + ey, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function updateHud() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("snakeArenaHighScore", String(highScore));
    }

    scoreEl.textContent = score;
    levelEl.textContent = level;
    highScoreEl.textContent = highScore;
  }

  function showOverlay(title, text, buttonText) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function endGame(reason) {
    state = "gameover";
    updateHud();
    showOverlay("Game Over", `${reason} Final score: ${score}. Level reached: ${level}.`, "Play Again");
  }

  document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }

    if (key === "arrowup" || key === "w") setDirection("UP");
    if (key === "arrowdown" || key === "s") setDirection("DOWN");
    if (key === "arrowleft" || key === "a") setDirection("LEFT");
    if (key === "arrowright" || key === "d") setDirection("RIGHT");

    if (key === " " || key === "p") pauseGame();
    if (key === "enter" && state !== "playing") startGame();
  });

  document.querySelectorAll("[data-dir]").forEach(button => {
    button.addEventListener("click", () => setDirection(button.dataset.dir));
  });

  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", pauseGame);
  restartButton.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  resetGame();
})();
