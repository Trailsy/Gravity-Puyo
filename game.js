const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const quotaDisplay = document.getElementById('quota');

// --- SYSTEM ENGINE LAYOUT VARIABLES ---
const GRID_ROWS = 10;
let GRID_COLS = 10; 
const TILE = 50;
const COLORS = ['#FF0055', '#00FF88', '#0099FF', '#FFCC00'];

// CRITICAL FIX: Initialize grid with actual arrays immediately so startup checks never crash
let grid = Array(GRID_ROWS).fill().map(() => Array(10).fill(null));
let score = 0;
let piecesUntilShift = 10;
let currentPair = null;
let isSettling = false;
let lastTime = 0;
let dropCounter = 0;
let clearingPuyos = [];
let floatingTexts = [];
let chainCount = 0;
let quotaCount = 0;

let gameMode = 'normal'; 
let gameState = 'menu'; 
let leftRenderAngle = 0;
let rightRenderAngle = 0;
let leftTargetAngle = 0;
let rightTargetAngle = 0;
let rotationTimer = 0;
let isRotating = false;
// In split mode, only one box rotates per shift. This flip-flops each shift.
let nextRotatingBox = 'left';
let gravityArrows = { left: null, right: null }; // 'right' | 'left' | 'down' | null

const keys = {};
let dasTimer = 0;
const DAS_DELAY = 150;
const DAS_INTERVAL = 40;

// FIX: declare globals used by update()/draw() before first frame
let isPaused = false;
let dangerIntensity = 0;
let dangerPulseTimer = 0;
let screenShakeX = 0;
let screenShakeY = 0;

// --- GAME OBJECT TEMPLATES ---
class FloatingText {
    constructor(text, x, y, color) {
        this.text = text; this.x = x; this.y = y; this.color = color;
        this.life = 1.0; this.vy = -2;
    }
    update() { this.y += this.vy; this.life -= 0.02; }
    draw() {
        ctx.save(); ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color;
        ctx.font = '30px "Fredoka One", cursive'; ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y); ctx.restore();
    }
}

class Puyo {
    constructor(x, y, color, isTrash = false) {
        this.x = x; this.y = y;
        this.visualX = x; this.visualY = y;
        this.color = color; this.isTrash = isTrash;
        this.scale = 1; this.blinkTimer = Math.random() * 2000;
    }
    update(dt) {
        this.visualX += (this.x - this.visualX) * 0.15;
        this.visualY += (this.y - this.visualY) * 0.15;
        this.blinkTimer -= dt;
        if (this.blinkTimer < 0) this.blinkTimer = 3000 + Math.random() * 3000;
    }
    draw() {
        const px = this.visualX * TILE + TILE / 2;
        const py = this.visualY * TILE + TILE / 2;
        const s = Math.max(0, this.scale * (TILE / 2 - 4));

        ctx.save(); ctx.translate(px, py);

        if (this.isRainbow) {
            const g = ctx.createLinearGradient(-s, -s, s, s);
            g.addColorStop(0, '#ff0055'); g.addColorStop(0.33, '#ffcc00');
            g.addColorStop(0.66, '#00ff88'); g.addColorStop(1, '#0099ff');
            ctx.fillStyle = g; ctx.shadowBlur = 22; ctx.shadowColor = '#ffffff';
        } else {
            ctx.fillStyle = this.color;
            if (!this.isTrash) { ctx.shadowBlur = 15; ctx.shadowColor = this.color; }
        }
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

        if (this.isBomb) {
            ctx.fillStyle = '#1a1a22';
            ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.quadraticCurveTo(s * 0.15, -s * 0.9, s * 0.25, -s * 1.05); ctx.stroke();
            const sparkR = 2 + Math.abs(Math.sin(Date.now() / 80)) * 3;
            ctx.fillStyle = '#ffee00'; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(s * 0.25, -s * 1.05, sparkR, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = this.isTrash ? "white" : "black";
            if (this.isTrash) {
                ctx.font = "20px Arial"; ctx.textAlign = "center"; ctx.fillText("X", 0, 7);
            } else {
                if (this.blinkTimer < 150) { ctx.fillRect(-10, -2, 6, 2); ctx.fillRect(4, -2, 6, 2); }
                else { ctx.beginPath(); ctx.arc(-7, -2, 3, 0, Math.PI * 2); ctx.arc(7, -2, 3, 0, Math.PI * 2); ctx.fill(); }
                ctx.strokeStyle = "black"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 3, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
                if (this.isRainbow) {
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
                    ctx.fillText('★', 0, -6);
                }
            }
        }
        ctx.restore();
    }
}

// --- STATE SWITCH MECHANISMS ---
// --- FIXED STATE SWITCH MECHANISMS ---

// Add this helper near your global configurations in game.js:
let isCinematicActive = false; // Freeze keys and logic loops when loading or announcing rounds

// --- CINEMATIC ARCADE TRANSITIONS SYSTEM ---

function triggerLoadingScreen(onCompleteCallback) {
    isCinematicActive = true;
    const loadingScreen = document.getElementById('loading-overlay');
    
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }

    // UPDATED TIMING: Extended minimum wait to 4500ms and maximum to 7000ms
    const randomDelay = Math.random() * (7000 - 4500) + 4500;

    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        // Fire target callback to transition states cleanly
        if (onCompleteCallback) onCompleteCallback();
    }, randomDelay);
}


async function runRoundCountdownSequence() {
    isCinematicActive = true;
    const countOverlay = document.getElementById('countdown-overlay');
    const textNode = document.getElementById('announcement-text');
    
    if (!countOverlay || !textNode) {
        isCinematicActive = false;
        spawnPair();
        return;
    }

    const phases = [
        { phrase: "READY...", color: "#ff0055", shadow: "rgba(255,0,85,0.8)" },
        { phrase: "SET...", color: "#ffcc00", shadow: "rgba(255,204,0,0.8)" },
        { phrase: "PUYO!!!", color: "#00ff88", shadow: "rgba(0,255,136,0.8)" }
    ];

    countOverlay.classList.remove('hidden');

    for (let index = 0; index < phases.length; index++) {
        const item = phases[index];
        textNode.innerText = item.phrase;
        textNode.style.color = item.color;
        textNode.style.textShadow = `0 0 30px ${item.shadow}, 0 0 10px ${item.shadow}`;
        
        textNode.classList.remove('trigger-pulse-text');
        void textNode.offsetWidth; // Force layout recalculation reflow
        textNode.classList.add('trigger-pulse-text');

        await new Promise(resolve => setTimeout(resolve, 600));
    }

    // FIXED: Instead of hiding the layout container with an !important display flag,
    // we safely empty out the text or toggle it so the canvas rendering pipeline stays active
    countOverlay.classList.add('hidden');
    textNode.innerText = "";
    textNode.classList.remove('trigger-pulse-text');
    
    isCinematicActive = false;
    spawnPair(); // This will drop your active pairs now
}

// --- UPGRADED CONTEXT RE-ROUTE LOGIC DISPATCH CHANNELS ---

function startGame(mode, vsOpponent, difficulty) {
    // Hide all menus IMMEDIATELY so the loading screen isn't competing
    // with a still-visible difficulty / vs submenu underneath.
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    const _vsSubEarly = document.getElementById('vs-submenu-overlay');
    if (_vsSubEarly) _vsSubEarly.classList.add('hidden');
    const _diffRowEarly = document.getElementById('vs-difficulty-row');
    if (_diffRowEarly) _diffRowEarly.classList.add('hidden');

    triggerLoadingScreen(() => {
        gameMode = mode;
        gameState = 'playing';
        isPaused = false;
        leftRenderAngle = 0;
        rightRenderAngle = 0;
        nextRotatingBox = 'left';

        // Vs mode uses two 10-wide boards rendered side-by-side (canvas = 20*TILE)
        GRID_COLS = (gameMode === 'split' || gameMode === 'vs') ? 20 : 10;
        canvas.width = GRID_COLS * TILE;
        canvas.height = GRID_ROWS * TILE;

        document.getElementById('ui').classList.remove('hidden');
        document.getElementById('game-wrapper').classList.remove('hidden');

        // Clear board history states
        grid = Array(GRID_ROWS).fill().map(() => Array(GRID_COLS).fill(null));
        const initialShift = (gameMode === 'split') ? 5 : 10;
        score = 0; scoreDisplay.innerText = 0;
        piecesUntilShift = initialShift; timerDisplay.innerText = initialShift;
        quotaCount = 0; quotaDisplay.innerText = 0; floatingTexts = []; clearingPuyos = [];

        if (gameMode === 'vs') {
            vsInit(vsOpponent || 'cpu', difficulty || 'hard');
            // No gravity-shift timer in vs mode
            timerDisplay.innerText = '-';
            runRoundCountdownSequence();
        } else {
            runRoundCountdownSequence();
        }
        if (typeof onGameStarted === 'function') onGameStarted(mode, vsOpponent, difficulty);
    });
}

function backToMenu() {
    triggerLoadingScreen(() => {
        gameState = 'menu';
        isPaused = false;
        isCinematicActive = false;
        
        document.getElementById('ui').classList.add('hidden');
        document.getElementById('game-over-overlay').classList.add('hidden');
        document.getElementById('pause-overlay').classList.add('hidden');
        
        document.getElementById('game-wrapper').classList.remove('hidden');
        document.getElementById('menu-overlay').classList.remove('hidden');
    });
}

