export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function steering(x, center, sensitivity) {
  const d = (x - center) * sensitivity;
  return Math.abs(d) < 0.055
    ? 0
    : clamp((d - Math.sign(d) * 0.055) / 0.945, -1, 1);
}

export const LOCATIONS = [
  { name: 'Ночной город', sky: ['#081126', '#354260'], ground: '#15272e', road: ['#293342', '#333e4d'], edge: '#72cfc2', kind: 'city' },
  { name: 'Пустынный каньон', sky: ['#361a35', '#f19b68'], ground: '#a65e43', road: ['#483d43', '#57464a'], edge: '#f6bd75', kind: 'canyon' },
  { name: 'Сосновый лес', sky: ['#071c29', '#567d76'], ground: '#183d36', road: ['#273a3b', '#304543'], edge: '#a7c96c', kind: 'forest' },
  { name: 'Снежные горы', sky: ['#162844', '#c5dcef'], ground: '#c8d7df', road: ['#3d4a58', '#465563'], edge: '#f2fbff', kind: 'snow' },
  { name: 'Тихоокеанское шоссе', sky: ['#17436a', '#ffb879'], ground: '#2d806f', road: ['#3c4851', '#48555d'], edge: '#f5d17d', kind: 'coast' },
  { name: 'Неоновый мегаполис', sky: ['#160d35', '#6b2f7e'], ground: '#211438', road: ['#25213c', '#302746'], edge: '#ff55d8', kind: 'neon' }
];

const LANES = [-0.66, 0, 0.66];
const CAR_GAP = 19;

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Race {
  constructor() {
    this.reset();
  }

  reset() {
    Object.assign(this, {
      state: 'ready',
      x: 0,
      speed: 0,
      distance: 0,
      score: 0,
      lives: 3,
      traffic: [],
      bonuses: [],
      events: [],
      spawn: 1.5,
      bonusSpawn: 1.7,
      invincible: 0,
      route: shuffled(LOCATIONS),
      locationIndex: 0
    });
  }

  get currentLocation() {
    return this.route[this.locationIndex % this.route.length];
  }

  start() {
    if (['ready', 'over'].includes(this.state)) this.reset();
    this.state = 'running';
  }

  update(dt, controls = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0 && this.state === 'running') {
      const step = Math.min(remaining, 1 / 120);
      this.step(step, controls);
      remaining -= step;
    }
  }

  step(dt, {
    turn = 0,
    gas = false,
    brake = false,
    targetSpeed = null
  } = {}) {
    const oldSpeed = this.speed;
    if (Number.isFinite(targetSpeed)) {
      const wanted = clamp(targetSpeed, 0, 180);
      this.speed += clamp(wanted - this.speed, -220 * dt, 75 * dt);
    } else {
      const acceleration = brake ? -220 : gas ? 75 : -25;
      this.speed = clamp(this.speed + acceleration * dt, 0, 180);
    }

    const steeringPower = (0.55 + this.speed / 110) * Math.min(1, this.speed / 15);
    this.x = clamp(this.x + clamp(turn, -1, 1) * steeringPower * dt, -1.12, 1.12);
    if (Math.abs(this.x) > 1) this.speed = Math.min(this.speed, 45);

    const travel = (oldSpeed + this.speed) / 2 / 3.6 * dt;
    this.distance += travel;
    this.invincible = Math.max(0, this.invincible - dt);

    const nextLocation = Math.floor(this.distance / 900) % this.route.length;
    if (nextLocation !== this.locationIndex) {
      this.locationIndex = nextLocation;
      this.events.push({ type: 'location', text: this.currentLocation.name });
    }

    this.spawn -= travel / 35;
    if (this.spawn <= 0) this.spawnTraffic();

    this.bonusSpawn -= travel / 105;
    if (this.bonusSpawn <= 0) this.spawnBonus();

    for (const car of this.traffic) {
      const oldZ = car.z;
      car.z += (car.speed ?? 65) / 3.6 * dt - travel;
      const overlap = Math.min(oldZ, car.z) <= 3 && Math.max(oldZ, car.z) >= -2;
      if (!car.hit && overlap && Math.abs(car.x - this.x) < 0.30 && this.invincible === 0) {
        car.hit = true;
        this.lives = Math.max(0, this.lives - 1);
        this.speed *= 0.35;
        this.invincible = 1.5;
        if (this.lives === 0) {
          this.state = 'over';
          break;
        }
      }
    }

    // Keep vehicles in the same lane from passing through one another.
    const byLane = new Map();
    for (const car of this.traffic) {
      const lane = Math.round((car.x + 0.66) / 0.66);
      if (!byLane.has(lane)) byLane.set(lane, []);
      byLane.get(lane).push(car);
    }
    for (const cars of byLane.values()) {
      cars.sort((a, b) => a.z - b.z);
      for (let i = 1; i < cars.length; i++) {
        const near = cars[i - 1];
        const far = cars[i];
        if (far.z - near.z < CAR_GAP) {
          far.z = near.z + CAR_GAP;
          far.speed = Math.min(far.speed, near.speed);
        }
      }
    }
    this.traffic = this.traffic.filter(car => car.z > -15 && car.z < 240);

    for (const item of this.bonuses) {
      const oldZ = item.z;
      item.z -= travel;
      const collected = Math.min(oldZ, item.z) <= 3 && Math.max(oldZ, item.z) >= -2;
      if (!item.collected && collected && Math.abs(item.x - this.x) < 0.36) {
        item.collected = true;
        if (item.kind === 'boost') this.speed = Math.min(180, this.speed + 28);
        if (item.kind === 'shield') this.invincible = Math.max(this.invincible, 5);
        if (item.kind === 'star') this.score += 100;
        this.events.push({ type: 'bonus', kind: item.kind, text: item.label });
      }
    }
    this.bonuses = this.bonuses.filter(item => !item.collected && item.z > -12 && item.z < 220);
  }

  spawnTraffic() {
    const lanes = shuffled(LANES);
    const lane = lanes.find(x => !this.traffic.some(car => Math.abs(car.x - x) < 0.2 && Math.abs(car.z - 160) < CAR_GAP + 4));
    this.spawn = 1.7 + Math.random() * 0.9;
    if (lane === undefined || this.traffic.length >= 10) return;

    this.traffic.push({
      x: lane,
      z: 160,
      speed: 48 + Math.random() * 47,
      hit: false,
      style: ['sport', 'coupe', 'suv'][Math.floor(Math.random() * 3)],
      color: ['#fd788f', '#a99bff', '#f4c86e', '#75d8c2', '#f2f4f7'][Math.floor(Math.random() * 5)]
    });
  }

  spawnBonus() {
    const kind = ['star', 'boost', 'shield'][Math.floor(Math.random() * 3)];
    const labels = { star: '+100 очков', boost: 'Ускорение', shield: 'Защита' };
    this.bonuses.push({ kind, label: labels[kind], x: LANES[Math.floor(Math.random() * LANES.length)], z: 150, collected: false });
    this.bonusSpawn = 0.95 + Math.random() * 0.55;
  }
}
