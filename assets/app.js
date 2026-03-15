
const TILE_SIZE = 64;
const MAP_DEF = {
  tileSize: TILE_SIZE,
  legend: {
    R: { kind: 'road' },
    I: { kind: 'intersection' },
    S: { kind: 'sidewalk' },
    L: { kind: 'lawn' },
    D: { kind: 'driveway' },
    H: { kind: 'house', collides: true },
    X: { kind: 'hedge', collides: true },
  },
  rows: [
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
    'LLLLLDDDDSSSLLLLLDDDDSSSLLLLLDDDDLL',
    'LLLLLLLLLSSSLLLLLLLLLLSSSLLLLLLLLLL',
    'SSSSSSSSSSRSSSSSSSSSSSRSSSSSSSSSSSS',
    'RRRRRRRRRRIRRRRRRRRRRRIRRRRRRRRRRRR',
    'RRRRRRRRRRIRRRRRRRRRRRIRRRRRRRRRRRR',
    'SSSSSSSSSSRSSSSSSSSSSSRSSSSSSSSSSSS',
    'LLLLLLLLLSSSLLLLLLLLLLSSSLLLLLLLLLL',
    'LLLLLDDDDSSSLLLLLDDDDSSSLLLLLDDDDLL',
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
    'LLLLLLLLLSSSLLLLLLLLLLSSSLLLLLLLLLL',
    'SSSSSSSSSSRSSSSSSSSSSSRSSSSSSSSSSSS',
    'RRRRRRRRRRIRRRRRRRRRRRIRRRRRRRRRRRR',
    'RRRRRRRRRRIRRRRRRRRRRRIRRRRRRRRRRRR',
    'SSSSSSSSSSRSSSSSSSSSSSRSSSSSSSSSSSS',
    'LLLLLLLLLSSSLLLLLLLLLLSSSLLLLLLLLLL',
    'LLLLLDDDDSSSLLLLLDDDDSSSLLLLLDDDDLL',
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
    'LLLLLHHHHLLXLLLLLHHHHLLLLLHHHHLLLLL',
  ],
  playerSpawn: { x: 8.5, y: 5.5 },
};

