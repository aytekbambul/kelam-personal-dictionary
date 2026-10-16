(() => {
  const PAIRS_KEY = 'kelam-word-pairs-v1';
  const LEGACY_KEY = 'lexora-entries-v1';
  const exportButton = document.querySelector('#export-backup');
  const importButton = document.querySelector('#import-backup');
  const fileInput = document.querySelector('#backup-file');
  const heroCopy = document.querySelector('.hero-copy-block');
  const heroTitle = heroCopy?.querySelector('h1');
  const dictionaryTop = document.querySelector('.dictionary-top');

  function fitWorkspaceText() {
    if (!dictionaryTop || !window.matchMedia('(min-width: 1001px)').matches) {
      dictionaryTop?.querySelectorAll('.section-head h2, .section-kicker, .sort-note, .backup-btn')
        .forEach(element => element.style.removeProperty('font-size'));
      return;
    }

    const groups = [
      [dictionaryTop.querySelector('.section-head'), '.section-head h2, .section-kicker, .sort-note', 1.2],
      [dictionaryTop.querySelector('.backup-actions'), '.backup-btn', 1.15]
    ];

    groups.forEach(([container, selector, maxScale]) => {
      if (!container?.clientWidth || !container.clientHeight) return;
      const elements = [...container.querySelectorAll(selector)];
      elements.forEach(element => element.style.removeProperty('font-size'));
      const baseSizes = elements.map(element => parseFloat(getComputedStyle(element).fontSize) || 12);
      const fits = scale => {
        elements.forEach((element, index) => {
          element.style.fontSize = `${baseSizes[index] * scale}px`;
        });
        const bounds = container.getBoundingClientRect();
        return container.scrollWidth <= container.clientWidth &&
          container.scrollHeight <= container.clientHeight &&
          elements.every(element => {
            const rect = element.getBoundingClientRect();
            const textRange = document.createRange();
            textRange.selectNodeContents(element);
            const textBounds = textRange.getBoundingClientRect();
            return rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom - 1 &&
              textBounds.right <= rect.right + 1 && textBounds.bottom <= rect.bottom + 1;
          });
      };

      let low = 0.65;
      let high = maxScale;
      for (let step = 0; step < 16; step++) {
        const scale = (low + high) / 2;
        if (fits(scale)) low = scale;
        else high = scale;
      }
      fits(low);
    });
  }

  let workspaceFitFrame = 0;
  function scheduleWorkspaceTextFit() {
    cancelAnimationFrame(workspaceFitFrame);
    workspaceFitFrame = requestAnimationFrame(fitWorkspaceText);
  }

  if (dictionaryTop) {
    fitWorkspaceText();
    window.addEventListener('resize', scheduleWorkspaceTextFit);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleWorkspaceTextFit();
    });
    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleWorkspaceTextFit).observe(dictionaryTop);
    }
    new MutationObserver(scheduleWorkspaceTextFit).observe(dictionaryTop, {
      childList: true,
      characterData: true,
      subtree: true
    });
    document.fonts?.ready.then(scheduleWorkspaceTextFit);
  }

  function fitHeroTitle() {
    if (!heroCopy || !heroTitle || !heroCopy.clientWidth || !heroCopy.clientHeight) return;

    const fits = size => {
      heroTitle.style.fontSize = `${size}px`;
      return heroTitle.scrollWidth <= heroCopy.clientWidth &&
        heroTitle.scrollHeight <= heroCopy.clientHeight;
    };

    let low = 1;
    let high = Math.max(parseFloat(getComputedStyle(heroTitle).fontSize) || 24, 32);
    while (fits(high) && high < 2048) {
      low = high;
      high *= 2;
    }

    for (let i = 0; i < 18; i++) {
      const size = (low + high) / 2;
      if (fits(size)) low = size;
      else high = size;
    }
    heroTitle.style.fontSize = `${low}px`;
  }

  let heroFitFrame = 0;
  function scheduleHeroTitleFit() {
    cancelAnimationFrame(heroFitFrame);
    heroFitFrame = requestAnimationFrame(fitHeroTitle);
  }

  if (heroCopy && heroTitle) {
    scheduleHeroTitleFit();
    window.addEventListener('resize', scheduleHeroTitleFit);
    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleHeroTitleFit).observe(heroCopy);
    }
    document.fonts?.ready.then(scheduleHeroTitleFit);
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function currentWords() {
    const current = JSON.parse(localStorage.getItem(PAIRS_KEY) || 'null');
    if (Array.isArray(current)) return current;

    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (!Array.isArray(legacy)) return [];
    return legacy.flatMap(entry => Array.isArray(entry.tr)
      ? entry.tr.filter(Boolean).map(tr => ({ id: createId(), en: entry.en, tr }))
      : []).filter(pair => pair.en);
  }

  function notify(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  exportButton.addEventListener('click', () => {
    try {
      const backup = {
        format: 'kelam-vocabulary-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        words: currentWords()
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kelam-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify('Yedek dosyası indirildi.');
    } catch {
      notify('Sözlük yedeği oluşturulamadı.');
    }
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      const words = Array.isArray(backup) ? backup : backup?.words;
      if (!Array.isArray(words)) throw new Error('Backup must contain a words array.');

      const usedIds = new Set();
      const restoredPairs = words.map(pair => {
        if (!pair || typeof pair.en !== 'string' || !pair.en.trim() ||
            typeof pair.tr !== 'string' || !pair.tr.trim()) {
          throw new Error('Backup contains an invalid vocabulary entry.');
        }
        const id = typeof pair.id === 'string' && pair.id.trim() && !usedIds.has(pair.id)
          ? pair.id
          : createId();
        usedIds.add(id);
        return { ...pair, id };
      });

      window.dispatchEvent(new CustomEvent('kelam:backup-imported', {
        detail: { pairs: restoredPairs }
      }));
    } catch {
      notify('Yedek dosyası geçersiz veya okunamıyor.');
    } finally {
      fileInput.value = '';
    }
  });
})();
