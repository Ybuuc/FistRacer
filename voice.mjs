export function parseCommand(text) {
  const t = text.toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const commands = {
    'старт': 'start',
    'поехали': 'start',
    'продолжить': 'start',
    'пауза': 'pause',
    'тормоз': 'brake',
    'стоп': 'brake',
    'газ': 'gas',
    'быстрее': 'faster',
    'медленнее': 'slower',
    'рука': 'hand',
    'жесты': 'hand'
  };

  if (commands[t]) return { type: commands[t] };

  const match = t.match(/^скорость (.+)$/);
  if (!match) return null;

  const numbers = {
    'ноль': 0,
    'двадцать': 20,
    'тридцать': 30,
    'сорок': 40,
    'пятьдесят': 50,
    'шестьдесят': 60,
    'семьдесят': 70,
    'восемьдесят': 80,
    'девяносто': 90,
    'сто': 100,
    'сто двадцать': 120,
    'сто пятьдесят': 150,
    'сто восемьдесят': 180
  };

  const value = /^\d{1,3}$/.test(match[1])
    ? Number(match[1])
    : numbers[match[1]];

  return Number.isFinite(value) && value >= 0 && value <= 180
    ? { type: 'speed', value }
    : null;
}

export function installVoice(button, status, onCommand, onStop) {
  const API =
    globalThis.SpeechRecognition ||
    globalThis.webkitSpeechRecognition;

  if (!API) {
    button.disabled = true;
    status.textContent =
      'Распознавание речи недоступно в этом браузере.';
    return;
  }

  const recognition = new API();
  recognition.lang = 'ru-RU';
  recognition.continuous = true;
  recognition.interimResults = false;

  let enabled = false;
  let timer;

  function stop(message = 'Микрофон выключен') {
    enabled = false;
    clearTimeout(timer);
    recognition.abort();
    button.textContent = 'Включить голос';
    status.textContent = message;
    onStop();
  }

  function listen() {
    if (!enabled) return;

    try {
      recognition.start();
    } catch {
      stop('Не удалось включить микрофон. Нажми кнопку повторно.');
    }
  }

  button.onclick = () => {
    if (enabled) {
      stop();
      return;
    }

    enabled = true;
    button.textContent = 'Выключить голос';
    status.textContent = 'Разреши доступ к микрофону…';
    listen();
  };

  recognition.onstart = () => {
    if (!enabled) {
      recognition.abort();
      return;
    }

    status.textContent =
      'Слушаю: старт, пауза, газ, тормоз, скорость 60, рука';
  };

  recognition.onresult = event => {
    if (!enabled || document.hidden || !document.hasFocus()) return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const text = event.results[i][0].transcript;
      const command = parseCommand(text);

      status.textContent = command
        ? onCommand(command)
        : `Не понял: «${text}». Произнеси одну команду.`;
    }
  };

  recognition.onerror = event => {
    if (!enabled || event.error === 'no-speech') return;

    const messages = {
      'not-allowed': 'Доступ к микрофону запрещён.',
      'service-not-allowed': 'Сервис распознавания недоступен.',
      'audio-capture': 'Микрофон не найден или занят.',
      'network': 'Ошибка сети сервиса распознавания.'
    };

    stop(messages[event.error] || `Ошибка голоса: ${event.error}`);
  };

  recognition.onend = () => {
    if (enabled) timer = setTimeout(listen, 500);
  };

  window.addEventListener('blur', () => {
    if (enabled) stop();
  });

  window.addEventListener('pagehide', () => {
    if (enabled) stop();
  });
}