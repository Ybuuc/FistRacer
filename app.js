import {installVoice} from './voice.mjs';
import {RaceAudio} from './audio.mjs';
import {Race,clamp,steering} from './core.mjs';
// Высота руки и выбранная скорость.
let handY = 0.5;
let targetSpeed = 0;

function speedFromHand(y) {
  // Верхняя рабочая граница — 28% высоты кадра.
  // Нижняя — 72%. Ниже неё задаётся полная остановка.
  const position = Math.max(0, Math.min(1, (0.72 - y) / 0.44));

  // Шаг 5 км/ч уменьшает дрожание выбранной скорости.
  return Math.round(position * 180 / 5) * 5;
}
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),video=$('video'),hc=$('hand').getContext('2d'),race=new Race(),keys=new Set();
let mode='keyboard',stream=null,recognizer=null,loading=false,lastFrame=-1,lastDetect=0,lastSeen=-Infinity,gesture='',handX=.5,center=.5,turn=0,victorySince=0,victoryLatched=false,previous=performance.now(),w=900,h=650;
const sound=new RaceAudio(); let brakingNow=false;
const testSoundButton = document.createElement('button');
testSoundButton.textContent = 'Проверить звук';
testSoundButton.style.cssText = 'width:100%;margin-top:10px';

const audioStatus = document.createElement('p');
audioStatus.style.cssText =
  'font-size:12px;line-height:1.4;overflow-wrap:anywhere';
audioStatus.setAttribute('role', 'status');

$('mute').after(testSoundButton, audioStatus);

