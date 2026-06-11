(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const lengthEl = document.getElementById("length");
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
    bg1: "#020604",
    bg2: "#07150f",
    grid: "rgba(255,255,255,0.035)",
    playerHead: "#9cff55",
    playerBody1: "#73d532",
    playerBody2: "#245f1a",
    food: "#ffd84a",
    smallHead: "#63c0ff",
    smallBody1: "#2d8bd6",
    smallBody2: "#0b345c",
    bigHead: "#ff704d",
    bigBody1: "#b92820",
    bigBody2: "#3b0907",
    poisonHead: "#d875ff",
    poisonBody1: "#8330ce",
    poisonBody2: "#240333",
    eye: "#071008",
    tongue: "#ff426e"
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
  let pulse;

  function resetGame() {
    player = [
      { x: 8, y: 13 },
      { x: 7, y: 13 },
      { x: 6, y: 13 },
      { x: 5, y: 13 }
    ];

    direction = "RIGHT";
    nextDirection = "RIGHT";
    pendingGrowth = 0;
    enemies = [];
    score = 0;
    level = 1;
    tickMs = 145;
    pulse = 0;
    state = "ready";
    lastTime = 0;
    accumulator = 0;

    highScore = Number(localStorage.getItem("snakeArenaHighScore") || 0);
    food = getFreePosition(6);

    updateHud();
    showOverlay("Snake Survival Arena", "Eat food and smaller snakes. Avoid bigger and poison snakes.", "Start Game");
    draw();
  }

  function startGame() {
    if (state === "gameover") resetGame();
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
    pulse += delta * 0.006;

    while (accumulator >= tickMs) {
      update();
      accumulator -= tickMs;
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  function update() {
    direction = nextDirection;

    const newHead = wrap(movePoint(player[0], direction));
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

    if (checkEnemyCollision()) return;

    maybeSpawnEnemy();
    moveEnemies();

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
        pendingGrowth += Math.min(6, enemy.body.length);
        enemies.splice(i, 1);
        updateDifficulty();
        updateHud();
        return false;
      }

      if (enemy.type === "small") {
        endGame("This snake was not small enough to eat.");
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
    const maxEnemies = Math.min(2 + level, 10);
    if (enemies.length >= maxEnemies) return;

    const chance = 0.034 + level * 0.006;
    if (Math.random() > chance) return;

    const type = chooseEnemyType();
    const length = enemyLength(type);
    const dir = randomDirection();
    const start = getFreePosition(7);
    const body = buildEnemyBody(start, dir, length);

    if (!body || body.some(p => isOccupied(p, 4))) return;

    enemies.push({
      type,
      dir,
      body,
      turnChance: type === "small" ? 0.30 : 0.18,
      phase: Math.random() * Math.PI * 2
    });
  }

  function chooseEnemyType() {
    const r = Math.random();

    if (level === 1) {
      return r < 0.82 ? "small" : "big";
    }

    if (level <= 3) {
      if (r < 0.58) return "small";
      if (r < 0.86) return "big";
      return "poison";
    }

    if (r < 0.44) return "small";
    if (r < 0.72) return "big";
    return "poison";
  }

  function enemyLength(type) {
    if (type === "small") return Math.max(2, Math.min(player.length - 1, 2 + Math.floor(Math.random() * 4)));
    if (type === "big") return player.length + 2 + Math.floor(Math.random() * Math.max(2, level));
    return 4 + Math.floor(Math.random() * 3);
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
    const newLevel = Math.min(12, 1 + Math.floor(score / 10));

    if (newLevel !== level) {
      level = newLevel;
      tickMs = Math.max(58, 145 - (level - 1) * 9);
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
    for (let tries = 0; tries < 600; tries++) {
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
    drawArena();
    drawFood();

    for (const enemy of enemies) {
      const palette = enemyPalette(enemy.type);
      drawRealSnake(enemy.body, enemy.dir, palette, enemy.phase, enemy.type);
    }

    drawRealSnake(player, direction, {
      head: COLORS.playerHead,
      body1: COLORS.playerBody1,
      body2: COLORS.playerBody2
    }, 0, "player");
  }

  function drawArena() {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, COLORS.bg1);
    gradient.addColorStop(1, COLORS.bg2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let y = 0; y < canvas.height + 18; y += 18) {
      for (let x = 0; x < canvas.width + 20; x += 32) {
        const ox = (Math.floor(y / 18) % 2) * 16;
        drawHex(x + ox, y, 10);
      }
    }

    for (let i = 0; i < 20; i++) {
      const x = (i * 137 + Math.sin(pulse + i) * 40) % canvas.width;
      const y = (i * 91 + Math.cos(pulse * 0.7 + i) * 30) % canvas.height;
      ctx.fillStyle = i % 3 === 0 ? "rgba(140,255,63,0.22)" : "rgba(255,216,74,0.16)";
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHex(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + Math.PI / 6;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawFood() {
    const px = food.x * CELL + CELL / 2;
    const py = food.y * CELL + CELL / 2;
    const glow = 7 + Math.sin(pulse * 2) * 2;

    ctx.save();
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 22;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(px, py, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(px - 2, py - 3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function enemyPalette(type) {
    if (type === "small") {
      return { head: COLORS.smallHead, body1: COLORS.smallBody1, body2: COLORS.smallBody2 };
    }

    if (type === "big") {
      return { head: COLORS.bigHead, body1: COLORS.bigBody1, body2: COLORS.bigBody2 };
    }

    return { head: COLORS.poisonHead, body1: COLORS.poisonBody1, body2: COLORS.poisonBody2 };
  }

  function drawRealSnake(body, dir, palette, phase = 0, type = "player") {
    if (!body.length) return;

    const points = body.map((part, index) => {
      const center = {
        x: part.x * CELL + CELL / 2,
        y: part.y * CELL + CELL / 2
      };

      if (index > 0 && index < body.length - 1) {
        const wave = Math.sin(index * 0.9 + pulse + phase) * 2.1;
        center.x += wave;
        center.y += Math.cos(index * 0.75 + pulse + phase) * 1.2;
      }

      return center;
    });

    drawSnakeBodyPath(points, palette, type);
    drawSnakeScales(points, type);
    drawSnakeHead(points[0], dir, palette, type);
  }

  function drawSnakeBodyPath(points, palette, type) {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(0,0,0,0.46)";
    ctx.lineWidth = type === "big" ? 23 : 20;
    drawSmoothPath(points);
    ctx.stroke();

    const grad = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    grad.addColorStop(0, palette.body1);
    grad.addColorStop(0.55, palette.body2);
    grad.addColorStop(1, "#050905");

    ctx.strokeStyle = grad;
    ctx.lineWidth = type === "big" ? 18 : 16;
    drawSmoothPath(points);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    drawSmoothPath(points.map((p, i) => ({ x: p.x - 2, y: p.y - 3 + Math.sin(i + pulse) })));
    ctx.stroke();

    ctx.restore();
  }

  function drawSmoothPath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }

    if (points.length > 1) {
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
  }

  function drawSnakeScales(points, type) {
    ctx.save();

    const every = type === "big" ? 1 : 2;
    for (let i = 1; i < points.length; i += every) {
      const p = points[i];
      const radius = type === "big" ? 3.8 : 3.2;

      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.20)";
      ctx.beginPath();
      ctx.ellipse(p.x - 2, p.y - 2, radius, radius * 0.65, 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 3, radius * 0.9, radius * 0.55, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSnakeHead(point, dir, palette, type) {
    const angle = directionAngle(dir);
    const size = type === "big" ? 15 : 13;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);

    ctx.shadowColor = palette.head;
    ctx.shadowBlur = type === "player" ? 18 : 10;

    const headGrad = ctx.createRadialGradient(-4, -6, 2, 0, 0, size + 8);
    headGrad.addColorStop(0, "rgba(255,255,255,0.85)");
    headGrad.addColorStop(0.25, palette.head);
    headGrad.addColorStop(1, palette.body2);

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(size + 5, 0);
    ctx.bezierCurveTo(size, -size, -size * 0.9, -size * 0.88, -size * 1.05, -2);
    ctx.bezierCurveTo(-size * 0.85, size * 0.9, size, size, size + 5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(0,0,0,0.34)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(size + 1, 0);
    ctx.lineTo(size - 5, 0);
    ctx.stroke();

    drawEye(1, -6);
    drawEye(1, 6);

    ctx.strokeStyle = COLORS.tongue;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(size + 5, 0);
    ctx.lineTo(size + 15, 0);
    ctx.lineTo(size + 22, -5);
    ctx.moveTo(size + 15, 0);
    ctx.lineTo(size + 22, 5);
    ctx.stroke();

    ctx.restore();
  }

  function drawEye(x, y) {
    ctx.fillStyle = "#eaff9d";
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.ellipse(x + 1, y, 1.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function directionAngle(dir) {
    if (dir === "RIGHT") return 0;
    if (dir === "DOWN") return Math.PI / 2;
    if (dir === "LEFT") return Math.PI;
    return -Math.PI / 2;
  }

  function updateHud() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("snakeArenaHighScore", String(highScore));
    }

    scoreEl.textContent = score;
    levelEl.textContent = level;
    lengthEl.textContent = player.length;
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

  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener("touchstart", e => {
    const touch = e.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  canvas.addEventListener("touchend", e => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      setDirection(dy > 0 ? "DOWN" : "UP");
    }
  }, { passive: true });

  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", pauseGame);
  restartButton.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  resetGame();
})();