const SURFACE = {
  road: { drag: 0.91, acceleration: 620, maxSpeed: 255 },
  intersection: { drag: 0.915, acceleration: 620, maxSpeed: 260 },
  sidewalk: { drag: 0.88, acceleration: 470, maxSpeed: 195 },
  lawn: { drag: 0.84, acceleration: 350, maxSpeed: 145 },
  driveway: { drag: 0.89, acceleration: 500, maxSpeed: 205 },
  house: { drag: 0.8, acceleration: 0, maxSpeed: 0 },
  hedge: { drag: 0.8, acceleration: 0, maxSpeed: 0 },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resize() {
  canvas.width = Math.floor(window.innerWidth * DPR);
  canvas.height = Math.floor(window.innerHeight * DPR);
}
window.addEventListener('resize', resize);
resize();

const imageCache = new Map();
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function length(x, y) { return Math.hypot(x, y); }
function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

class NeighborhoodMap {
  constructor(definition) {
    this.definition = definition;
    this.tileSize = definition.tileSize;
    this.width = definition.rows[0].length;
    this.height = definition.rows.length;
    this.worldWidth = this.width * this.tileSize;
    this.worldHeight = this.height * this.tileSize;
    this.collisionRects = [];
    this.houseSprites = [];
  }

  generateCollisionAndDecor() {
    const buildings = [
      'buildingTiles_030.png', 'buildingTiles_031.png', 'buildingTiles_032.png',
      'buildingTiles_033.png', 'buildingTiles_038.png', 'buildingTiles_039.png',
      'buildingTiles_022.png', 'buildingTiles_023.png'
    ];
    for (let row = 0; row < this.definition.rows.length; row += 1) {
      const rowStr = this.definition.rows[row];
      for (let col = 0; col < rowStr.length; col += 1) {
        const symbol = rowStr[col];
        const info = this.definition.legend[symbol];
        const x = col * this.tileSize;
        const y = row * this.tileSize;
        if (info.collides) {
          this.collisionRects.push({ x, y, w: this.tileSize, h: this.tileSize });
        }
        if (info.kind === 'house') {
          const filename = buildings[(col + row * 3) % buildings.length];
          this.houseSprites.push({ col, row, x, y, filename });
        }
      }
    }
  }

  getTileKindAt(x, y) {
    const col = clamp(Math.floor(x / this.tileSize), 0, this.width - 1);
    const row = clamp(Math.floor(y / this.tileSize), 0, this.height - 1);
    return this.definition.legend[this.definition.rows[row][col]].kind;
  }

  getSurfaceAt(x, y) { return SURFACE[this.getTileKindAt(x, y)]; }

  isBlockedAt(x, y) {
    return this.collisionRects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  async buildBackground() {
    this.generateCollisionAndDecor();
    const bg = document.createElement('canvas');
    bg.width = this.worldWidth;
    bg.height = this.worldHeight;
    const g = bg.getContext('2d');

    const roads = await loadImage('./assets/game/roadTextures_tilesheet.png');
    const drivewayTile = { sx: 128, sy: 0, sw: 128, sh: 128 };
    const roadTile = { sx: 384, sy: 0, sw: 128, sh: 128 };
    const sidewalkTile = { sx: 512, sy: 256, sw: 128, sh: 128 };
    const grassTile = { sx: 0, sy: 128, sw: 128, sh: 128 };

    const drawSlice = (slice, x, y, alpha = 1) => {
      g.save();
      g.globalAlpha = alpha;
      g.drawImage(roads, slice.sx, slice.sy, slice.sw, slice.sh, x, y, this.tileSize, this.tileSize);
      g.restore();
    };

    g.fillStyle = '#609552';
    g.fillRect(0, 0, bg.width, bg.height);

    for (let row = 0; row < this.definition.rows.length; row += 1) {
      const rowStr = this.definition.rows[row];
      for (let col = 0; col < rowStr.length; col += 1) {
        const symbol = rowStr[col];
        const kind = this.definition.legend[symbol].kind;
        const x = col * this.tileSize;
        const y = row * this.tileSize;

        if (kind === 'lawn' || kind === 'house' || kind === 'hedge') {
          drawSlice(grassTile, x, y, 0.18);
          g.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
          g.fillRect(x, y, this.tileSize, this.tileSize);
        }
        if (kind === 'sidewalk') {
          g.fillStyle = '#bdc4cb';
          g.fillRect(x, y, this.tileSize, this.tileSize);
          drawSlice(sidewalkTile, x, y, 0.32);
          g.strokeStyle = 'rgba(69,83,92,0.15)';
          g.strokeRect(x + 1, y + 1, this.tileSize - 2, this.tileSize - 2);
        }
        if (kind === 'driveway') {
          g.fillStyle = '#d5c4a2';
          g.fillRect(x, y, this.tileSize, this.tileSize);
          drawSlice(drivewayTile, x, y, 0.28);
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.fillRect(x + 7, y + 6, this.tileSize - 14, 6);
        }
        if (kind === 'road' || kind === 'intersection') {
          g.fillStyle = '#2c3238';
          g.fillRect(x, y, this.tileSize, this.tileSize);
          drawSlice(roadTile, x, y, 0.9);
          g.fillStyle = 'rgba(255,255,255,0.035)';
          g.fillRect(x, y, this.tileSize, this.tileSize / 2);
        }
        if (kind === 'hedge') {
          g.fillStyle = '#3f6f39';
          g.fillRect(x + 4, y + 18, this.tileSize - 8, this.tileSize - 36);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(x + 8, y + 22, this.tileSize - 16, 6);
        }
      }
    }

    // lane markers
    for (let row = 0; row < this.definition.rows.length; row += 1) {
      const rowStr = this.definition.rows[row];
      for (let col = 0; col < rowStr.length; col += 1) {
        const symbol = rowStr[col];
        const kind = this.definition.legend[symbol].kind;
        const x = col * this.tileSize;
        const y = row * this.tileSize;
        if (kind === 'road') {
          g.fillStyle = 'rgba(245, 218, 86, 0.72)';
          g.fillRect(x + 20, y + this.tileSize / 2 - 2, 16, 4);
        }
        if (kind === 'intersection') {
          g.strokeStyle = 'rgba(255,255,255,0.16)';
          g.lineWidth = 2;
          g.strokeRect(x + 8, y + 8, this.tileSize - 16, this.tileSize - 16);
        }
      }
    }

    // houses
    for (const house of this.houseSprites) {
      const img = await loadImage(`./assets/game/${house.filename}`);
      const drawW = 110;
      const drawH = 92;
      const x = house.x + this.tileSize / 2 - drawW / 2;
      const y = house.y + this.tileSize - drawH + 14;
      g.drawImage(img, x, y, drawW, drawH);
      g.fillStyle = 'rgba(0,0,0,0.13)';
      g.beginPath();
      g.ellipse(house.x + this.tileSize / 2, house.y + this.tileSize - 10, 38, 12, 0, 0, Math.PI * 2);
      g.fill();
    }

    this.background = bg;
  }

  draw(ctx, camera) {
    ctx.drawImage(this.background,
      camera.x, camera.y, camera.w, camera.h,
      0, 0, camera.screenW, camera.screenH);
  }
}

class Bike {
  constructor(map) {
    this.map = map;
    this.x = MAP_DEF.playerSpawn.x * TILE_SIZE;
    this.y = MAP_DEF.playerSpawn.y * TILE_SIZE;
    this.speed = 0;
    this.heading = 0;
    this.velocity = { x: 0, y: 0 };
    this.aimDirection = { x: 1, y: 0 };
    this.pedalingPhase = 0;
  }

  update(dt, input) {
    const turn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const accel = (input.up ? 1 : 0) + (input.down ? -0.65 : 0);
    const surface = this.map.getSurfaceAt(this.x, this.y);
    const maxSpeed = surface.maxSpeed;
    const acceleration = surface.acceleration;
    const turnRate = Math.PI * 0.95 * dt * clamp(Math.abs(this.speed) / 70 + 0.2, 0.25, 1.2);

    if (accel !== 0) this.speed += acceleration * accel * dt;
    else this.speed *= surface.drag;
    this.speed = clamp(this.speed, -maxSpeed * 0.45, maxSpeed);
    if (Math.abs(this.speed) < 4 && accel === 0) this.speed = 0;

    if (turn !== 0 && this.speed !== 0) {
      this.heading += turn * turnRate * clamp(Math.abs(this.speed) / Math.max(maxSpeed, 1), 0.35, 1);
    }

    this.aimDirection = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
    this.velocity = { x: this.aimDirection.x * this.speed, y: this.aimDirection.y * this.speed };

    const nextX = this.x + this.velocity.x * dt;
    const nextY = this.y + this.velocity.y * dt;
    if (this.map.isBlockedAt(nextX, this.y)) this.speed *= -0.18; else this.x = nextX;
    if (this.map.isBlockedAt(this.x, nextY)) this.speed *= -0.18; else this.y = nextY;

    this.pedalingPhase += dt * clamp(Math.abs(this.speed) * 0.09, 0, 16);
  }

  draw(ctx, camera) {
    const sx = (this.x - camera.x) * camera.scale;
    const sy = (this.y - camera.y) * camera.scale;
    const pedal = Math.sin(this.pedalingPhase) * 4;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.heading);
    ctx.scale(camera.scale, camera.scale);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // wheels
    ctx.fillStyle = '#1a232b';
    for (const wx of [-16, 16]) {
      ctx.beginPath();
      ctx.arc(wx, 6, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8796a4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // frame
    ctx.strokeStyle = '#b74a36';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, 6); ctx.lineTo(0, -2); ctx.lineTo(16, 6); ctx.lineTo(-2, 6); ctx.lineTo(-16, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(0, -16);
    ctx.stroke();

    // rider
    ctx.fillStyle = '#2b66d9';
    ctx.fillRect(-8, -26, 16, 18);
    ctx.fillStyle = '#f0d2b6';
    ctx.beginPath();
    ctx.arc(0, -31, 7, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#2f3b45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-3, -8); ctx.lineTo(-7, 2 + pedal);
    ctx.moveTo(3, -8); ctx.lineTo(7, 2 - pedal);
    ctx.stroke();

    // paper bag rear rack vibe
    ctx.fillStyle = '#f0cf86';
    ctx.fillRect(-23, -6, 8, 11);

    ctx.restore();
  }
}

class Newspaper {
  constructor(x, y, direction, inheritedVelocity) {
    this.x = x;
    this.y = y;
    this.vx = direction.x * 360 + inheritedVelocity.x * 0.45;
    this.vy = direction.y * 360 + inheritedVelocity.y * 0.45;
    this.height = 18;
    this.verticalVelocity = 190;
    this.rotation = 0;
    this.rotationSpeed = (7 + Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1);
    this.alive = true;
  }

  update(dt, map) {
    if (!this.alive) return false;
    const prevX = this.x;
    const prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.height += this.verticalVelocity * dt;
    this.verticalVelocity -= 620 * dt;

    if (this.x <= 0 || this.y <= 0 || this.x >= map.worldWidth || this.y >= map.worldHeight || map.isBlockedAt(this.x, this.y)) {
      this.x = prevX;
      this.y = prevY;
      this.vx *= 0.28;
      this.vy *= 0.28;
      this.verticalVelocity = 0;
      this.height = 0;
    }

    if (this.height <= 0) {
      this.height = 0;
      this.verticalVelocity = 0;
      this.vx *= 0.985;
      this.vy *= 0.985;
    }

    this.rotation += this.rotationSpeed * dt;
    if (Math.hypot(this.vx, this.vy) < 16 && this.height <= 0) {
      this.alive = false;
      return false;
    }
    return true;
  }

  draw(ctx, camera) {
    const sx = (this.x - camera.x) * camera.scale;
    const sy = (this.y - camera.y) * camera.scale;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(camera.scale, camera.scale);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 + this.height * 0.08, 5 + this.height * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -this.height);
    ctx.rotate(this.rotation);
    ctx.fillStyle = '#f8f8f2';
    ctx.fillRect(-9, -5, 18, 10);
    ctx.strokeStyle = '#d4d4cf';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-9, -5, 18, 10);
    ctx.fillStyle = '#9aa4ae';
    ctx.fillRect(-5, -2, 10, 1.5);
    ctx.fillRect(-5, 1, 10, 1.5);
    ctx.restore();
  }
}

const input = { up: false, down: false, left: false, right: false };
const pointers = { x: 0, y: 0 };
let throwQueued = false;
window.addEventListener('keydown', (e) => {
  if (['ArrowUp','KeyW'].includes(e.code)) input.up = true;
  if (['ArrowDown','KeyS'].includes(e.code)) input.down = true;
  if (['ArrowLeft','KeyA'].includes(e.code)) input.left = true;
  if (['ArrowRight','KeyD'].includes(e.code)) input.right = true;
  if (e.code === 'Space') throwQueued = true;
});
window.addEventListener('keyup', (e) => {
  if (['ArrowUp','KeyW'].includes(e.code)) input.up = false;
  if (['ArrowDown','KeyS'].includes(e.code)) input.down = false;
  if (['ArrowLeft','KeyA'].includes(e.code)) input.left = false;
  if (['ArrowRight','KeyD'].includes(e.code)) input.right = false;
});
canvas.addEventListener('pointerdown', (e) => {
  pointers.x = e.clientX;
  pointers.y = e.clientY;
  throwQueued = true;
});
canvas.addEventListener('pointermove', (e) => {
  pointers.x = e.clientX;
  pointers.y = e.clientY;
});

async function main() {
  const map = new NeighborhoodMap(MAP_DEF);
  await map.buildBackground();
  const bike = new Bike(map);
  const papers = [];
  const camera = { x: 0, y: 0, w: 0, h: 0, scale: DPR, screenW: canvas.width, screenH: canvas.height };
  let cooldownMs = 0;
  let last = performance.now();

  function updateCamera() {
    camera.screenW = canvas.width;
    camera.screenH = canvas.height;
    camera.scale = DPR;
    camera.w = camera.screenW / camera.scale;
    camera.h = camera.screenH / camera.scale;
    const targetX = bike.x - camera.w / 2;
    const targetY = bike.y - camera.h / 2;
    camera.x = clamp(lerp(camera.x, targetX, 0.08), 0, map.worldWidth - camera.w);
    camera.y = clamp(lerp(camera.y, targetY, 0.08), 0, map.worldHeight - camera.h);
  }

  function tryThrow() {
    if (cooldownMs > 0) return;
    cooldownMs = 180;
    const worldX = camera.x + pointers.x * DPR / camera.scale;
    const worldY = camera.y + pointers.y * DPR / camera.scale;
    let dx = worldX - bike.x;
    let dy = worldY - bike.y;
    if (dx * dx + dy * dy < 10) ({ x: dx, y: dy } = bike.aimDirection);
    const dir = normalize(dx, dy);
    const spawnX = bike.x + dir.x * 28;
    const spawnY = bike.y + dir.y * 28;
    papers.push(new Newspaper(spawnX, spawnY, dir, bike.velocity));
  }

  function drawHud() {
    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.fillStyle = 'rgba(10, 14, 19, 0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, window.innerHeight - 54, 240, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eef2f7';
    ctx.font = '12px Inter, Arial, sans-serif';
    ctx.fillText(`Surface: ${map.getTileKindAt(bike.x, bike.y)}`, 28, window.innerHeight - 31);
    ctx.fillText(`Speed: ${Math.round(Math.abs(bike.speed))}`, 132, window.innerHeight - 31);
    ctx.fillText(`Papers: ${papers.length}`, 196, window.innerHeight - 31);
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    cooldownMs = Math.max(0, cooldownMs - dt * 1000);
    bike.update(dt, input);
    if (throwQueued) {
      tryThrow();
      throwQueued = false;
    }
    for (let i = papers.length - 1; i >= 0; i -= 1) {
      if (!papers[i].update(dt, map)) papers.splice(i, 1);
    }
    updateCamera();

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    map.draw(ctx, camera);

    // draw projectiles before bike when behind
    for (const paper of papers) paper.draw(ctx, camera);
    bike.draw(ctx, camera);
    drawHud();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:white;background:#11161d;padding:24px;text-align:center';
  d.innerHTML = `<div><h2>Unable to load game assets.</h2><p>${String(err)}</p></div>`;
  document.body.appendChild(d);
});