testSoundButton.onclick = async () => {
  testSoundButton.disabled = true;
  audioStatus.textContent = 'Включаю звук…';

  try {
    // Проверка явно включает звук на умеренной громкости.
    sound.muted = false;
    sound.setVolume(0.4);

    $('volume').value = '0.4';
    $('mute').textContent = 'Звук: вкл';
    $('mute').setAttribute('aria-pressed', 'false');
    await sound.unlock();

    if (sound.ctx?.state !== 'running') {
      throw new Error(
        `Аудио не запустилось. Состояние: ${
          sound.ctx?.state ?? 'AudioContext не создан'
        }`
      );
    }

    // Проверяем тот же звуковой тракт, что используется игрой.
    sound.cue('start');

    audioStatus.textContent =
      'Аудио запущено. Должны прозвучать три коротких сигнала.';
  } catch (error) {
    audioStatus.textContent = error.message;
    console.error(error);
  } finally {
    testSoundButton.disabled = false;
  }
};
const unlockSound=()=>sound.unlock();
document.addEventListener('pointerdown',unlockSound);document.addEventListener('keydown',unlockSound);
$('volume').oninput=e=>sound.setVolume(e.target.value);
$('mute').onclick=()=>{const muted=sound.toggle();$('mute').textContent=muted?'Звук: выкл':'Звук: вкл';$('mute').setAttribute('aria-pressed',String(muted))};
const names={Closed_Fist:'✊ Кулак — газ и руль',Open_Palm:'✋ Ладонь — тормоз',Victory:'✌️ Удерживай для старта'};
function overlay(title,message){$('title').textContent=title;$('message').textContent=message;$('overlay').classList.remove('hidden')}
function pause(
  message = 'Нажми Enter или покажи ✌️, чтобы продолжить.'
) {
  keys.clear();
  voiceSpeed = null;
  turn = 0;

  if (race.state === 'running') {
    race.state = 'paused';
    sound.update(0, false, false, false);
    overlay('Пауза', message);
  }
}
function start() {
  if (document.hidden || !document.hasFocus()) return;
  if (race.state === 'running') return;

  if (
    mode === 'camera' &&
    (!stream || performance.now() - lastSeen > 600)
  ) {
    $('status').textContent =
      'Включи камеру и покажи руку перед стартом.';
    return;
  }
  keys.clear();
  turn = 0;
  targetSpeed = 0;
  voiceSpeed = null;
  previous = performance.now();

  race.start();
  sound.cue('start');
  $('overlay').classList.add('hidden');
}
$('start').onclick=start;$('pause').onclick=()=>pause();
$('mode').onchange=()=>{mode=$('mode').value;keys.clear();turn=0;pause('Режим изменён. Нажми старт, когда будешь готов.')};
$('center').onclick=()=>{if(stream&&performance.now()-lastSeen<600){center=handX;$('status').textContent='Центр сохранён. Теперь перемещай кулак относительно этой точки.'}else $('status').textContent='Сначала покажи руку в камеру.'};
window.addEventListener('keydown', e => {
  // Пауза работает даже при фокусе на настройках.
  if (e.code === 'Escape') {
    pause();
    return;
  }

  const tag = e.target.tagName;

  // Не мешаем изменять настройки клавиатурой.
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

  // Сохраняем стандартное нажатие кнопок.
  if (tag === 'BUTTON' && ['Enter', 'Space'].includes(e.code)) {
    return;
  }

  if (
    ['ArrowLeft', 'ArrowRight', 'ArrowUp',
     'ArrowDown', 'Space', 'Enter'].includes(e.code)
  ) {
    e.preventDefault();
  }

  keys.add(e.code);

  if (e.code === 'Enter' && !e.repeat) {
    start();
  }
});
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;gesture='';lastSeen=-Infinity;victorySince=0;victoryLatched=false;hc.clearRect(0,0,640,480);$('hold').style.width='0%';$('cameraButton').textContent='Включить камеру';pause('Камера выключена. Включи её или выбери клавиатуру.')}
$('cameraButton').onclick=async()=>{if(loading)return;if(stream){stopCamera();$('status').textContent='Камера выключена.';return}loading=true;$('cameraButton').disabled=true;
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Для камеры открой игру по HTTPS или через localhost.');$('status').textContent='Разреши доступ к камере…';stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});video.srcObject=stream;await video.play();$('status').textContent='Загрузка модели жестов… Это может занять минуту.';
 if(!recognizer){const {GestureRecognizer,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');recognizer=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6})}
 mode='camera';$('mode').value=mode;pause('Камера готова. Покажи ✌️ на одну секунду.');lastFrame=-1;lastSeen=-Infinity;$('cameraButton').textContent='Выключить камеру';$('status').textContent='Покажи одну руку целиком. ✌️ — старт.';stream.getVideoTracks()[0].addEventListener('ended',()=>{if(stream){stopCamera();$('status').textContent='Камера отключилась. Подключи её снова.'}});
 }catch(e){stopCamera();const errors={NotAllowedError:'Нет доступа к камере. Разреши камеру в настройках сайта.',NotFoundError:'Камера не найдена.',NotReadableError:'Камера занята. Закрой приложения, использующие её.'};$('status').textContent=errors[e.name]||`Не удалось включить распознавание. Проверь интернет и запуск через localhost. ${e.message}`;console.error(e)}finally{loading=false;$('cameraButton').disabled=false}};
const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function detect(now){if(!stream||!recognizer||loading||video.readyState<2||now-lastDetect<66||video.currentTime===lastFrame)return;lastFrame=video.currentTime;lastDetect=now;
 try{const r=recognizer.recognizeForVideo(video,now);hc.clearRect(0,0,640,480);const l=r.landmarks?.[0];if(l){lastSeen=now;handX=1-[0,5,9,13,17].reduce((s,i)=>s+l[i].x,0)/5;
  handY = [0, 5, 9, 13, 17].reduce(
  (sum, index) => sum + l[index].y, 0 ) / 5;
  const g=r.gestures?.[0]?.[0];gesture=g&&g.score>.55?g.categoryName:'';hc.strokeStyle='#89f1cf';hc.lineWidth=3;for(const [a,b]of edges){hc.beginPath();hc.moveTo((1-l[a].x)*640,l[a].y*480);hc.lineTo((1-l[b].x)*640,l[b].y*480);hc.stroke()}for(const p of l){hc.beginPath();hc.arc((1-p.x)*640,p.y*480,4,0,Math.PI*2);hc.fillStyle='#fff';hc.fill()}$('status').textContent=(names[gesture]||'Жест не распознан — плавное торможение')+(g?` · ${Math.round(g.score*100)}%`:'');}else{gesture='';$('status').textContent='Рука не видна. Покажи её целиком перед камерой.'}
 if (
  gesture === 'Victory' &&
  mode === 'camera' &&
  !document.hidden &&
  document.hasFocus()
) {if(!victorySince)victorySince=now;const progress=clamp((now-victorySince)/1000,0,1);$('hold').style.width=progress*100+'%';if(progress===1&&!victoryLatched){victoryLatched=true;if(race.state!=='running')start()}}else{victorySince=0;victoryLatched=false;$('hold').style.width='0%'}
 }catch(e){stopCamera();$('status').textContent='Ошибка распознавания. Попробуй снова включить камеру.';console.error(e)}}
function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill()}
// Перспектива из салона автомобиля.
function project(z, x) {
  const depth = Math.max(0, z);
  const scale = 9 / (depth + 9);
  const horizon = h * 0.34;
  const bendAt = distance =>
    0.55 * Math.sin(distance / 190) + 0.24 * Math.sin(distance / 76);
  const bend = bendAt(race.distance + depth * 1.25) - bendAt(race.distance);

  return {
    x: w / 2 + (bend + x - race.x) * w * 0.7 * scale,
    y: horizon + (h - horizon) * scale,
    s: scale
  };
}

