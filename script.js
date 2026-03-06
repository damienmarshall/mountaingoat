const introScreen = document.getElementById('intro-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const bombardinoBtns = document.querySelectorAll('.b-btn');
const bombardinoDesc = document.getElementById('bombardino-desc');
const scoreVal = document.getElementById('score-val');
const drinksVal = document.getElementById('drinks-val');
const multiplierDisplay = document.getElementById('multiplier-display');
const multiplierVal = document.getElementById('multiplier-val');
const finalScore = document.getElementById('final-score');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

let width, height;
let gameLoopId;
let lastTime = 0;
let score = 0;
let multiplier = 1;
let bombardinos = 1; // 1, 2, or 3
let gameState = 'intro'; // intro, playing, dead
let speedMulti = 1;
let controlSlippiness = 0.8;

// Game entities
let goat = { x: 0, y: 0, vx: 0, width: 25, height: 35, state: 'skiing', jumpTimer: 0 };
let obstacles = [];
let particles = [];
let distanceTraveled = 0;
let baseSpeed = 8; // Pixels per frame down

// Assets & Emojis
const GOAT_EMOJI = '🐐';
const TREE_EMOJIS = ['🌲', '🌲', '🌲', '🌲', '🌳', '🌳', '⛄', '🪨', '🪨']; // More heavily weighted to trees
const BOMBARDINO_EMOJI = '🍹';

const descs = {
    1: "Warm and steady cruise.",
    2: "Getting a bit dizzy!",
    3: "Fast and extremely slippery!"
};

// Handle Bombardino Selection
bombardinoBtns.forEach(btn => {
    // support touch properly on the menu
    const selectDrink = (e) => {
        if (e) e.preventDefault();
        bombardinoBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        bombardinos = parseInt(btn.getAttribute('data-val'));
        bombardinoDesc.innerText = descs[bombardinos];
    };
    btn.addEventListener('click', selectDrink);
    btn.addEventListener('touchstart', selectDrink, { passive: false });
});

function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    // Handle high DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
}

window.addEventListener('resize', resize);
resize();

// Input state
let keys = { left: false, right: false };
let touchLeft = false;
let touchRight = false;

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
});
window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
});

// Touch controls
const handleTouchLeft = (val) => (e) => {
    if (e) e.preventDefault();
    touchLeft = val;
    if (val) btnLeft.classList.add('active'); else btnLeft.classList.remove('active');
};
const handleTouchRight = (val) => (e) => {
    if (e) e.preventDefault();
    touchRight = val;
    if (val) btnRight.classList.add('active'); else btnRight.classList.remove('active');
};

btnLeft.addEventListener('mousedown', handleTouchLeft(true));
btnLeft.addEventListener('mouseup', handleTouchLeft(false));
btnLeft.addEventListener('mouseleave', handleTouchLeft(false));
btnLeft.addEventListener('touchstart', handleTouchLeft(true), { passive: false });
btnLeft.addEventListener('touchend', handleTouchLeft(false), { passive: false });
btnLeft.addEventListener('touchcancel', handleTouchLeft(false), { passive: false });

btnRight.addEventListener('mousedown', handleTouchRight(true));
btnRight.addEventListener('mouseup', handleTouchRight(false));
btnRight.addEventListener('mouseleave', handleTouchRight(false));
btnRight.addEventListener('touchstart', handleTouchRight(true), { passive: false });
btnRight.addEventListener('touchend', handleTouchRight(false), { passive: false });
btnRight.addEventListener('touchcancel', handleTouchRight(false), { passive: false });