function triggerGameOver() {
    gameState = 'gameover';
    currentPair = null;
    isPaused = false;
    isCinematicActive = false;
    
    document.getElementById('end-score').innerText = score;
    if (typeof onGameOver === 'function') onGameOver(gameMode, score);
    
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.remove('hidden');
}


// --- CORE PHYSICS & SPAWN LOGIC ---
function spawnPair() {
    if (gameState !== 'playing' || isCinematicActive) return;
    if (gameMode === 'vs') return; // vs has its own per-player spawn
    
    isSettling = false;
    const startX = (gameMode === 'split') ? 5 : 4;
    
    // FIXED: Accesses Row 0 and Row 1 directly at Column index startX
    if (grid && grid[0] && grid[1]) {
        if (grid[0][startX] || grid[1][startX]) { 
            triggerGameOver(); 
            return; 
        }
    }
    
    currentPair = {
        puyos: [
            new Puyo(startX, 1, randomColor()), 
            new Puyo(startX, 0, randomColor())
        ],
        rot: 0
    };
    chainCount = 0;
    if (typeof window.__maybePowerUp === 'function') window.__maybePowerUp(currentPair);
}

function randomColor() {
    const r = (gameMode === 'daily' && window.__dailyRNG) ? window.__dailyRNG() : Math.random();
    return COLORS[Math.floor(r * COLORS.length)];
}
function isValid(x, y) { return x >= 0 && x < GRID_COLS && y < GRID_ROWS && (y < 0 || (grid[y] && !grid[y][x])); }

function moveActive(dx, dy) {
    if (!currentPair || isSettling || gameState !== 'playing') return false;
    if (currentPair.puyos.every(p => isValid(p.x + dx, p.y + dy))) {
        currentPair.puyos.forEach(p => { p.x += dx; p.y += dy; });
        return true;
    } else if (dy > 0) {
        lockPair();
    }
    return false;
}

function rotatePair(dir) {
    if (!currentPair || isSettling || gameState !== 'playing' || isCinematicActive) return;
    
    // FIXED: Extracts specific child index parameters 0 and 1
    const p1 = currentPair.puyos[0];
    const p2 = currentPair.puyos[1];
    if (!p1 || !p2) return;
    
    const nr = (currentPair.rot + dir + 4) % 4;
    let dx = 0, dy = 0;
    
    if (nr === 0) dy = -1; 
    else if (nr === 1) dx = 1; 
    else if (nr === 2) dy = 1; 
    else if (nr === 3) dx = -1;

    if (isValid(p1.x + dx, p1.y + dy)) {
        p2.x = p1.x + dx; 
        p2.y = p1.y + dy; 
        currentPair.rot = nr;
    } else {
        const kx = p1.x - dx;
        if (isValid(kx, p1.y) && isValid(kx + dx, p1.y + dy)) {
            p1.x = kx; 
            p2.x = kx + dx; 
            p2.y = p1.y + dy; 
            currentPair.rot = nr;
        }
    }
}

function lockPair() {
    if (!currentPair) return;
    currentPair.puyos.forEach(p => { if (p.y >= 0) grid[p.y][p.x] = p; });
    currentPair = null;
    piecesUntilShift--;
    timerDisplay.innerText = piecesUntilShift;
    settleBoard();
}

async function settleBoard() {
    isSettling = true;
    let dropped = true;
    while (dropped) {
        dropped = false;
        for (let x = 0; x < GRID_COLS; x++) {
            for (let y = GRID_ROWS - 2; y >= 0; y--) {
                if (grid[y] && grid[y][x] && grid[y + 1] && !grid[y + 1][x]) {
                    grid[y + 1][x] = grid[y][x]; 
                    grid[y + 1][x].x = x; 
                    grid[y + 1][x].y = y + 1;
                    grid[y][x] = null; 
                    dropped = true;
                }
            }
        }
        if (dropped) await new Promise(r => setTimeout(r, 80));
    }
    const matched = await checkMatches();
    if (!matched) {
        if (piecesUntilShift <= 0) await shiftGravity();
        else spawnPair();
    }
}

async function checkMatches() {
    let toClear = []; const visited = new Set();
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            const c = grid[y] && grid[y][x];
            if (!c || c.isTrash || c.isRainbow || visited.has(`${x},${y}`)) continue;
            let group = []; findGroup(x, y, c.color, group, visited);
            if (group.length >= 4) toClear.push(...group);
        }
    }

    // POWER-UP: any bomb caught in a clear detonates a 3x3 area
    const bombs = toClear.filter(p => p.isBomb);
    if (bombs.length > 0) {
        bombs.forEach(b => {
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = b.x + dx, ny = b.y + dy;
                if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;
                const c = grid[ny] && grid[ny][nx];
                if (c && !toClear.includes(c)) toClear.push(c);
            }
            if (typeof window.__spawnExplosionFx === 'function') window.__spawnExplosionFx(b.x, b.y, '#ff8800');
        });
    }

    if (toClear.length > 0) {
        chainCount++; quotaCount += toClear.length;
        quotaDisplay.innerText = quotaCount;
        let trashToClear = [];

        toClear.forEach(p => {
            [{dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:1}, {dx:0, dy:-1}].forEach(m => {
                let nx = p.x + m.dx, ny = p.y + m.dy;
                if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
                    let t = grid[ny] ? grid[ny][nx] : null;
                    if (t && t.isTrash && !trashToClear.includes(t)) trashToClear.push(t);
                }
            });
        });

        clearingPuyos = [...toClear, ...trashToClear];
        if (typeof window.__onChainJuice === 'function') window.__onChainJuice(chainCount, toClear.length, clearingPuyos);
        if (chainCount > 1) floatingTexts.push(new FloatingText(`CHAIN x${chainCount}`, canvas.width / 2, 200, '#00FF88'));
        for (let i = 0; i < 6; i++) { clearingPuyos.forEach(p => p.scale += 0.1); await new Promise(r => setTimeout(r, 30)); }
        for (let i = 0; i < 6; i++) { clearingPuyos.forEach(p => p.scale -= 0.2); await new Promise(r => setTimeout(r, 30)); }

        clearingPuyos.forEach(p => { if (grid[p.y] && grid[p.y][p.x] === p) grid[p.y][p.x] = null; });
        clearingPuyos = []; const gained = toClear.length * 10 * chainCount;
        score += gained; scoreDisplay.innerText = score;
        if (typeof window.__onScoreGain === 'function') window.__onScoreGain(gained, chainCount);
        if (typeof onChainStep === 'function') onChainStep(gameMode, chainCount, toClear.length, 0);

        await settleBoard();
        return true;
    }
    return false;
}

function findGroup(x, y, color, group, visited) {
    const key = `${x},${y}`;
    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS || visited.has(key)) return;
    const c = grid[y] && grid[y][x];
    if (!c || c.isTrash) return;
    if (!c.isRainbow && c.color !== color) return;
    visited.add(key); group.push(c);
    findGroup(x + 1, y, color, group, visited); findGroup(x - 1, y, color, group, visited);
    findGroup(x, y + 1, color, group, visited); findGroup(x, y - 1, color, group, visited);
}

// Slide a specific set of puyos horizontally (dir = +1 right, -1 left)
// until they hit the outer wall or another (non-sliding) puyo.
async function applySidewaysGravity(dir, slidingSet) {
    let moved = true;
    while (moved) {
        moved = false;
        if (dir > 0) {
            // Iterate from right edge inward so puyos cascade against the wall
            for (let x = GRID_COLS - 2; x >= 0; x--) {
                for (let y = 0; y < GRID_ROWS; y++) {
                    const p = grid[y] && grid[y][x];
                    if (p && slidingSet.has(p) && grid[y][x + 1] === null) {
                        grid[y][x + 1] = p;
                        p.x = x + 1;
                        grid[y][x] = null;
                        moved = true;
                    }
                }
            }
        } else {
            for (let x = 1; x < GRID_COLS; x++) {
                for (let y = 0; y < GRID_ROWS; y++) {
                    const p = grid[y] && grid[y][x];
                    if (p && slidingSet.has(p) && grid[y][x - 1] === null) {
                        grid[y][x - 1] = p;
                        p.x = x - 1;
                        grid[y][x] = null;
                        moved = true;
                    }
                }
            }
        }
        if (moved) await new Promise(r => setTimeout(r, 70));
    }
}

