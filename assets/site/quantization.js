(() => {
  'use strict';

  const slider = document.getElementById('quantization-input');
  const inputValue = document.getElementById('quantization-input-value');
  const announcement = document.getElementById('quantization-announcement');
  const formats = ['float', 'int', 'binary'].map(name => ({
    marker: document.querySelector(`[data-quantization-marker="${name}"]`),
    result: document.querySelector(`[data-quantization-result="${name}"]`)
  }));

  function signed(text) {
    return text.startsWith('-') ? text : `+${text}`;
  }

  function update() {
    const value = slider.valueAsNumber;
    const code = Math.round((value + 1) * 127.5) - 128;
    const values = [Math.fround(value), (code + 128) / 127.5 - 1, value >= 0 ? 1 : -1];
    inputValue.textContent = signed(value.toFixed(3));
    formats.forEach((format, index) => {
      // Group 32 real INT8 codes per visual block to exaggerate the staircase.
      const position = index === 1
        ? (7 - Math.floor((code + 128) / 32) + 0.5) * 12.5
        : (1 - values[index]) * 50;
      format.marker.style.setProperty('--position', `${position}%`);
      format.result.textContent = signed(index === 0
        ? values[index].toPrecision(9)
        : values[index].toFixed(index === 2 ? 0 : 5));
    });
  }

  slider.addEventListener('input', update);
  slider.addEventListener('change', () => {
    announcement.textContent = `FP32: ${formats[0].result.textContent}; INT8 reconstructed: ${formats[1].result.textContent}; binary sign: ${formats[2].result.textContent}.`;
  });
  update();
  slider.closest('.quantization-control').hidden = false;

  // At-scale meter: raw bytes per format for a corpus of n vectors x d dims.
  const meter = document.querySelector('[data-quant-meter]');
  if (!meter) return;
  const count = meter.querySelector('#qm-count');
  const countText = meter.querySelector('[data-qm-count]');
  const dimsText = meter.querySelector('[data-qm-dims]');
  const sizes = [...meter.querySelectorAll('[data-qm-size]')];
  const dimButtons = [...meter.querySelectorAll('[data-qm-dim]')];
  const live = meter.querySelector('[data-qm-live]');
  let dims = 1024;
  let timer = 0;

  const twoSig = n => Number(n.toPrecision(2));
  function vectors(n) {
    if (n >= 1e9) return `${twoSig(n / 1e9)} billion`;
    if (n >= 1e6) return `${twoSig(n / 1e6)} million`;
    return twoSig(n).toLocaleString('en-US');
  }
  function bytes(b) {
    const units = [['PB', 1e15], ['TB', 1e12], ['GB', 1e9], ['MB', 1e6]];
    const [unit, scale] = units.find(([, s]) => b >= s) || units[units.length - 1];
    const v = b / scale;
    return `${v >= 100 ? Math.round(v) : v.toPrecision(3)} ${unit}`;
  }

  function measure() {
    const n = twoSig(10 ** count.valueAsNumber);
    countText.textContent = vectors(n);
    dimsText.textContent = dims.toLocaleString('en-US');
    count.setAttribute('aria-valuetext', `${vectors(n)} vectors`);
    sizes.forEach(el => { el.textContent = bytes(n * dims * Number(el.dataset.qmSize)); });
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (live) live.textContent = `${vectors(n)} vectors at ${dims.toLocaleString('en-US')} dimensions: FP32 ${sizes[0].textContent}, INT8 ${sizes[1].textContent}, binary ${sizes[2].textContent}.`;
    }, 500);
  }

  count.addEventListener('input', measure);
  dimButtons.forEach(button => button.addEventListener('click', () => {
    dims = Number(button.dataset.qmDim);
    dimButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    measure();
  }));
  measure();
  meter.hidden = false;
})();