function initGame(e) {
    if (e && e.preventDefault) e.preventDefault();
    resize();

    // Reset base speed in case of returning from main menu after death
    baseSpeed = 8;

    // Set parameters based on bombardinos
    // Bombardinos: 1 (normal), 2 (faster, slippery), 3 (fastest, drippy)
    speedMulti = 1 + (bombardinos - 1) * 0.25; // 1, 1.25, 1.5 multiplier
    controlSlippiness = 0.88 + (bombardinos - 1) * 0.03; // 0.88 (tight), 0.91, 0.94 (ice)

    goat = {
        x: width / 2,
        y: height * 0.25, // 25% down from top
        vx: 0,
        width: 25,
        height: 35,
        state: 'skiing',
        jumpTimer: 0
    };

    obstacles = [];
    particles = [];
    trails = [];
    floatingTexts = [];
    score = 0;
    multiplier = 1;
    distanceTraveled = 0;
    gameState = 'playing';

    // Update UI
    let drinksStr = '';
    for (let i = 0; i < bombardinos; i++) drinksStr += '🍹';
    drinksVal.innerText = drinksStr;
    scoreVal.innerText = '0';
    multiplierVal.innerText = 'x1.0';

    // Guarantee an early jump so the player can start building multiplier
    spawnObstacle(height * 0.8, true);

    introScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    lastTime = performance.now();
    gameLoopId = requestAnimationFrame(update);
}

function spawnObstacle(yPos, forceJump = false) {
    // 15% chance for a jump ramp, otherwise scatter trees/rocks. Increased density below.
    const isJump = forceJump || Math.random() < 0.15;
    const scale = 0.8 + Math.random() * 0.6; // 0.8 to 1.4 size variance
    const padding = 30;
    const xPos = padding + Math.random() * (width - padding * 2);

    const obj = {
        x: xPos,
        y: yPos || (height + 50),
        type: isJump ? 'jump' : 'obstacle',
        emoji: '',
        width: 35 * scale,
        height: 35 * scale,
        active: true
    };

    if (!isJump) {
        obj.emoji = TREE_EMOJIS[Math.floor(Math.random() * TREE_EMOJIS.length)];
        // Special hitboxes based on emoji type
        if (obj.emoji === '🪨') {
            obj.width = 25 * scale;
            obj.height = 20 * scale;
        } else if (obj.emoji === '🌲' || obj.emoji === '🌳') {
            obj.width = 25 * scale;
            obj.height = 40 * scale;
        }
    } else {
        // Ramp dimensions
        obj.width = 50 * scale;
        obj.height = 20 * scale;
    }

    // Don't spawn on top of each other (basic check)
    let overlap = false;
    for (let ob of obstacles) {
        let dist = Math.hypot(ob.x - obj.x, ob.y - obj.y);
        if (dist < 50) overlap = true;
    }

    if (!overlap) obstacles.push(obj);
}

function createSnowParticles(x, y, amount = 1, speed = 1) {
    for (let i = 0; i < amount; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 15,
            y: y,
            vx: (Math.random() - 0.5) * 3 * speed,
            vy: -1 - Math.random() * 3 * speed,
            life: 20 + Math.random() * 20,
            maxLife: 40
        });
    }
}

// Fixed timestep for consistent speed across refresh rates
const FIXED_DT = 1000 / 60;
let accumulator = 0;

let floatingTexts = [];
let trails = [];

// Create a trail point behind the goat
function createTrail(x, y, vx) {
    // Only trail when on the ground
    trails.push({
        x: x,
        y: y + 20, // At feet
        vx: vx // store velocity for width/carve intensity
    });
}