async function shiftGravity() {
    isSettling = true;

    // 1. Drop garbage immediately if player missed threshold
    if (quotaCount < 8) {
        floatingTexts.push(new FloatingText("TRASH DROP!", canvas.width / 2, 150, '#8aa'));
        for (let i = 0; i < (8 - quotaCount); i++) {
            let tx = Math.floor(Math.random() * GRID_COLS);
            let ty = 0;
            while (ty < GRID_ROWS && grid[ty] && !grid[ty][tx]) { ty++; }
            ty--;
            if (ty >= 0 && grid[ty]) grid[ty][tx] = new Puyo(tx, ty, '#555566', true);
        }
    }
    quotaCount = 0;
    quotaDisplay.innerText = 0;

    // 2. Decide what rotates this shift. Both modes rotate CLOCKWISE.
    //    Normal -> whole board. Split -> exactly one box, alternating.
    let rotatingBox; // 'whole' | 'left' | 'right'
    if (gameMode === 'normal') {
        rotatingBox = 'whole';
        leftTargetAngle = Math.PI / 2;
    } else {
        rotatingBox = nextRotatingBox;
        if (rotatingBox === 'left') {
            leftTargetAngle = Math.PI / 2;   // CW
        } else {
            rightTargetAngle = Math.PI / 2;  // CW
        }
    }
    isRotating = true;
    rotationTimer = 0;

    // 3. Wait for the smooth visual spin to complete (~800ms ease)
    await new Promise(r => setTimeout(r, 800));

    // 4. Transform the grid data to match the new orientation.
    //    Only the rotated box(es) get remapped; the other box stays put.
    let nG = Array(GRID_ROWS).fill().map(() => Array(GRID_COLS).fill(null));

    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
            if (!grid[y] || !grid[y][x]) continue;
            let p = grid[y][x];
            let nx = x, ny = y;

            if (rotatingBox === 'whole') {
                // Full board CW: (x,y) -> (cols-1-y, x)
                nx = (GRID_COLS - 1) - y;
                ny = x;
            } else if (rotatingBox === 'left' && x < 10) {
                // CW within left box (cols 0-9): (x,y) -> (9-y, x)
                nx = 9 - y;
                ny = x;
            } else if (rotatingBox === 'right' && x >= 10) {
                // CW within right box (cols 10-19), local lx = x-10
                const lx = x - 10;
                nx = 10 + (9 - y);
                ny = lx;
            }
            // else: puyo in the non-rotated box, keep position

            p.x = nx;
            p.y = ny;
            p.visualX = nx;
            p.visualY = ny;
            nG[ny][nx] = p;
        }
    }
    grid = nG;

    // 5. Snap visuals back to upright (contents are now re-oriented in data)
    leftRenderAngle = 0;
    rightRenderAngle = 0;
    leftTargetAngle = 0;
    rightTargetAngle = 0;
    isRotating = false;
    if (typeof window.__onGravityFlip === 'function') window.__onGravityFlip(rotatingBox);


    // 7. SPLIT MODE: sideways gravity for the rotated box's puyos.
    //    Left rotated -> slide right toward col 19 wall of the other (right) box.
    //    Right rotated -> slide left toward col 0 wall of the other (left) box.
    if (gameMode === 'split' && rotatingBox !== 'whole') {
        const slidingSet = new Set();
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < GRID_COLS; x++) {
                const p = grid[y] && grid[y][x];
                if (!p) continue;
                if (rotatingBox === 'left' && x < 10) slidingSet.add(p);
                else if (rotatingBox === 'right' && x >= 10) slidingSet.add(p);
            }
        }
        const dir = (rotatingBox === 'left') ? 1 : -1;
        // Show sideways arrow in the source square's background
        if (rotatingBox === 'left') gravityArrows.left = 'right';
        else gravityArrows.right = 'left';
        await applySidewaysGravity(dir, slidingSet);
        // Sideways done -> clear source arrow, show downward arrow in the destination square
        if (rotatingBox === 'left') { gravityArrows.left = null; gravityArrows.right = 'down'; }
        else { gravityArrows.right = null; gravityArrows.left = 'down'; }

        // Flip-flop which box rotates next shift
        nextRotatingBox = (nextRotatingBox === 'left') ? 'right' : 'left';
    }

    // 8. Reset shift counter for next round (5 in split, 10 in normal)
    const nextShift = (gameMode === 'split') ? 5 : 10;
    piecesUntilShift = nextShift;
    timerDisplay.innerText = nextShift;

    // 9. Downward gravity + match resolution
    await settleBoard();
    // Clear gravity arrows once everything has settled
    gravityArrows.left = null;
    gravityArrows.right = null;
}


// --- HARDWARE MANIPULATION LISTENERS ---
// --- COMPLETE SYSTEM HARDWARE INPUT KEYBOARD EVENT LISTENERS ---

// --- COMPLETE SYSTEM HARDWARE INPUT KEYBOARD EVENT LISTENERS ---

window.addEventListener('keydown', e => {
    // 1. ESCAPE KEY PAUSE INTERCEPTOR
    if (e.key === 'Escape') {
        if (gameState === 'playing' && !isCinematicActive) {
            isPaused = !isPaused;
            const pauseOverlay = document.getElementById('pause-overlay');
            if (pauseOverlay) {
                if (isPaused) {
                    pauseOverlay.classList.remove('hidden');
                } else {
                    pauseOverlay.classList.add('hidden');
                }
            }
        }
        return; // Halt logic bubble processing instantly
    }

    // 2. STATE GUARD SAFETY HOOKS
    // Freeze active game interactions if paused, rotating, settling, or during cinematics
    if (gameState !== 'playing' || isPaused || isCinematicActive) return;

    // Vs mode dispatches to its own input handler (per-player keys)
    if (gameMode === 'vs') {
        vsHandleKeyDown(e);
        return;
    }

    if (isRotating) return;

    const k = e.key.toLowerCase();
    keys[k] = true;

    // 3. ROTATION TRIGGERS (Z = Clockwise / X = Counter-Clockwise)
    if (k === 'z') rotatePair(-1);
    if (k === 'x') rotatePair(1);

    // 4. INSTANT HARD DROP (Spacebar)
    if (e.key === ' ') {
        e.preventDefault(); // Prevent standard page shifting down scrolling behavior
        while (currentPair) {
            // Continually cycle dropping cell-by-cell down until hitting a solid barrier
            if (!moveActive(0, 1)) break;
        }
    }
});

window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (gameMode === 'vs') { vsHandleKeyUp(e); return; }

    // Reset Delayed Auto-Shift (DAS) horizontal timers when releasing directional keys
    if (k === 'arrowleft' || k === 'arrowright') {
        dasTimer = 0;
    }
});


// --- CRITICAL BUTTON SETUP TRANSITIONS ---
function initMenuButtons() {
    // --- MAIN MENU INTERFACE DOM ELEMENT TARGETS ---
    const normalBtn = document.getElementById('normal-mode-btn');
    const splitBtn = document.getElementById('split-mode-btn');
    const menuBtn = document.getElementById('back-to-menu-btn');
    
    // --- PAUSE OVERLAY MENU INTERFACE DOM ELEMENT TARGETS ---
    const resumeBtn = document.getElementById('resume-game-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');

    // --- BIND CORE GAME MODE ENGINE SELECTIONS ---
    if (normalBtn) {
        normalBtn.onclick = () => startGame('normal');
    }
    if (splitBtn) {
        splitBtn.onclick = () => startGame('split');
    }

    // --- INJECT VS-MODE BUTTON + SUBMENU (HTML not editable, so build it here) ---
    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay && !document.getElementById('vs-mode-btn')) {
        const vsBtn = document.createElement('button');
        vsBtn.id = 'vs-mode-btn';
        vsBtn.innerText = 'VS MODE';
        // Mirror the styling of existing buttons by copying the class list
        if (splitBtn) vsBtn.className = splitBtn.className;
        else if (normalBtn) vsBtn.className = normalBtn.className;
        vsBtn.style.marginTop = '12px';
        // Insert near the other mode buttons
        const anchor = splitBtn || normalBtn;
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(vsBtn, anchor.nextSibling);
        else menuOverlay.appendChild(vsBtn);

        // Build sub-menu overlay
        const sub = document.createElement('div');
        sub.id = 'vs-submenu-overlay';
        sub.className = 'hidden';
        Object.assign(sub.style, {
            position: 'fixed', inset: '0', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', zIndex: '9999', gap: '18px',
            fontFamily: '"Fredoka One", cursive', color: 'white'
        });
        sub.innerHTML = `
            <h2 style="font-size:48px; color:#ff0055; text-shadow:0 0 20px rgba(255,0,85,0.7); margin:0;">VS MODE</h2>
            <p style="opacity:0.8; margin:0 0 12px;">Choose your opponent</p>
            <button id="vs-cpu-btn"></button>
            <div id="vs-difficulty-row" class="hidden" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:8px; max-width:520px;">
                <button id="vs-easy-btn"   style="padding:8px 18px; border-radius:8px; cursor:pointer; background:#1a4;  color:white; border:none; font-family:inherit; font-size:18px;">EASY</button>
                <button id="vs-med-btn"    style="padding:8px 18px; border-radius:8px; cursor:pointer; background:#c80;  color:white; border:none; font-family:inherit; font-size:18px;">MEDIUM</button>
                <button id="vs-hard-btn"   style="padding:8px 18px; border-radius:8px; cursor:pointer; background:#d24;  color:white; border:none; font-family:inherit; font-size:18px;">HARD</button>
                <button id="vs-master-btn" style="padding:8px 18px; border-radius:8px; cursor:pointer; background:linear-gradient(135deg,#a02,#400); color:white; border:1px solid #ff4477; font-family:inherit; font-size:18px; text-shadow:0 0 8px rgba(255,80,120,0.8);">MASTER</button>
            </div>
            <button id="vs-2p-btn"></button>
            <button id="vs-cancel-btn" style="margin-top:18px; background:transparent; color:#aaa; border:1px solid #555; padding:8px 18px; border-radius:8px; cursor:pointer;">Back</button>
            <div style="margin-top:24px; opacity:0.7; font-size:14px; max-width:520px; text-align:center; line-height:1.5;">
                <strong>P1:</strong> Arrows move, Z/X rotate, Space hard-drop &nbsp; • &nbsp;
                <strong>P2:</strong> A/D move, S soft-drop, W hard-drop, Q/E rotate
            </div>
        `;
        document.body.appendChild(sub);
        const cpuBtn = sub.querySelector('#vs-cpu-btn');
        const p2Btn = sub.querySelector('#vs-2p-btn');
        const cancelBtn = sub.querySelector('#vs-cancel-btn');
        const diffRow = sub.querySelector('#vs-difficulty-row');
        const styleLikeMain = (btn, label) => {
            if (anchor) btn.className = anchor.className;
            btn.innerText = label;
            btn.style.minWidth = '240px';
        };
        styleLikeMain(cpuBtn, 'VS CPU');
        styleLikeMain(p2Btn, 'LOCAL 2 PLAYER');
        cpuBtn.onclick = () => diffRow.classList.toggle('hidden');
        sub.querySelector('#vs-easy-btn').onclick   = () => startGame('vs', 'cpu', 'easy');
        sub.querySelector('#vs-med-btn').onclick    = () => startGame('vs', 'cpu', 'medium');
        sub.querySelector('#vs-hard-btn').onclick   = () => startGame('vs', 'cpu', 'hard');
        sub.querySelector('#vs-master-btn').onclick = () => startGame('vs', 'cpu', 'master');
        p2Btn.onclick = () => startGame('vs', 'human');
        cancelBtn.onclick = () => sub.classList.add('hidden');

        vsBtn.onclick = () => sub.classList.remove('hidden');
    }

    if (menuBtn) {
        menuBtn.onclick = backToMenu;
    }
    
    // --- BIND PAUSE VIEW NAVIGATION CONTROL MECHANISMS ---
    if (resumeBtn) {
        resumeBtn.onclick = () => {
            isPaused = false;
            const pauseOverlay = document.getElementById('pause-overlay');
            if (pauseOverlay) {
                pauseOverlay.classList.add('hidden');
            }
        };
    }
    if (exitGameBtn) {
        exitGameBtn.onclick = () => {
            isPaused = false;
            const pauseOverlay = document.getElementById('pause-overlay');
            if (pauseOverlay) {
                pauseOverlay.classList.add('hidden');
            }
            backToMenu(); // Gracefully teardown engine grids and return back to the home view
        };
    }
}

