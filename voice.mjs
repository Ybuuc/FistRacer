export function parseCommand(text) {
  const t = String(text ?? '').toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;

  const speedMatch = t.match(/(?:^|\s)скорост(?:ь|и)\s+(.+)$/);
  if (speedMatch) {
    const numbers = {
      'ноль': 0, 'десять': 10, 'двадцать': 20, 'тридцать': 30,
      'сорок': 40, 'пятьдесят': 50, 'шестьдесят': 60,
      'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90,
      'сто': 100, 'сто двадцать': 120, 'сто пятьдесят': 150,
      'сто восемьдесят': 180, 'двести': 200, 'двести двадцать': 220,
      'двести сорок': 240
    };
    const raw = speedMatch[1]
      .replace(/\s+(?:километров?(?:\s+в\s+час)?|километра|км(?:\s*ч)?|кмч|пожалуйста)$/g, '')
      .trim();
    const value = /^\d{1,3}$/.test(raw) ? Number(raw) : numbers[raw];
    if (Number.isFinite(value) && value >= 0 && value <= 240) {
      return { type: 'speed', value };
    }
  }

  const has = pattern => new RegExp(`(?:^|\\s)(?:${pattern})(?:\\s|$)`).test(t);
  if (has('старт|стартуй|поехали|начать|начинай|начни|продолжить|продолжай|вперед|запускай')) return { type: 'start' };
  if (has('пауза|паузу|остановись|останови|замри')) return { type: 'pause' };
  if (has('тормоз|тормози|тормозить|стоп')) return { type: 'brake' };
  if (has('быстрее|ускорься|прибавь')) return { type: 'faster' };
  if (has('медленнее|сбавь|убавь')) return { type: 'slower' };
  if (has('газ|разгон|ускорение|едь')) return { type: 'gas' };
  if (has('рука|жест|жесты')) return { type: 'hand' };
  return null;
}

function speechAPI() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

function speechError(error) {
  const messages = {
    'not-allowed': 'Браузер запретил доступ к микрофону или распознаванию.',
    'service-not-allowed': 'Сервис распознавания речи недоступен.',
    'audio-capture': 'Микрофон не найден или занят другим приложением.',
    'network': 'Сервис распознавания не ответил. Проверь интернет.',
    'no-speech': 'Сервис не услышал фразу. Говори чётко и ближе к микрофону.',
    'language-not-supported': 'Русский язык распознавания не поддерживается браузером.',
    'aborted': 'Проверка была остановлена.'
  };
  return messages[error] || `Ошибка распознавания: ${error || 'неизвестная ошибка'}.`;
}

export async function diagnoseVoice(button, status, level) {
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Идёт проверка…';
  level.value = '0';

  let stream;
  let audioContext;
  let maxRms = 0;
  let micError = '';

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Микрофон доступен только на HTTPS или localhost. Открой игру по ссылке GitHub Pages.');
    }

    status.textContent = 'Разреши микрофон, затем произнеси «старт» в течение трёх секунд.';
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    const AudioAPI = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioAPI) {
      audioContext = new AudioAPI();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const stopAt = performance.now() + 3000;

      while (performance.now() < stopAt) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        maxRms = Math.max(maxRms, rms);
        level.value = String(Math.min(100, Math.round(rms * 500)));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (error) {
    micError = error.name === 'NotAllowedError'
      ? 'Доступ к микрофону запрещён. Разреши его для сайта в настройках браузера.'
      : error.name === 'NotFoundError'
        ? 'Браузер не нашёл микрофон.'
        : error.name === 'NotReadableError'
          ? 'Микрофон занят другим приложением.'
          : (error.message || 'Не удалось открыть микрофон.');
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {});
    level.value = '0';
  }

  try {
    if (micError) {
      status.textContent = `Микрофон: ошибка. ${micError}`;
      return;
    }

    const API = speechAPI();
    if (!API) {
      status.textContent = 'Микрофон работает, но в этом браузере нет Web Speech API. Проверь в Chrome или Edge.';
      return;
    }

    status.textContent = maxRms >= 0.008
      ? 'Микрофон работает и улавливает звук. Теперь ещё раз скажи: «старт».'
      : 'Разрешение есть, но уровень звука низкий. Проверь выбранный микрофон и громкость. Сейчас проверим распознавание.';

    const recognition = new API();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    await new Promise(resolve => {
      let done = false;
      let timer;
      const finish = result => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { recognition.stop(); } catch {}
        if (result.error) {
          status.textContent = `Микрофон ${maxRms >= 0.008 ? 'улавливает звук' : 'получил доступ, но сигнал тихий'}. Распознавание: ${speechError(result.error)}`;
        } else {
          const command = parseCommand(result.text);
          const confidence = Number.isFinite(result.confidence)
            ? ` Уверенность: ${Math.round(result.confidence * 100)}%.`
            : '';
          status.textContent = `Распознано: «${result.text}».${confidence} ` +
            (command ? `Команда игры: ${command.type === 'start' ? 'старт' : command.type}.` : 'Фраза услышана, но не совпала с командой игры. Скажи именно «старт».');
        }
        resolve();
      };

      recognition.onstart = () => {
        status.textContent = 'Слушаю до 8 секунд. Скажи коротко и чётко: «старт».';
        clearTimeout(timer);
        timer = setTimeout(() => finish({ error: 'no-speech' }), 8000);
      };
      recognition.onresult = event => {
        const result = event.results[event.results.length - 1];
        if (!result) return;
        const alternatives = Array.from(result);
        const matched = alternatives.find(item => parseCommand(item.transcript));
        const best = matched || alternatives[0];
        if (!result.isFinal) {
          status.textContent = `Слышу: «${best.transcript}…»`;
          return;
        }
        finish({ text: best.transcript.trim(), confidence: best.confidence });
      };
      recognition.onerror = event => finish({ error: event.error });
      recognition.onend = () => {
        if (!done) finish({ error: 'no-speech' });
      };
      timer = setTimeout(() => finish({ error: 'no-speech' }), 12000);
      try {
        recognition.start();
      } catch (error) {
        finish({ error: error.name === 'NotAllowedError' ? 'not-allowed' : error.message });
      }
    });
  } finally {
    button.disabled = false;
    button.textContent = 'Проверить микрофон и распознавание';
  }
}