function createFloatingText(x, y, text, color) {
    floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 60,
        maxLife: 60,
        vy: -2
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy - speedMulti * baseSpeed; // move back and up
        p.life--;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // Scroll trails upwards
    for (let i = trails.length - 1; i >= 0; i--) {
        trails[i].y -= speedMulti * baseSpeed;
        if (trails[i].y < -100) {
            trails.splice(i, 1);
        }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.vy - speedMulti * baseSpeed;
        ft.life--;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(p => {
        let alpha = p.life / p.maxLife;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        // size shrinks as it dies
        ctx.arc(p.x, p.y, Math.max(0.5, (p.life / p.maxLife) * 3), 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw trails
    if (trails.length > 1) {
        ctx.save();
        ctx.beginPath();
        // Lightly transparent snowy path
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < trails.length - 1; i++) {
            let t1 = trails[i];
            let t2 = trails[i + 1];

            // If the distance is huge, they jumped or warped, break line
            if (Math.abs(t1.y - t2.y) > (speedMulti * baseSpeed * 3)) {
                ctx.stroke();
                ctx.beginPath();
                continue;
            }

            // Wider trail if carving hard laterally
            let carveIntensity = Math.abs(t1.vx) / 5;
            ctx.lineWidth = Math.min(18, 10 + carveIntensity * 6);

            ctx.moveTo(t1.x, t1.y);
            ctx.lineTo(t2.x, t2.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    floatingTexts.forEach(ft => {
        let alpha = ft.life / ft.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ft.color;
        ctx.font = `bold 24px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    });
}

function checkCollision(r1, r2) {
    // Generous hitbox for player (smaller than visual size)
    const shrinkX = 8;
    const shrinkY = 12;

    return r1.x - r1.width / 2 + shrinkX < r2.x + r2.width / 2 &&
        r1.x + r1.width / 2 - shrinkX > r2.x - r2.width / 2 &&
        r1.y - r1.height / 2 + shrinkY < r2.y + r2.height / 2 &&
        r1.y + r1.height / 2 - shrinkY > r2.y - r2.height / 2;
}

function updateGoat() {
    // Jump logic
    if (goat.jumpTimer > 0) {
        goat.jumpTimer--;
    } else {
        if (goat.state === 'jumping') {
            // Landed
            goat.state = 'skiing';
            createSnowParticles(goat.x, goat.y + 15, 8, 1); // landing puff
        }
    }

    // Input acceleration
    const accel = 1.6;
    if (keys.left || touchLeft) goat.vx -= accel;
    if (keys.right || touchRight) goat.vx += accel;

    // Friction / Slippiness
    goat.vx *= controlSlippiness;

    goat.x += goat.vx;

    // Screen bounds bounce
    const margin = 20;
    if (goat.x < margin) { goat.x = margin; goat.vx *= -0.5; }
    if (goat.x > width - margin) { goat.x = width - margin; goat.vx *= -0.5; }

    // Trail particles and carve points when on ground
    if (goat.state === 'skiing' && gameState === 'playing') {
        createTrail(goat.x, goat.y, goat.vx);
        if (Math.abs(goat.vx) > 3 && Math.random() > 0.4) {
            // kicking up extra snow when carving horizontally
            createSnowParticles(goat.x - (Math.sign(goat.vx) * 10), goat.y + 15, 1, 1);
        }
    }
}

function updateObstacles() {
    const currentSpeed = baseSpeed * speedMulti;
    distanceTraveled += currentSpeed;

    // Update score
    // 1 drink = 1x base score. 2 drinks = 2x base score. 3 drinks = 3x base score.
    let newScore = Math.floor((distanceTraveled / 10) * multiplier * bombardinos);
    if (newScore > score) {
        score = newScore;
        scoreVal.innerText = score;
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.y -= currentSpeed; // simulate moving down mountain

        // Collision
        if (obs.active && checkCollision(goat, obs)) {
            if (obs.type === 'jump') {
                goat.state = 'jumping';
                goat.jumpTimer = 40; // ~0.66s
                // mini speed burst from hitting a jump
                distanceTraveled += 500;
                multiplier += 0.5; // increase multiplier

                // Update UI multiplier
                multiplierVal.innerText = `x${multiplier.toFixed(1)}`;
                // Bump animation
                multiplierDisplay.style.transform = 'scale(1.2)';
                setTimeout(() => multiplierDisplay.style.transform = '', 200);

                let jumpScore = Math.floor(100 * multiplier * bombardinos);
                score += jumpScore;

                // popup score text effect over goat area
                createFloatingText(goat.x, goat.y - 40, `+${jumpScore} (x${multiplier.toFixed(1)})`, '#fde047');

                scoreVal.innerText = score;
                scoreVal.style.color = '#fde047';
                scoreVal.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    scoreVal.style.color = '';
                    scoreVal.style.transform = 'scale(1)';
                }, 300);

                obs.active = false;
                createSnowParticles(goat.x, goat.y, 15, 2);
            } else if (goat.state !== 'jumping') {
                // Wipeout!
                if (goat.state !== 'dead') gameOver();
            }
        }

        // Remove if way off top
        if (obs.y < -100) {
            obstacles.splice(i, 1);
        }
    }

    // Spawn rate increases smoothly as game goes on. Score is the primary modifier.
    // 0 score = ~0.03 density. 10,000 score = ~0.15 density.
    let scoreModifier = Math.min((score / 10000) * 0.12, 0.4); // Cap max additional density from score at 0.4
    let density = 0.03 + scoreModifier;

    // Grace period for the start of gameplay based on difficulty
    // Level 1: ~3s (900px), Level 2: ~6s (1800px), Level 3: ~10s (3000px)
    let graceDistance = 3000;
    if (bombardinos === 1) graceDistance = 900;
    if (bombardinos === 2) graceDistance = 1800;

    if (distanceTraveled < graceDistance) {
        density = 0.002; // Very empty, gives time to react
    } else if (distanceTraveled < graceDistance * 2) {
        // Ramp up gradually over the next few seconds
        let progress = (distanceTraveled - graceDistance) / graceDistance;
        density = 0.002 + (density - 0.002) * progress;
    }

    // Base chance of spawning 1 obstacle each tick
    if (Math.random() < density) {
        spawnObstacle(height + 100);

        // As score gets very high, add chances for double and triple spawns per frame
        if (Math.random() < density - 0.08) spawnObstacle(height + 100);
        if (score > 5000 && Math.random() < density - 0.15) spawnObstacle(height + 100);
    }
}

function drawEntity(x, y, emoji, size, rotate = 0, scale = 1, alpha = 1) {
    if (!emoji) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111111'; // Reset opaque fill style to prevent Windows from applying shadow opacity to emoji
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
}

function drawRamp(ent) {
    ctx.save();
    ctx.translate(ent.x, ent.y);

    // Ramp shape
    ctx.beginPath();
    ctx.moveTo(-ent.width / 2, -ent.height / 2); // top left 
    ctx.lineTo(ent.width / 2, -ent.height / 2);  // top right
    ctx.lineTo(ent.width / 2 + 8, ent.height / 2); // bottom right (flares out)
    ctx.lineTo(-ent.width / 2 - 8, ent.height / 2); // bottom left
    ctx.closePath();

    // Gradient for fake wooden ramp
    let grad = ctx.createLinearGradient(0, -ent.height / 2, 0, ent.height / 2);
    grad.addColorStop(0, '#78350f'); // dark wood
    grad.addColorStop(1, '#d97706'); // lighter amber

    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#451a03'; // very dark brown
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ramp lip
    ctx.beginPath();
    ctx.moveTo(-ent.width / 2 - 8, ent.height / 2);
    ctx.lineTo(ent.width / 2 + 8, ent.height / 2);
    ctx.strokeStyle = '#fbbf24'; // bright yellow/amber lip
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
}

function drawScene() {
    ctx.clearRect(0, 0, width, height);

    drawParticles();

    // Sort y so lower objects are drawn last (z-index)
    let orderedDraws = [...obstacles, { ...goat, isGoat: true }].sort((a, b) => a.y - b.y);

    for (let ent of orderedDraws) {
        if (ent.isGoat) {
            // Draw Goat
            let rotation = ent.vx * 0.04;
            let scaleX = 1.0;
            let scaleY = 1.0;
            let yOffset = 0;

            if (ent.state === 'jumping') {
                // Parabolic jump arc approximation using jumpTimer
                let jumpProgress = 1 - Math.abs(20 - ent.jumpTimer) / 20; // 0 to 1 to 0
                scaleX = 1.0 + jumpProgress * 0.5;
                scaleY = 1.0 + jumpProgress * 0.5;
                yOffset = jumpProgress * 40; // peak height
                rotation += jumpProgress * (ent.vx > 0 ? 0.3 : -0.3); // flair flip
            }

            // Draw shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(ent.x, ent.y + 20, 14, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.translate(ent.x, ent.y - yOffset);
            ctx.rotate(rotation);
            ctx.scale(scaleX, scaleY);

            if (ent.state !== 'dead') {
                // Draw Skis underneath the goat's feet
                ctx.strokeStyle = '#f97316'; // orange
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';

                // Left ski (shifted down to be under the goat)
                ctx.beginPath();
                ctx.moveTo(-15, 8);
                ctx.lineTo(-10, 35);
                ctx.stroke();
                // Right ski (shifted down to be under the goat)
                ctx.beginPath();
                ctx.moveTo(15, 8);
                ctx.lineTo(10, 35);
                ctx.stroke();
            }

            // Goat emoji
            ctx.font = `40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#111111'; // Reset opaque fill style to prevent Windows from applying shadow opacity to emoji
            // slight bobbing if skiing
            let bob = (ent.state === 'skiing' && gameState === 'playing') ? Math.sin(Date.now() / 100) * 2 : 0;
            ctx.fillText(GOAT_EMOJI, 0, bob);
            ctx.restore();

            if (gameState === 'dead') {
                drawEntity(ent.x, ent.y - 30, '💫', 30, (Date.now() / 100) % (Math.PI * 2));
            }

        } else {
            // Draw Obstacle
            if (ent.type === 'jump') {
                drawRamp(ent);
            } else {
                // Cast prominent shadow
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath();
                ctx.ellipse(ent.x, ent.y + ent.height / 2 - 5, ent.width / 2.2, ent.width / 4.5, 0, 0, Math.PI * 2);
                ctx.fill();

                drawEntity(ent.x, ent.y, ent.emoji, ent.width);
            }
        }
    }
}

function gameOver() {
    gameState = 'dead';
    finalScore.innerText = score;
    goat.state = 'dead';
    createSnowParticles(goat.x, goat.y, 30, 3); // explosion of snow

    setTimeout(() => {
        gameOverScreen.classList.remove('hidden');
    }, 1000);
}

function update(time) {
    // Tick logic (fixed dt to prevent high Hz monitors from making it too fast)
    let deltaTime = time - lastTime;
    lastTime = time;
    accumulator += deltaTime;

    // Safety cap to prevent spiral of death on lag
    if (accumulator > 100) accumulator = 100;

    if (gameState === 'playing' || gameState === 'dead') {
        while (accumulator >= FIXED_DT) {
            if (gameState === 'playing') {
                updateGoat();
                updateObstacles();
            } else if (gameState === 'dead') {
                // slowing down everything
                baseSpeed *= 0.95;
                updateObstacles();
            }
            updateParticles();
            accumulator -= FIXED_DT;
        }

        drawScene();
    }

    if (gameState !== 'intro') {
        gameLoopId = requestAnimationFrame(update);
    }
}

// Ensure interactions are bound
startBtn.addEventListener('click', initGame);
startBtn.addEventListener('touchstart', initGame, { passive: false });

restartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    gameOverScreen.classList.add('hidden');
    // reset base speed
    baseSpeed = 8;
    initGame(e);
});
restartBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    gameOverScreen.classList.add('hidden');
    baseSpeed = 8;
    initGame(e);
}, { passive: false });

// Main Menu Button functionality
const goToMainMenu = (e) => {
    if (e) e.preventDefault();
    gameOverScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    introScreen.classList.remove('hidden');
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameState = 'intro';
};

menuBtn.addEventListener('click', goToMainMenu);
menuBtn.addEventListener('touchstart', goToMainMenu, { passive: false });

// Set default
bombardinoBtns[0].click(); 