// --- AUTOMATIC KICKOFF COMPILATION ROUTINES ---
// Safe listener wrap guarantees elements are present in the DOM before assignment runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuButtons);
} else {
    initMenuButtons();
}


// Fire button mapping immediately. If script reaches here without crashing, buttons are active.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuButtons);
} else {
    initMenuButtons();
}

function update(time = 0) {
    const dt = time - lastTime;
    lastTime = time;

    // Safety Gate: If the menu is active or grid is uninitialized, clear screen and wait safely
    if (gameState === 'menu' || !grid || grid.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(update);
        return;
    }

    if (gameMode === 'vs') {
        if (gameState === 'playing' && !isPaused && !isCinematicActive) vsUpdate(dt);
        if (!isPaused && !isCinematicActive) {
            floatingTexts.forEach(t => t.update());
            floatingTexts = floatingTexts.filter(t => t.life > 0);
        }
        vsDraw();
        floatingTexts.forEach(t => t.draw());
        requestAnimationFrame(update);
        return;
    }

    if (gameState === 'playing' && !isPaused) {
        // --- FIXED SAFE DANGER HEIGHT DETECTOR ---
        let highestStack = 0;
        for (let y = 0; y < 3; y++) {
            // Only scan if this row physically exists in memory right now
            if (grid[y]) {
                // Dynamically read the actual length of the row array to prevent index crashes
                for (let x = 0; x < grid[y].length; x++) {
                    if (grid[y][x]) {
                        highestStack = Math.max(highestStack, 3 - y);
                    }
                }
            }
        }

        // Smoothly scale up danger trackers based on proximity to losing
        if (highestStack > 0) {
            dangerIntensity = Math.min(1.0, dangerIntensity + 0.05);
        } else {
            dangerIntensity = Math.max(0.0, dangerIntensity - 0.05);
        }

        // Calculate procedural high-frequency math canvas screen shake offsets
        if (dangerIntensity > 0) {
            dangerPulseTimer += dt * 0.008;
            const shakePower = dangerIntensity * 5;
            screenShakeX = (Math.random() - 0.5) * shakePower;
            screenShakeY = (Math.random() - 0.5) * shakePower;
        } else {
            screenShakeX = 0;
            screenShakeY = 0;
            dangerPulseTimer = 0;
        }

        // --- SMOOTH CANVAS ANIMATION MATRIX INTERPOLATION ---
        if (isRotating) {
            rotationTimer += dt;
            let progress = Math.min(1, rotationTimer / 800);
            let easeOutCubic = 1 - Math.pow(1 - progress, 3);
            leftRenderAngle = leftTargetAngle * easeOutCubic;
            rightRenderAngle = rightTargetAngle * easeOutCubic;
        }

        // Handle active pair control pacing blocks
        if (!isRotating && !isSettling && currentPair && !isCinematicActive) {
            if (keys['arrowleft'] || keys['arrowright']) {
                dasTimer += dt;
                if (dasTimer === dt) moveActive(keys['arrowleft'] ? -1 : 1, 0);
                else if (dasTimer > DAS_DELAY) { 
                    moveActive(keys['arrowleft'] ? -1 : 1, 0); 
                    dasTimer = DAS_DELAY - DAS_INTERVAL; 
                }
            }
            dropCounter += dt;
            if (dropCounter > (keys['arrowdown'] ? 60 : 800)) { 
                moveActive(0, 1); 
                dropCounter = 0; 
            }
        }
        
        // Safe loop across the matrix
        for (let y = 0; y < GRID_ROWS; y++) {
            if (grid[y]) {
                for (let x = 0; x < grid[y].length; x++) {
                    if (grid[y][x]) grid[y][x].update(dt);
                }
            }
        }
        if (currentPair) currentPair.puyos.forEach(p => p.update(dt));
    }

    // Texts decay normally only when unpaused and active
    if (!isPaused && !isCinematicActive) {
        floatingTexts.forEach(t => t.update());
        floatingTexts = floatingTexts.filter(t => t.life > 0);
        if (typeof window.__particlesUpdate === 'function') window.__particlesUpdate(dt);
    }
    
    draw();
    requestAnimationFrame(update);
}







function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState !== 'playing' && gameState !== 'gameover') return;
    
    const midX = canvas.width / 2;

    // FIXED: Safely unpacks standard grid items, clearing particles, and active pair arrays
    const getZone = (item) => {
        if (!item) return 'left';
        // If it's a standard Puyo block, check its direct x property
        if (item.x !== undefined) return (item.x < GRID_COLS / 2) ? 'left' : 'right';
        // If it's the active currentPair object, read the first puyo index in its collection array
        if (item.puyos && item.puyos[0] && item.puyos[0].x !== undefined) {
            return (item.puyos[0].x < GRID_COLS / 2) ? 'left' : 'right';
        }
        return 'left';
    };

    // Helper function to draw the structural game board outline and cell grid
    const drawBoardGrid = (startX, widthCols) => {
        ctx.save();
        
        // Draw solid board background panel
        ctx.fillStyle = "rgba(20, 20, 30, 0.85)";
        ctx.fillRect(startX * TILE, 0, widthCols * TILE, GRID_ROWS * TILE);

        // Draw inner subtle cell grid lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        for (let y = 0; y <= GRID_ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(startX * TILE, y * TILE);
            ctx.lineTo((startX + widthCols) * TILE, y * TILE);
            ctx.stroke();
        }
        for (let x = 0; x <= widthCols; x++) {
            ctx.beginPath();
            ctx.moveTo((startX + x) * TILE, 0);
            ctx.lineTo((startX + x) * TILE, GRID_ROWS * TILE);
            ctx.stroke();
        }

        // Apply a glowing crimson border if the player is reaching danger thresholds
        if (dangerIntensity > 0) {
            const alphaPulse = Math.abs(Math.sin(dangerPulseTimer)) * dangerIntensity;
            ctx.strokeStyle = `rgba(255, 0, 50, ${alphaPulse * 0.8 + 0.2})`;
            ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
            ctx.shadowBlur = dangerIntensity * 20;
            ctx.lineWidth = 4 + (dangerIntensity * 2);
        } else {
            ctx.strokeStyle = "#333344";
            ctx.lineWidth = 4;
        }
        ctx.strokeRect(startX * TILE, 0, widthCols * TILE, GRID_ROWS * TILE);
        ctx.restore();
    };

    // Draw a large background gravity arrow inside a board square
    const drawGravityArrow = (startX, widthCols, dir) => {
        if (!dir) return;
        const cx = (startX + widthCols / 2) * TILE;
        const cy = (GRID_ROWS / 2) * TILE;
        const size = Math.min(widthCols, GRID_ROWS) * TILE * 0.55;
        ctx.save();
        ctx.translate(cx, cy);
        if (dir === 'right') ctx.rotate(0);
        else if (dir === 'down') ctx.rotate(Math.PI / 2);
        else if (dir === 'left') ctx.rotate(Math.PI);
        else if (dir === 'up') ctx.rotate(-Math.PI / 2);
        // Pulsing alpha
        const pulse = 0.25 + Math.abs(Math.sin(Date.now() / 300)) * 0.25;
        ctx.fillStyle = `rgba(255, 220, 80, ${pulse})`;
        ctx.strokeStyle = `rgba(255, 220, 80, ${pulse + 0.2})`;
        ctx.lineWidth = 4;
        const s = size / 2;
        // Arrow pointing right (in local space): shaft + triangle head
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.25);
        ctx.lineTo(s * 0.2, -s * 0.25);
        ctx.lineTo(s * 0.2, -s * 0.6);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.2, s * 0.6);
        ctx.lineTo(s * 0.2, s * 0.25);
        ctx.lineTo(-s, s * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    };


    // --- MAIN RENDER DISPATCH CHANNELS ---
    ctx.save();
    // Apply global calculated structural camera screen shake displacements
    ctx.translate(screenShakeX, screenShakeY);

    if (gameMode === 'normal') {
        // --- NORMAL MODE: SPIN ENTIRE BOARD AND PIECES TOGETHER ---
        ctx.save();
        if (leftRenderAngle !== 0) {
            ctx.translate(250, 250); 
            ctx.rotate(leftRenderAngle);
            ctx.translate(-250, -250); 
        }
        
        drawBoardGrid(0, GRID_COLS);

        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < GRID_COLS; x++) {
                if (grid[y] && grid[y][x]) grid[y][x].draw();
            }
        }
        if (currentPair) currentPair.puyos.forEach(p => p.draw());
        clearingPuyos.forEach(p => p.draw());
        ctx.restore();
        
    } else {
        // --- SPLIT MODE: TWO SEPARATE SIDE-BY-SIDE SPINNING BOARDS ---
        
        // --- LEFT BOARD SQUARE (Center: 250, 250) ---
        ctx.save();
        ctx.translate(250, 250);
        ctx.rotate(leftRenderAngle);
        ctx.translate(-250, -250);
        
        drawBoardGrid(0, 10);
        drawGravityArrow(0, 10, gravityArrows.left);
        
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < 10; x++) {
                if (grid[y] && grid[y][x]) grid[y][x].draw();
            }
        }
        if (currentPair && getZone(currentPair) === 'left') currentPair.puyos.forEach(p => p.draw());
        clearingPuyos.filter(p => getZone(p) === 'left').forEach(p => p.draw());
        ctx.restore();

        // --- RIGHT BOARD SQUARE (Center: 750, 250) ---
        ctx.save();
        ctx.translate(750, 250);
        ctx.rotate(rightRenderAngle);
        ctx.translate(-750, -250);
        
        drawBoardGrid(10, 10);
        drawGravityArrow(10, 10, gravityArrows.right);
        
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 10; x < 20; x++) {
                if (grid[y] && grid[y][x]) grid[y][x].draw();
            }
        }
        if (currentPair && getZone(currentPair) === 'right') currentPair.puyos.forEach(p => p.draw());
        clearingPuyos.filter(p => getZone(p) === 'right').forEach(p => p.draw());
        ctx.restore();

        // Draw center divider seam overlay line between the two boards
        ctx.strokeStyle = "rgba(255, 0, 85, 0.6)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, canvas.height);
        ctx.stroke();
    }

    // Floating text items stay completely upright on screen for player legibility
    floatingTexts.forEach(t => t.draw());
    if (typeof window.__particlesDraw === 'function') window.__particlesDraw();
    ctx.restore(); 
}





