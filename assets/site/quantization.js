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
})();