export function installVoice(button, status, onCommand, onStop) {
  const API = speechAPI();
  if (!API) {
    button.disabled = true;
    status.textContent = 'Web Speech API недоступен. Проверь голосовое управление в Chrome или Edge.';
    return { stop() {}, isEnabled: () => false };
  }

  const recognition = new API();
  recognition.lang = 'ru-RU';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let enabled = false;
  let timer;
  let interimTimer;
  let fastCommand = null;
  let interimCandidate = null;

  function stop(message = 'Голосовое управление выключено') {
    enabled = false;
    clearTimeout(timer);
    clearTimeout(interimTimer);
    fastCommand = null;
    interimCandidate = null;
    try { recognition.abort(); } catch {}
    button.textContent = 'Включить голос';
    status.textContent = message;
    onStop();
  }

  function listen() {
    if (!enabled) return;
    try {
      recognition.start();
    } catch {
      timer = setTimeout(listen, 700);
    }
  }

  button.onclick = () => {
    if (enabled) {
      stop();
      return;
    }
    enabled = true;
    button.textContent = 'Выключить голос';
    status.textContent = 'Запрашиваю доступ к микрофону…';
    listen();
  };

  recognition.onstart = () => {
    if (!enabled) {
      recognition.abort();
      return;
    }
    status.textContent = 'Слушаю короткие команды: старт, пауза, газ, тормоз, быстрее, медленнее.';
  };

  recognition.onspeechstart = () => {
    clearTimeout(interimTimer);
    interimCandidate = null;
    fastCommand = null;
    if (enabled) status.textContent = 'Речь слышна, распознаю…';
  };

  recognition.onresult = event => {
    if (!enabled || document.hidden || !document.hasFocus()) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alternatives = Array.from(result);
      const matched = alternatives.find(item => parseCommand(item.transcript));
      const best = matched || alternatives[0];
      if (!best) continue;
      if (!result.isFinal) {
        status.textContent = `Слышу: «${best.transcript}…»`;
        const command = parseCommand(best.transcript);
        if (command) {
          const key = JSON.stringify(command);
          if (key !== interimCandidate) {
            clearTimeout(interimTimer);
            interimCandidate = key;
            interimTimer = setTimeout(() => {
              if (!enabled || document.hidden || !document.hasFocus()) return;
              fastCommand = key;
              status.textContent = `Команда: ${onCommand(command)}`;
            }, 220);
          }
        } else {
          clearTimeout(interimTimer);
          interimCandidate = null;
        }
        continue;
      }

      const command = parseCommand(best.transcript);
      clearTimeout(interimTimer);
      const key = command ? JSON.stringify(command) : null;
      const response = command
        ? (key === fastCommand ? 'выполнено' : onCommand(command))
        : `Не понял «${best.transcript}». Попробуй: «старт», «пауза», «газ» или «тормоз».`;
      fastCommand = null;
      interimCandidate = null;
      const confidence = Number.isFinite(best.confidence)
        ? ` · ${Math.round(best.confidence * 100)}%`
        : '';
      status.textContent = `Распознано: «${best.transcript}»${confidence}. ${response}`;
    }
  };

  recognition.onerror = event => {
    if (!enabled || event.error === 'no-speech') return;
    stop(speechError(event.error));
  };

  recognition.onend = () => {
    clearTimeout(interimTimer);
    fastCommand = null;
    interimCandidate = null;
    if (enabled) timer = setTimeout(listen, 500);
  };

  window.addEventListener('blur', () => {
    if (enabled) stop();
  });
  window.addEventListener('pagehide', () => {
    if (enabled) stop();
  });

  return { stop, isEnabled: () => enabled };
}