function resetGame() {
    grid = Array(GRID_ROWS).fill().map(() => Array(GRID_COLS).fill(null));
    score = 0; 
    scoreDisplay.innerText = 0; 
    piecesUntilShift = 10; 
    timerDisplay.innerText = 10;
    quotaCount = 0; 
    quotaDisplay.innerText = 0; 
    floatingTexts = []; 
    clearingPuyos = [];
    spawnPair();
    isPaused = false;
    dangerIntensity = 0;
    screenShakeX = 0;
    screenShakeY = 0;
}

update();


// ============================================================================
// ============================ VS MODE MODULE ===============================
// ============================================================================
// Two independent 10x10 boards. Each player pops puyos -> attacks opponent.
// Pending trash sits above the opponent's columns (with count badges).
// When you lock your next piece and the resulting chain resolves:
//   1) your pops first CANCEL your incoming pending trash 1:1
//   2) if your pops fully cancel your pending -> "DEFLECTED!" (the cancelled
//      amount + any excess pops are sent to opponent's pending)
//   3) if your pops don't fully cancel, remaining pending trash falls on you
//   4) lose if a new piece can't spawn (top row blocked at spawn column)
// ============================================================================

const VS_BOARD_COLS = 10;
const VS_SPAWN_X = 4;

let vsPlayers = null;        // [player1, player2]
let vsOpponentType = 'cpu';  // 'cpu' | 'human'
let vsDifficulty = 'hard';   // 'easy' | 'medium' | 'hard'
let vsAiTimer = 0;
let vsAiPlan = null;
let vsWinner = null;

function vsMakePlayer(id, originX, controls, isCPU) {
    return {
        id,                                       // 0 or 1
        originX,                                  // grid X offset on the shared canvas (0 or 10)
        controls,                                 // key bindings object
        isCPU,
        grid: Array(GRID_ROWS).fill().map(() => Array(VS_BOARD_COLS).fill(null)),
        currentPair: null,
        isSettling: false,
        chainCount: 0,
        dropCounter: 0,
        dasTimer: 0,
        score: 0,
        pendingTrash: Array(VS_BOARD_COLS).fill(0), // trash queued above each column
        gameOver: false,
        // floating "DEFLECT!" texts for this player's side
    };
}

const VS_CONTROLS_P1 = {
    left: 'arrowleft', right: 'arrowright', down: 'arrowdown',
    rotCW: 'x', rotCCW: 'z', hardDrop: ' '
};
const VS_CONTROLS_P2 = {
    left: 'a', right: 'd', down: 's',
    rotCW: 'e', rotCCW: 'q', hardDrop: 'w'
};

function vsInit(opponentType, difficulty) {
    vsOpponentType = opponentType;
    vsDifficulty = difficulty || 'hard';
    vsWinner = null;
    vsAiTimer = 0;
    vsAiPlan = null;
    vsPlayers = [
        vsMakePlayer(0, 0, VS_CONTROLS_P1, false),
        vsMakePlayer(1, VS_BOARD_COLS, VS_CONTROLS_P2, opponentType === 'cpu')
    ];
    vsPlayers.forEach(p => vsSpawnFor(p));
}

function vsSpawnFor(p) {
    if (p.gameOver) return;
    // Lose check: spawn column blocked
    if (p.grid[0][VS_SPAWN_X] || p.grid[1][VS_SPAWN_X]) {
        p.gameOver = true;
        vsCheckWinner();
        return;
    }
    p.currentPair = {
        puyos: [new Puyo(VS_SPAWN_X, 1, randomColor()), new Puyo(VS_SPAWN_X, 0, randomColor())],
        rot: 0
    };
    p.chainCount = 0;
}

function vsCheckWinner() {
    if (vsWinner) return;
    const alive = vsPlayers.filter(p => !p.gameOver);
    if (alive.length === 1) {
        vsWinner = alive[0].id;
        const label = vsWinner === 0 ? 'PLAYER 1 WINS!' : (vsOpponentType === 'cpu' ? 'CPU WINS!' : 'PLAYER 2 WINS!');
        floatingTexts.push(new FloatingText(label, canvas.width / 2, canvas.height / 2, '#00FF88'));
        if (typeof onVsEnd === 'function') onVsEnd(vsWinner, vsOpponentType, vsDifficulty, vsPlayers);
        setTimeout(() => {
            gameState = 'gameover';
            const endScore = document.getElementById('end-score');
            if (endScore) endScore.innerText = label;
            const over = document.getElementById('game-over-overlay');
            if (over) over.classList.remove('hidden');
        }, 1500);
    } else if (alive.length === 0) {
        vsWinner = -1;
        setTimeout(() => {
            gameState = 'gameover';
            const endScore = document.getElementById('end-score');
            if (endScore) endScore.innerText = 'DRAW';
            const over = document.getElementById('game-over-overlay');
            if (over) over.classList.remove('hidden');
        }, 1500);
    }
}

function vsIsValid(p, x, y) {
    return x >= 0 && x < VS_BOARD_COLS && y < GRID_ROWS && (y < 0 || (p.grid[y] && !p.grid[y][x]));
}

function vsMove(p, dx, dy) {
    if (!p.currentPair || p.isSettling || p.gameOver) return false;
    if (p.currentPair.puyos.every(pu => vsIsValid(p, pu.x + dx, pu.y + dy))) {
        p.currentPair.puyos.forEach(pu => { pu.x += dx; pu.y += dy; });
        return true;
    } else if (dy > 0) {
        vsLock(p);
    }
    return false;
}

function vsRotate(p, dir) {
    if (!p.currentPair || p.isSettling || p.gameOver) return;
    const p1 = p.currentPair.puyos[0];
    const p2 = p.currentPair.puyos[1];
    if (!p1 || !p2) return;
    const nr = (p.currentPair.rot + dir + 4) % 4;
    let dx = 0, dy = 0;
    if (nr === 0) dy = -1; else if (nr === 1) dx = 1;
    else if (nr === 2) dy = 1; else if (nr === 3) dx = -1;
    if (vsIsValid(p, p1.x + dx, p1.y + dy)) {
        p2.x = p1.x + dx; p2.y = p1.y + dy; p.currentPair.rot = nr;
    } else {
        const kx = p1.x - dx;
        if (vsIsValid(p, kx, p1.y) && vsIsValid(p, kx + dx, p1.y + dy)) {
            p1.x = kx; p2.x = kx + dx; p2.y = p1.y + dy; p.currentPair.rot = nr;
        }
    }
}

function vsLock(p) {
    if (!p.currentPair) return;
    p.currentPair.puyos.forEach(pu => { if (pu.y >= 0) p.grid[pu.y][pu.x] = pu; });
    p.currentPair = null;
    vsSettle(p);
}