// Другие автомобили: вид сзади.
function car(x, y, scale, color, style = 'coupe') {
  const cw = w * 0.23 * scale;
  const ch = cw * (style === 'suv' ? 0.85 : 0.65);

  ctx.save();
  ctx.translate(x, y);

  function box(x, y, width, height, radius, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  // Тень на асфальте.
  ctx.fillStyle = '#0008';
  ctx.beginPath();
  ctx.ellipse(0, 2, cw * 0.61, ch * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Задние колёса.
  box(-cw * 0.48, -ch * 0.35, cw * 0.18, ch * 0.4, 3, '#090c12');
  box(cw * 0.30, -ch * 0.35, cw * 0.18, ch * 0.4, 3, '#090c12');

  // Крыша и стойки.
  polygon([
    [-cw * 0.46, -ch * 0.48],
    [-cw * 0.32, -ch],
    [cw * 0.32, -ch],
    [cw * 0.46, -ch * 0.48]
  ], color);

  const glass = ctx.createLinearGradient(0, -ch, 0, -ch * 0.45);
  glass.addColorStop(0, '#7193ad');
  glass.addColorStop(1, '#101d30');

  polygon([
    [-cw * 0.33, -ch * 0.56],
    [-cw * 0.26, -ch * 0.90],
    [cw * 0.26, -ch * 0.90],
    [cw * 0.33, -ch * 0.56]
  ], glass);

  // Отражение на заднем стекле.
  polygon([
    [-cw * 0.24, -ch * 0.87],
    [cw * 0.17, -ch * 0.87],
    [cw * 0.08, -ch * 0.79],
    [-cw * 0.26, -ch * 0.79]
  ], '#d4f1ff33');

  // Задняя часть кузова.
  box(-cw * 0.5, -ch * 0.52, cw, ch * 0.48, cw * 0.07, color);

  const shade = ctx.createLinearGradient(0, -ch * 0.5, 0, 0);
  shade.addColorStop(0, '#ffffff22');
  shade.addColorStop(1, '#0009');
  box(-cw * 0.5, -ch * 0.52, cw, ch * 0.48, cw * 0.07, shade);

  // Бампер.
  box(-cw * 0.46, -ch * 0.15, cw * 0.92, ch * 0.12, 2, '#15202d');

  // Задние фонари.
  ctx.shadowColor = '#ff304d';
  ctx.shadowBlur = Math.max(2, 14 * scale);
  box(-cw * 0.43, -ch * 0.41, cw * 0.25, ch * 0.11, 2, '#ff425c');
  box(cw * 0.18, -ch * 0.41, cw * 0.25, ch * 0.11, 2, '#ff425c');
  ctx.shadowBlur = 0;

  // Номер и выхлоп.
  box(-cw * 0.13, -ch * 0.26, cw * 0.26, ch * 0.1, 1, '#dae2e8');
  box(cw * 0.28, -ch * 0.08, cw * 0.1, ch * 0.05, 1, '#8293a5');

  if (style === 'sport') {
    box(-cw * 0.46, -ch * 0.58, cw * 0.92, ch * 0.06, 2, '#15202d');
  }

  ctx.restore();
}

function drawScenery(horizon, theme) {
  const kind = theme.kind;
  if (kind === 'city' || kind === 'neon') {
    for (let i = 0; i < 35; i++) {
      const bh = 18 + (Math.sin(i * 17) + 1) * (kind === 'neon' ? 45 : 28);
      const bx = i * w / 34 - race.x * 8;
      ctx.fillStyle = kind === 'neon'
        ? (i % 2 ? '#25163f' : '#351c52')
        : (i % 2 ? '#101a2d' : '#18253a');
      ctx.fillRect(bx, horizon - bh, w / 29, bh);
      ctx.fillStyle = kind === 'neon' ? '#fa58dc88' : '#a0e5dc66';
      for (let row = 0; row < 3; row++) {
        ctx.fillRect(bx + 6, horizon - bh + 8 + row * 9, 3, 4);
        ctx.fillRect(bx + 14, horizon - bh + 8 + row * 9, 3, 4);
      }
    }
    return;
  }

  if (kind === 'canyon' || kind === 'snow') {
    for (let i = 0; i < 8; i++) {
      const x = i * w / 6 - w * 0.1;
      const peak = horizon - 22 - (Math.sin(i * 11) + 1) * (kind === 'snow' ? 65 : 42);
      const width = w * 0.23;
      polygon([[x - width / 2, horizon], [x, peak], [x + width / 2, horizon]],
        kind === 'snow' ? (i % 2 ? '#8199ad' : '#9eb2c1') : (i % 2 ? '#7d3c44' : '#a65348'));
      if (kind === 'snow') {
        polygon([[x, peak], [x - width * 0.13, peak + 28], [x, peak + 17], [x + width * 0.13, peak + 30]], '#f3fbff');
      } else {
        polygon([[x, peak + 10], [x - width * 0.12, peak + 35], [x + width * 0.14, peak + 32]], '#dc8260');
      }
    }
    return;
  }

  if (kind === 'forest') {
    for (let i = 0; i < 18; i++) {
      const x = i * w / 17 - 12;
      const height = 28 + (Math.sin(i * 13) + 1) * 22;
      ctx.fillStyle = i % 2 ? '#123c35' : '#1c5144';
      polygon([[x - 25, horizon], [x, horizon - height], [x + 25, horizon]], ctx.fillStyle);
      polygon([[x - 19, horizon - height * 0.48], [x, horizon - height * 1.42], [x + 19, horizon - height * 0.48]], ctx.fillStyle);
    }
    return;
  }

  // Sunset, coast and distant water.
  ctx.fillStyle = '#ffd28b';
  ctx.beginPath();
  ctx.arc(w * 0.76, horizon - 26, Math.max(15, w * 0.035), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#66a9a0';
  for (let i = 0; i < 5; i++) {
    const y = horizon + 7 + i * 7;
    ctx.fillRect(0, y, w * (0.42 + i * 0.05), 2);
    ctx.fillRect(w * (0.62 - i * 0.025), y + 3, w * 0.38, 2);
  }
}

function drawBonus(x, y, scale, kind) {
  const tokens = {
    star: { color: '#ffe27a', glyph: '★' },
    boost: { color: '#72e9ff', glyph: '➤' },
    shield: { color: '#91f1bd', glyph: '◆' }
  };
  const token = tokens[kind] || tokens.star;
  const radius = Math.max(5, w * 0.035 * scale);
  ctx.save();
  ctx.shadowColor = token.color;
  ctx.shadowBlur = Math.max(4, 20 * scale);
  ctx.fillStyle = `${token.color}55`;
  ctx.beginPath();
  ctx.arc(x, y - radius, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = token.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(10, radius * 1.5)}px system-ui`;
  ctx.fillText(token.glyph, x, y - radius);
  ctx.restore();
}

function draw(now) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);

  if (
    canvas.width !== Math.round(rect.width * dpr) ||
    canvas.height !== Math.round(rect.height * dpr)
  ) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  w = rect.width;
  h = rect.height;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const horizon = h * 0.34;
  const theme = race.currentLocation;

  // Небо.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.48, theme.sky[1]);
  sky.addColorStop(1, theme.ground);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Земля вокруг дороги.
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, horizon, w, h - horizon);
  drawScenery(horizon, theme);

  // Дорога и движущиеся обочины.
  // Рисуем от дальних участков к ближним.
  for (let z = 220; z > 0; z -= 2) {
    const nearZ = z - 2;
    const a = project(z, -1);
    const b = project(z, 1);
    const c = project(nearZ, 1);
    const d = project(nearZ, -1);

    const stripe = Math.floor((nearZ + race.distance) / 6) % 2;

    polygon(
      [[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]],
      stripe ? theme.road[0] : theme.road[1]
    );

    for (const side of [-1, 1]) {
      const p1 = project(z, side);
      const p2 = project(z, side * 1.055);
      const p3 = project(nearZ, side * 1.055);
      const p4 = project(nearZ, side);

      polygon(
        [[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]],
        stripe ? theme.edge : theme.ground
      );
    }
  }

  // Разметка движется к водителю.
  for (let i = 0; i < 24; i++) {
    const z = i * 10 - race.distance % 10;
    if (z < 0) continue;

    for (const lane of [-0.33, 0.33]) {
      const a = project(z, lane - 0.009);
      const b = project(z, lane + 0.009);
      const c = project(z + 4, lane + 0.009);
      const d = project(z + 4, lane - 0.009);

      polygon(
        [[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]],
        '#dce9efbb'
      );
    }
  }

  // Придорожные столбики усиливают ощущение скорости.
  for (let i = 0; i < 18; i++) {
    const z = i * 14 - race.distance % 14;
    if (z < 1) continue;

    for (const side of [-1.16, 1.16]) {
      const p = project(z, side);
      const ph = h * 0.17 * p.s;

      ctx.fillStyle = theme.edge;
      ctx.fillRect(p.x, p.y - ph, Math.max(1, 5 * p.s), ph);
      ctx.fillStyle = theme.kind === 'snow' ? '#ffffff' : '#baffed';
      ctx.fillRect(p.x, p.y - ph, Math.max(2, 6 * p.s), ph * 0.18);
    }
  }

  // Трафик: далёкие машины рисуются первыми.
  for (const vehicle of [...race.traffic].sort((a, b) => b.z - a.z)) {
    if (vehicle.z < -2) continue;

    const p = project(vehicle.z, vehicle.x);
    car(p.x, p.y, p.s, vehicle.color, vehicle.style || 'coupe');
  }

  for (const item of [...race.bonuses].sort((a, b) => b.z - a.z)) {
    if (item.z < -2) continue;
    const p = project(item.z, item.x);
    drawBonus(p.x, p.y, p.s, item.kind);
  }

  // Лёгкая вспышка при столкновении.
  if (race.invincible > 1.15) {
    ctx.fillStyle = '#ff304522';
    ctx.fillRect(0, 0, w, h);
  }

  // Капот.
  const hood = ctx.createLinearGradient(0, h * 0.79, 0, h);
  hood.addColorStop(0, '#75cabc');
  hood.addColorStop(1, '#173d42');

  polygon([
    [w * 0.16, h],
    [w * 0.28, h * 0.80],
    [w * 0.72, h * 0.80],
    [w * 0.84, h]
  ], hood);

  // Приборная панель.
  ctx.fillStyle = '#0b111c';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.87);
  ctx.quadraticCurveTo(w * 0.5, h * 0.77, w, h * 0.87);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#6ae2c777';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.87);
  ctx.quadraticCurveTo(w * 0.5, h * 0.77, w, h * 0.87);
  ctx.stroke();

  // Цифровой спидометр.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a5ffe5';
  ctx.font = `bold ${Math.max(18, h * 0.035)}px system-ui`;
  ctx.fillText(Math.round(race.speed), w * 0.5, h * 0.865);

  ctx.fillStyle = '#8ea9bc';
  ctx.font = '10px system-ui';
  ctx.fillText('КМ/Ч', w * 0.5, h * 0.885);

  if (brakingNow && race.state === 'running') {
    ctx.fillStyle = '#ff687c';
    ctx.fillText('ТОРМОЗ', w * 0.7, h * 0.91);
  }

  // Руль вращается вместе с управлением.
  ctx.save();
  ctx.translate(w * 0.5, h * 1.035);
  ctx.rotate(turn * 0.65);

  const radius = Math.min(w * 0.16, h * 0.16);

  ctx.strokeStyle = '#02060c';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#344657';
  ctx.lineWidth = 11;
  ctx.stroke();

  ctx.strokeStyle = '#89f1cf';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2 - 0.08, -Math.PI / 2 + 0.08);
  ctx.stroke();

  ctx.strokeStyle = '#263546';
  ctx.lineWidth = 13;

  for (const angle of [0, Math.PI, Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    ctx.stroke();
  }

  ctx.fillStyle = '#111c2b';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Показатели интерфейса.
  $('speed').textContent = Math.round(race.speed);
  $('distance').textContent =
  Math.floor(race.distance).toLocaleString('ru-RU');
  $('score').textContent = race.score.toLocaleString('ru-RU');
  $('location').textContent = race.currentLocation.name;
  $('lives').textContent =
    '♥ '.repeat(race.lives) + '♡ '.repeat(3 - race.lives);
}
let voiceSpeed = null;

// Добавляем голос рядом с настройками звука.
const voiceBox = document.createElement('div');

voiceBox.innerHTML = `
  <hr style="border:0;border-top:1px solid #344657;margin:14px 0">

  <button id="voiceButton" style="width:100%">
    Включить голос
  </button>

  <p id="voiceStatus"
     style="font-size:12px;line-height:1.5"
     role="status">
    Микрофон выключен
  </p>

  <small>
    Старт · пауза · газ · тормоз · скорость 60 · рука
  </small>

  <p style="font-size:11px">
    Речь может обрабатываться сервисом браузера через интернет.
  </p>
`;

$('mute').closest('.panel').append(voiceBox);

installVoice(
  $('voiceButton'),
  $('voiceStatus'),

  command => {
   if (command.type === 'start') {
     if (race.state === 'running') {
       return 'Гонка уже идёт';
     }

     start();

     if (race.state !== 'running') {
       return 'Покажи руку перед камерой для старта';
     }

   voiceSpeed = 60;
   return 'Поехали: задано 60 км/ч';
}

    if (command.type === 'pause') {
      voiceSpeed = null;
      pause();
      return 'Пауза';
    }

    if (command.type === 'hand') {
      voiceSpeed = null;
      return 'Скорость снова задаётся рукой или клавиатурой';
    }

    if (race.state !== 'running') {
      return 'Сначала скажи «старт»';
    }

    const base = voiceSpeed ?? race.speed;

    if (command.type === 'brake') voiceSpeed = 0;
    if (command.type === 'gas') voiceSpeed = 120;

    if (command.type === 'faster') {
      voiceSpeed = clamp(base + 20, 0, 180);
    }

    if (command.type === 'slower') {
      voiceSpeed = clamp(base - 20, 0, 180);
    }

    if (command.type === 'speed') {
      voiceSpeed = command.value;
    }

    return `Задано голосом: ${Math.round(voiceSpeed)} км/ч`;
  },

  () => {
    voiceSpeed = null;
    pause('Голос выключен. Продолжи кнопкой или жестом.');
  }
);

// В присланном коде обработчик отпускания клавиш отсутствовал.
window.addEventListener('keyup', e => keys.delete(e.code));

window.addEventListener('blur', () => {
  keys.clear();
  voiceSpeed = null;
  pause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    voiceSpeed = null;
    pause();
  }
});

$('mode').addEventListener('change', () => {
  voiceSpeed = null;
});

$('start').addEventListener('click', () => {
  voiceSpeed = null;
});

function loop(now) {
  const dt = Math.min((now - previous) / 1000, 0.25);
  previous = now;

  detect(now);

  let target = 0;
  let gas = false;
  let brake = false;
  let desired = null;

  if (mode === 'camera') {
    const fresh = now - lastSeen < 350;

    if (!fresh) {
      gesture = '';
      victorySince = 0;
      victoryLatched = false;
      $('hold').style.width = '0%';
    }

    if (fresh && gesture === 'Closed_Fist') {
      target = steering(
        handX,
        center,
        +$('sensitivity').value
      );

      const requested = speedFromHand(handY);

      if (
        Math.abs(requested - targetSpeed) >= 10 ||
        requested === 0 ||
        requested === 180
      ) {
        targetSpeed = requested;
      }

      // Голос задаёт скорость, кулак продолжает управлять рулём.
      desired = voiceSpeed ?? targetSpeed;

      $('status').textContent =
        `✊ ${voiceSpeed === null ? 'Рука' : 'Голос'}: ` +
        `задано ${Math.round(desired)} км/ч`;
    } else {
      // Голос не отменяет торможение при потере руки.
      desired = 0;

      // После ладони голосовая скорость остаётся нулевой,
      // пока пользователь не даст новую команду.
      if (gesture === 'Open_Palm' && voiceSpeed !== null) {
        voiceSpeed = 0;
      }
    }

    if (now - lastSeen > 900) {
      pause('Рука потеряна. Покажи ✌️ для продолжения.');
    }
  } else {
    target =
      Number(keys.has('ArrowRight') || keys.has('KeyD')) -
      Number(keys.has('ArrowLeft') || keys.has('KeyA'));

    gas = keys.has('ArrowUp') || keys.has('KeyW');

    brake =
      keys.has('Space') ||
      keys.has('ArrowDown') ||
      keys.has('KeyS');

    if (brake) {
      if (voiceSpeed !== null) voiceSpeed = 0;
      desired = 0;
    } else if (gas) {
      // Нажатие газа возвращает управление клавиатуре.
      voiceSpeed = null;
    } else {
      desired = voiceSpeed;
    }
  }

  if (desired !== null) {
    gas = desired > race.speed + 1;
    brake = desired < race.speed - 1;
  }

  turn += (target - turn) * (1 - Math.exp(-10 * dt));
  brakingNow = brake;

  const before = race.state;
  const oldLives = race.lives;

  race.update(dt, {
    turn,
    gas,
    brake,
    targetSpeed: desired
  });

  for (const event of race.events.splice(0)) {
    const toast = $('event');
    toast.textContent = event.type === 'location'
      ? `Новая локация: ${event.text}`
      : `Бонус: ${event.text}`;
    toast.classList.add('show');
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  if (race.lives < oldLives) {
    sound.cue('crash');
  }

  sound.update(
    race.speed,
    gas,
    brake,
    race.state === 'running'
  );
  if (before === 'running' && race.state === 'won') {
  voiceSpeed = null;
  sound.cue('win');

  overlay(
    'Финиш!',
    'Ты прошёл 2 км! Скажи «старт» для новой гонки.');
  }
  draw(now);

  // Следующий кадр.
  requestAnimationFrame(loop);
}

// Первый кадр — обязательно СНАРУЖИ функции loop.
requestAnimationFrame(loop);

window.addEventListener('pagehide', () => {
  stream?.getTracks().forEach(track => track.stop());
  sound.update(0, false, false, false);
});