async function vsSettle(p) {
    p.isSettling = true;
    let dropped = true;
    while (dropped) {
        dropped = false;
        for (let x = 0; x < VS_BOARD_COLS; x++) {
            for (let y = GRID_ROWS - 2; y >= 0; y--) {
                if (p.grid[y][x] && !p.grid[y + 1][x]) {
                    p.grid[y + 1][x] = p.grid[y][x];
                    p.grid[y + 1][x].x = x;
                    p.grid[y + 1][x].y = y + 1;
                    p.grid[y][x] = null;
                    dropped = true;
                }
            }
        }
        if (dropped) await new Promise(r => setTimeout(r, 80));
    }

    // Count total pops across this entire chain
    const totalPopped = await vsResolveChains(p);

    // ---- Trash resolution: cancel incoming, deflect any excess to opponent ----
    const opp = vsPlayers[1 - p.id];
    const incoming = p.pendingTrash.reduce((a, b) => a + b, 0);
    let pops = totalPopped;

    if (pops > 0 && incoming > 0) {
        const cancelled = Math.min(pops, incoming);
        vsRemoveTrashFromQueue(p, cancelled);
        pops -= cancelled;
        if (pops >= 0 && cancelled === incoming) {
            // Fully cancelled -> DEFLECT all of it (plus excess) back at opponent
            const total = cancelled + pops;
            vsQueueTrash(opp, total);
            floatingTexts.push(new FloatingText(
                `DEFLECT! +${total}`,
                (p.originX + VS_BOARD_COLS / 2) * TILE,
                100,
                '#FFCC00'
            ));
            if (typeof onDeflect === 'function') onDeflect(total, p.id);
            pops = 0;
        }
    }

    // Any remaining pending trash now falls on this player
    const remaining = p.pendingTrash.reduce((a, b) => a + b, 0);
    if (remaining > 0) {
        await vsDropPendingTrash(p);
    }

    // Send any leftover pops to opponent as new pending trash
    if (pops > 0 && !opp.gameOver) {
        vsQueueTrash(opp, pops);
    }

    p.isSettling = false;
    vsSpawnFor(p);
}

async function vsResolveChains(p) {
    let total = 0;
    p.chainCount = 0;
    while (true) {
        const groups = [];
        const visited = new Set();
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < VS_BOARD_COLS; x++) {
                const cell = p.grid[y][x];
                if (!cell || cell.isTrash || visited.has(`${x},${y}`)) continue;
                const group = [];
                vsFindGroup(p, x, y, cell.color, group, visited);
                if (group.length >= 4) groups.push(group);
            }
        }
        if (groups.length === 0) break;

        p.chainCount++;
        const toClear = [].concat(...groups);
        // adjacent trash also clears
        const trashToClear = [];
        toClear.forEach(pu => {
            [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}].forEach(m => {
                const nx = pu.x + m.dx, ny = pu.y + m.dy;
                if (nx >= 0 && nx < VS_BOARD_COLS && ny >= 0 && ny < GRID_ROWS) {
                    const t = p.grid[ny][nx];
                    if (t && t.isTrash && !trashToClear.includes(t)) trashToClear.push(t);
                }
            });
        });
        const all = [...toClear, ...trashToClear];
        clearingPuyos.push(...all);
        if (p.chainCount > 1) {
            floatingTexts.push(new FloatingText(
                `CHAIN x${p.chainCount}`,
                (p.originX + VS_BOARD_COLS / 2) * TILE, 180, '#00FF88'
            ));
        }
        for (let i = 0; i < 6; i++) { all.forEach(pu => pu.scale += 0.1); await new Promise(r => setTimeout(r, 30)); }
        for (let i = 0; i < 6; i++) { all.forEach(pu => pu.scale -= 0.2); await new Promise(r => setTimeout(r, 30)); }
        all.forEach(pu => { if (p.grid[pu.y] && p.grid[pu.y][pu.x] === pu) p.grid[pu.y][pu.x] = null; });
        clearingPuyos = clearingPuyos.filter(pu => !all.includes(pu));

        total += toClear.length;
        p.score += toClear.length * 10 * p.chainCount;
        if (typeof onChainStep === 'function') onChainStep('vs', p.chainCount, toClear.length, p.id);
        if (p.id === 0) { score = p.score; scoreDisplay.innerText = score; }

        // gravity again after clear
        let dropped = true;
        while (dropped) {
            dropped = false;
            for (let x = 0; x < VS_BOARD_COLS; x++) {
                for (let y = GRID_ROWS - 2; y >= 0; y--) {
                    if (p.grid[y][x] && !p.grid[y + 1][x]) {
                        p.grid[y + 1][x] = p.grid[y][x];
                        p.grid[y + 1][x].x = x;
                        p.grid[y + 1][x].y = y + 1;
                        p.grid[y][x] = null;
                        dropped = true;
                    }
                }
            }
            if (dropped) await new Promise(r => setTimeout(r, 60));
        }
    }
    return total;
}

function vsFindGroup(p, x, y, color, group, visited) {
    const key = `${x},${y}`;
    if (x < 0 || x >= VS_BOARD_COLS || y < 0 || y >= GRID_ROWS) return;
    if (visited.has(key)) return;
    const c = p.grid[y][x];
    if (!c || c.isTrash || c.color !== color) return;
    visited.add(key);
    group.push(c);
    vsFindGroup(p, x + 1, y, color, group, visited);
    vsFindGroup(p, x - 1, y, color, group, visited);
    vsFindGroup(p, x, y + 1, color, group, visited);
    vsFindGroup(p, x, y - 1, color, group, visited);
}

function vsQueueTrash(target, amount) {
    if (amount <= 0 || target.gameOver) return;
    // Distribute round-robin starting at a random column
    let col = Math.floor(Math.random() * VS_BOARD_COLS);
    for (let i = 0; i < amount; i++) {
        target.pendingTrash[col]++;
        col = (col + 1) % VS_BOARD_COLS;
    }
}

function vsRemoveTrashFromQueue(target, amount) {
    let remaining = amount;
    while (remaining > 0) {
        // Find the largest column and pull one off
        let maxCol = -1, maxVal = 0;
        for (let c = 0; c < VS_BOARD_COLS; c++) {
            if (target.pendingTrash[c] > maxVal) { maxVal = target.pendingTrash[c]; maxCol = c; }
        }
        if (maxCol === -1) break;
        target.pendingTrash[maxCol]--;
        remaining--;
    }
}

async function vsDropPendingTrash(p) {
    for (let c = 0; c < VS_BOARD_COLS; c++) {
        const cnt = p.pendingTrash[c];
        if (!cnt) continue;
        for (let i = 0; i < cnt; i++) {
            // find lowest empty row
            let ty = GRID_ROWS - 1;
            while (ty >= 0 && p.grid[ty][c]) ty--;
            if (ty < 0) break;
            p.grid[ty][c] = new Puyo(c, ty, '#555566', true);
        }
        p.pendingTrash[c] = 0;
    }
    await new Promise(r => setTimeout(r, 120));
}

// ---------- Input ----------
function vsHandleKeyDown(e) {
    if (!vsPlayers) return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') e.preventDefault();

    vsPlayers.forEach(p => {
        if (p.isCPU || p.gameOver || p.isSettling || !p.currentPair) return;
        const c = p.controls;
        if (k === c.rotCCW) vsRotate(p, -1);
        else if (k === c.rotCW) vsRotate(p, 1);
        else if (k === c.hardDrop) { while (p.currentPair) { if (!vsMove(p, 0, 1)) break; } }
    });
}

function vsHandleKeyUp(e) {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (!vsPlayers) return;
    vsPlayers.forEach(p => {
        if (k === p.controls.left || k === p.controls.right) p.dasTimer = 0;
    });
}

// ---------- AI ----------
// Simulate placing the current pair at (col, rot) on a copy of the grid,
// resolve all chains, and score the resulting board. Returns null if illegal.
function vsAiSimulate(grid, c1, c2, col, rot, incomingTrash) {
    const COLS = VS_BOARD_COLS, ROWS = GRID_ROWS;
    const G = grid.map(row => row.map(cell => cell ? { c: cell.color, t: !!cell.isTrash } : null));

    if (rot === 0 || rot === 2) {
        if (col < 0 || col >= COLS) return null;
        let top = ROWS - 1;
        while (top >= 0 && G[top][col]) top--;
        if (top < 1) return null;
        const bottomColor = (rot === 0) ? c1 : c2;
        const topColor    = (rot === 0) ? c2 : c1;
        G[top][col]     = { c: bottomColor, t: false };
        G[top - 1][col] = { c: topColor,    t: false };
    } else {
        const x1 = col;
        const x2 = (rot === 1) ? col + 1 : col - 1;
        if (x1 < 0 || x1 >= COLS || x2 < 0 || x2 >= COLS) return null;
        let t1 = ROWS - 1; while (t1 >= 0 && G[t1][x1]) t1--;
        let t2 = ROWS - 1; while (t2 >= 0 && G[t2][x2]) t2--;
        if (t1 < 0 || t2 < 0) return null;
        G[t1][x1] = { c: c1, t: false };
        G[t2][x2] = { c: c2, t: false };
    }

    let chains = 0, popped = 0;
    while (true) {
        // gravity
        for (let x = 0; x < COLS; x++) {
            let wy = ROWS - 1;
            for (let y = ROWS - 1; y >= 0; y--) {
                if (G[y][x]) { const cc = G[y][x]; G[y][x] = null; G[wy][x] = cc; wy--; }
            }
        }
        // BFS groups (non-trash)
        const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        const groups = [];
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const cell = G[y][x];
            if (!cell || cell.t || visited[y][x]) continue;
            const stack = [[x, y]], g = [];
            while (stack.length) {
                const [cx, cy] = stack.pop();
                if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS || visited[cy][cx]) continue;
                const cc = G[cy][cx];
                if (!cc || cc.t || cc.c !== cell.c) continue;
                visited[cy][cx] = true;
                g.push([cx, cy]);
                stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
            }
            if (g.length >= 4) groups.push(g);
        }
        if (groups.length === 0) break;
        chains++;
        for (const g of groups) { popped += g.length; for (const [x, y] of g) G[y][x] = null; }
    }

    // Heuristics on resulting board
    const heights = [];
    let maxH = 0;
    for (let x = 0; x < COLS; x++) {
        let h = 0;
        for (let y = 0; y < ROWS; y++) if (G[y][x]) { h = ROWS - y; break; }
        heights.push(h);
        if (h > maxH) maxH = h;
    }
    const spawnBlocked = G[0][VS_SPAWN_X] || G[1][VS_SPAWN_X];
    const avg = heights.reduce((a, b) => a + b, 0) / COLS;
    const variance = heights.reduce((a, h) => a + (h - avg) * (h - avg), 0) / COLS;

    // Count same-color adjacencies to encourage building toward chains
    let adjacency = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const cell = G[y][x];
        if (!cell || cell.t) continue;
        const r = G[y][x + 1], d = (G[y + 1] ? G[y + 1][x] : null);
        if (r && !r.t && r.c === cell.c) adjacency++;
        if (d && !d.t && d.c === cell.c) adjacency++;
    }
    // Count "almost groups" (3-connected) — future chain seeds
    const v2 = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    let seeds = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const cell = G[y][x];
        if (!cell || cell.t || v2[y][x]) continue;
        const stack = [[x, y]], g = [];
        while (stack.length) {
            const [cx, cy] = stack.pop();
            if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS || v2[cy][cx]) continue;
            const cc = G[cy][cx];
            if (!cc || cc.t || cc.c !== cell.c) continue;
            v2[cy][cx] = true;
            g.push([cx, cy]);
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        if (g.length === 3) seeds++;
        else if (g.length === 2) seeds += 0.3;
    }

    let score = 0;
    score += chains * chains * 4000;     // strongly reward longer chains
    score += popped * 250;
    score += adjacency * 25;
    score += seeds * 80;
    score -= maxH * 35;
    score -= variance * 12;
    // Avoid burying the spawn column
    score -= heights[VS_SPAWN_X] * 40;
    if (spawnBlocked) score -= 200000;

    // Defensive: if trash is incoming, a placement that pops enough to deflect is huge
    if (incomingTrash > 0) {
        if (popped >= incomingTrash) score += 6000 + (popped - incomingTrash) * 100;
        else score += popped * 60; // every pop helps cancel
    }
    return score;
}

function vsAiPlanBest(p) {
    const c1 = p.currentPair.puyos[0].color;
    const c2 = p.currentPair.puyos[1].color;
    const incoming = p.pendingTrash.reduce((a, b) => a + b, 0);

    // EASY: random legal placement, ignore strategy entirely.
    if (vsDifficulty === 'easy') {
        const tries = [];
        for (let rot = 0; rot < 4; rot++) for (let col = 0; col < VS_BOARD_COLS; col++) {
            if (vsAiSimulate(p.grid, c1, c2, col, rot, 0) !== null) tries.push({ col, rot });
        }
        if (!tries.length) return { col: VS_SPAWN_X, rot: 0 };
        return tries[Math.floor(Math.random() * tries.length)];
    }

    let best = null;
    for (let rot = 0; rot < 4; rot++) {
        for (let col = 0; col < VS_BOARD_COLS; col++) {
            let s = vsAiSimulate(p.grid, c1, c2, col, rot, incoming);
            if (s === null) continue;
            // MEDIUM: only rewards immediate pops + flatness; ignores chains & seeds.
            if (vsDifficulty === 'medium') {
                s = s * 0.35 + (Math.random() - 0.5) * 600;
            } else if (vsDifficulty === 'hard') {
                // HARD: between medium and master — uses most of the score
                // but with noticeable noise so it occasionally misplays.
                s = s * 0.7 + (Math.random() - 0.5) * 250;
            }
            // MASTER: uses raw score s (no nerf).
            const jitter = Math.random() * 30;
            const sc = s + jitter;
            if (!best || sc > best.score) best = { col, rot, score: sc };
        }
    }
    return best || { col: VS_SPAWN_X, rot: 0 };
}

function vsAiTick(p, dt) {
    if (!p.currentPair || p.isSettling || p.gameOver) { vsAiPlan = null; return; }
    if (!vsAiPlan) vsAiPlan = vsAiPlanBest(p);

    // Difficulty changes reaction speed.
    const stepDelay = vsDifficulty === 'easy' ? 380 : vsDifficulty === 'medium' ? 230 : vsDifficulty === 'hard' ? 180 : 140;
    vsAiTimer += dt;
    if (vsAiTimer < stepDelay) return;
    vsAiTimer = 0;

    // EASY rotates rarely (skip ~60% of rotation steps).
    if (p.currentPair.rot !== vsAiPlan.rot) {
        if (vsDifficulty === 'easy' && Math.random() < 0.6) return;
        const diff = (vsAiPlan.rot - p.currentPair.rot + 4) % 4;
        vsRotate(p, diff <= 2 ? 1 : -1);
        return;
    }
    const cur = p.currentPair.puyos[0].x;
    if (cur < vsAiPlan.col) { vsMove(p, 1, 0); return; }
    if (cur > vsAiPlan.col) { vsMove(p, -1, 0); return; }
    while (p.currentPair) { if (!vsMove(p, 0, 1)) break; }
    vsAiPlan = null;
}

// ---------- Update ----------
function vsUpdate(dt) {
    if (!vsPlayers) return;
    vsPlayers.forEach(p => {
        // Animate puyos
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < VS_BOARD_COLS; x++) {
                if (p.grid[y][x]) p.grid[y][x].update(dt);
            }
        }
        if (p.currentPair) p.currentPair.puyos.forEach(pu => pu.update(dt));

        if (p.gameOver || p.isSettling || !p.currentPair) return;

        if (p.isCPU) {
            vsAiTick(p, dt);
            return;
        }

        // DAS for human players
        const c = p.controls;
        const lpressed = keys[c.left], rpressed = keys[c.right];
        if (lpressed || rpressed) {
            p.dasTimer += dt;
            if (p.dasTimer === dt) vsMove(p, lpressed ? -1 : 1, 0);
            else if (p.dasTimer > DAS_DELAY) { vsMove(p, lpressed ? -1 : 1, 0); p.dasTimer = DAS_DELAY - DAS_INTERVAL; }
        }
        p.dropCounter += dt;
        const fast = keys[c.down];
        if (p.dropCounter > (fast ? 60 : 800)) {
            vsMove(p, 0, 1);
            p.dropCounter = 0;
        }
    });
}

// ---------- Draw ----------
function vsDraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!vsPlayers) return;

    ctx.save();
    ctx.translate(screenShakeX, screenShakeY);

    vsPlayers.forEach(p => {
        const ox = p.originX * TILE;
        // Board background
        ctx.save();
        ctx.fillStyle = "rgba(20, 20, 30, 0.85)";
        ctx.fillRect(ox, 0, VS_BOARD_COLS * TILE, GRID_ROWS * TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let y = 0; y <= GRID_ROWS; y++) {
            ctx.beginPath(); ctx.moveTo(ox, y * TILE); ctx.lineTo(ox + VS_BOARD_COLS * TILE, y * TILE); ctx.stroke();
        }
        for (let x = 0; x <= VS_BOARD_COLS; x++) {
            ctx.beginPath(); ctx.moveTo(ox + x * TILE, 0); ctx.lineTo(ox + x * TILE, GRID_ROWS * TILE); ctx.stroke();
        }
        // Danger glow if stack near top
        let near = 0;
        for (let y = 0; y < 3; y++)
            for (let x = 0; x < VS_BOARD_COLS; x++) if (p.grid[y][x]) near = Math.max(near, 3 - y);
        if (near > 0 || p.gameOver) {
            const a = p.gameOver ? 0.9 : (0.3 + 0.5 * (near / 3));
            ctx.strokeStyle = `rgba(255, 0, 50, ${a})`;
            ctx.shadowColor = "rgba(255,0,0,0.8)";
            ctx.shadowBlur = 15;
            ctx.lineWidth = 5;
        } else {
            ctx.strokeStyle = "#333344";
            ctx.lineWidth = 4;
        }
        ctx.strokeRect(ox, 0, VS_BOARD_COLS * TILE, GRID_ROWS * TILE);
        ctx.restore();

        // Pending-trash indicators ABOVE the columns (small bar inside top of board)
        for (let c = 0; c < VS_BOARD_COLS; c++) {
            const n = p.pendingTrash[c];
            if (!n) continue;
            const cx = ox + (c + 0.5) * TILE;
            const cy = 14;
            // trash bubble icon
            ctx.save();
            ctx.fillStyle = '#555566';
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('X', cx, cy + 1);
            // count badge
            if (n > 1) {
                ctx.fillStyle = '#ff0055';
                ctx.beginPath(); ctx.arc(cx + 11, cy - 9, 8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px Arial';
                ctx.fillText(String(n), cx + 11, cy - 8);
            }
            ctx.restore();
        }

        // Draw puyos with origin offset (translate so per-board puyo coords map correctly)
        ctx.save();
        ctx.translate(ox, 0);
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < VS_BOARD_COLS; x++) {
                if (p.grid[y][x]) p.grid[y][x].draw();
            }
        }
        if (p.currentPair) p.currentPair.puyos.forEach(pu => pu.draw());
        ctx.restore();

        // Player label
        ctx.save();
        ctx.fillStyle = p.id === 0 ? '#00ff88' : (p.isCPU ? '#ff0055' : '#0099ff');
        ctx.font = 'bold 18px "Fredoka One", cursive';
        ctx.textAlign = 'center';
        ctx.fillText(
            p.id === 0 ? 'P1' : (p.isCPU ? 'CPU' : 'P2') + '  ' + p.score,
            ox + VS_BOARD_COLS * TILE / 2, GRID_ROWS * TILE - 8
        );
        ctx.restore();
    });

    // Draw clearing puyos that belong to either board (they're drawn in-place because their x is local 0-9, but stored separately)
    // Already drawn inside the per-board translate via animate scale; nothing more needed here.

    // Center divider
    const midX = canvas.width / 2;
    ctx.strokeStyle = "rgba(255, 0, 85, 0.7)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(midX, 0); ctx.lineTo(midX, canvas.height); ctx.stroke();

    ctx.restore();
}

// ============================================================
// META: High scores + Achievements (localStorage-backed)
// ============================================================
const META_HS_KEY = 'puyo.highscores.v1';   // { normal: [..], split: [..], vs: [..] }
const META_ACH_KEY = 'puyo.achievements.v1'; // { [id]: ISOString }
const ACHIEVEMENTS = [
    { id: 'first_pop',     name: 'First Blood',     desc: 'Pop your first group of 4.' },
    { id: 'chain_2',       name: 'Combo Starter',   desc: 'Trigger a 2-chain.' },
    { id: 'chain_4',       name: 'Chain Master',    desc: 'Trigger a 4-chain.' },
    { id: 'chain_6',       name: 'Sauce God',       desc: 'Trigger a 6-chain.' },
    { id: 'big_pop',       name: 'Decimator',       desc: 'Pop 12+ puyos in one clear.' },
    { id: 'score_5k',      name: 'Five-K Club',     desc: 'Reach 5,000 points in any mode.' },
    { id: 'score_25k',     name: 'High Roller',     desc: 'Reach 25,000 points in any mode.' },
    { id: 'splitter',      name: 'Wall Walker',     desc: 'Play a round of Split mode.' },
    { id: 'deflector',     name: 'Return to Sender',desc: 'Deflect trash back at your opponent.' },
    { id: 'beat_cpu_easy', name: 'CPU Crusher',     desc: 'Beat an Easy CPU.' },
    { id: 'beat_cpu_med',  name: 'Steady Hands',    desc: 'Beat a Medium CPU.' },
    { id: 'beat_cpu_hard', name: 'Top Player',      desc: 'Beat a Hard CPU.' },
    { id: 'beat_cpu_master', name: 'Grandmaster',   desc: 'Beat a Master CPU.' },
];

function metaLoadHS() {
    try { return JSON.parse(localStorage.getItem(META_HS_KEY)) || {}; } catch { return {}; }
}
function metaSaveHS(obj) {
    try { localStorage.setItem(META_HS_KEY, JSON.stringify(obj)); } catch {}
}
function metaLoadAch() {
    try { return JSON.parse(localStorage.getItem(META_ACH_KEY)) || {}; } catch { return {}; }
}
function metaSaveAch(obj) {
    try { localStorage.setItem(META_ACH_KEY, JSON.stringify(obj)); } catch {}
}
function recordHighScore(mode, value) {
    if (!value || value <= 0) return false;
    const all = metaLoadHS();
    const list = all[mode] || [];
    list.push({ score: value, date: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    all[mode] = list.slice(0, 5);
    metaSaveHS(all);
    const isTop = all[mode][0].score === value;
    refreshMetaPanel();
    return isTop;
}
function unlockAchievement(id) {
    const all = metaLoadAch();
    if (all[id]) return false;
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return false;
    all[id] = new Date().toISOString();
    metaSaveAch(all);
    floatingTexts.push(new FloatingText(`🏆 ${def.name}`, canvas.width / 2, 140, '#FFCC00'));
    refreshMetaPanel();
    return true;
}

// --- Run-scoped trackers ---
let runBestChain = 0;
let runBiggestClear = 0;

function onGameStarted(mode) {
    runBestChain = 0;
    runBiggestClear = 0;
    if (mode === 'split') unlockAchievement('splitter');
}
function onChainStep(mode, chainN, popsThisStep, _playerId) {
    if (popsThisStep >= 4) unlockAchievement('first_pop');
    if (popsThisStep > runBiggestClear) runBiggestClear = popsThisStep;
    if (popsThisStep >= 12) unlockAchievement('big_pop');
    if (chainN > runBestChain) runBestChain = chainN;
    if (chainN >= 2) unlockAchievement('chain_2');
    if (chainN >= 4) unlockAchievement('chain_4');
    if (chainN >= 6) unlockAchievement('chain_6');
}
function onDeflect(_amount, _playerId) {
    unlockAchievement('deflector');
}
function onGameOver(mode, finalScore) {
    if (mode === 'normal' || mode === 'split') recordHighScore(mode, finalScore);
    if (finalScore >= 5000) unlockAchievement('score_5k');
    if (finalScore >= 25000) unlockAchievement('score_25k');
}
function onVsEnd(winnerId, opponentType, difficulty, players) {
    if (winnerId === 0) {
        recordHighScore('vs', players[0].score);
        if (opponentType === 'cpu') {
            if (difficulty === 'easy')   unlockAchievement('beat_cpu_easy');
            if (difficulty === 'medium') unlockAchievement('beat_cpu_med');
            if (difficulty === 'hard')   unlockAchievement('beat_cpu_hard');
            if (difficulty === 'master') unlockAchievement('beat_cpu_master');
        }
    }
    if (players[0].score >= 5000) unlockAchievement('score_5k');
    if (players[0].score >= 25000) unlockAchievement('score_25k');
}

// --- DOM panel injected onto the main menu ---
function ensureMetaPanel() {
    if (document.getElementById('meta-panel')) return;
    const menuOverlay = document.getElementById('menu-overlay');
    if (!menuOverlay) return;

    const panel = document.createElement('div');
    panel.id = 'meta-panel';
    Object.assign(panel.style, {
        position: 'fixed', right: '20px', top: '20px', width: '320px',
        maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
        background: 'rgba(10,10,20,0.85)', border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '12px', padding: '14px 16px', color: '#fff',
        fontFamily: '"Fredoka One", "Trebuchet MS", sans-serif',
        boxShadow: '0 8px 30px rgba(0,0,0,0.6)', zIndex: '500',
    });
    document.body.appendChild(panel);

    // Hide/show panel with menu
    const sync = () => {
        const hidden = menuOverlay.classList.contains('hidden');
        panel.style.display = hidden ? 'none' : 'block';
    };
    new MutationObserver(sync).observe(menuOverlay, { attributes: true, attributeFilter: ['class'] });
    sync();
}

function refreshMetaPanel() {
    const panel = document.getElementById('meta-panel');
    if (!panel) return;
    const hs = metaLoadHS();
    const ach = metaLoadAch();
    const fmtList = (mode, label, color) => {
        const list = hs[mode] || [];
        const rows = list.length
            ? list.map((r, i) => `<li style="display:flex;justify-content:space-between;opacity:${1 - i*0.12}"><span>#${i+1}</span><span>${r.score}</span></li>`).join('')
            : `<li style="opacity:0.5">— no scores yet —</li>`;
        return `<div style="margin-bottom:10px">
            <div style="color:${color};font-size:18px;margin-bottom:4px">${label}</div>
            <ol style="list-style:none;padding:0;margin:0;font-size:14px;line-height:1.5">${rows}</ol>
        </div>`;
    };
    const achHTML = ACHIEVEMENTS.map(a => {
        const got = !!ach[a.id];
        return `<li style="display:flex;gap:8px;padding:4px 0;opacity:${got ? 1 : 0.4}">
            <span style="font-size:18px">${got ? '🏆' : '🔒'}</span>
            <span><div style="font-size:14px">${a.name}</div>
            <div style="font-size:11px;opacity:0.75">${a.desc}</div></span>
        </li>`;
    }).join('');
    const unlocked = Object.keys(ach).length;
    panel.innerHTML = `
        <div style="font-size:20px;color:#ff0055;margin-bottom:10px;text-align:center">HIGH SCORES</div>
        ${fmtList('normal','Normal','#00FF88')}
        ${fmtList('split','Split','#0099FF')}
        ${fmtList('vs','VS (P1)','#FFCC00')}
        <div style="font-size:20px;color:#ff0055;margin:14px 0 6px;text-align:center">ACHIEVEMENTS (${unlocked}/${ACHIEVEMENTS.length})</div>
        <ul style="list-style:none;padding:0;margin:0">${achHTML}</ul>
    `;
}

// Wire panel after DOM is ready
function initMetaUI() {
    ensureMetaPanel();
    refreshMetaPanel();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMetaUI);
else initMetaUI();
