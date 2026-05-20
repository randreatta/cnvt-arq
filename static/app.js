'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let currentFileId       = null;
let currentOrigName     = null;
let selectedFormat      = null;
let selectedQuality     = 85;
let qualitySupported    = false;    // true quando o formato de saída aceita quality

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const stepUpload     = document.getElementById('step-upload');
const stepConvert    = document.getElementById('step-convert');
const stepDownload   = document.getElementById('step-download');
const loadingSection = document.getElementById('loading');
const btnConvert     = document.getElementById('btnConvert');
const errorBox       = document.getElementById('error-box');
const errorText      = document.getElementById('error-text');
const qualitySection = document.getElementById('qualitySection');
const qualitySlider  = document.getElementById('qualitySlider');
const qualityValue   = document.getElementById('qualityValue');

// ── Drag & drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
});

// ── Quality slider ────────────────────────────────────────────────────────────
qualitySlider.addEventListener('input', () => {
  selectedQuality = parseInt(qualitySlider.value, 10);
  qualityValue.textContent = `${selectedQuality}%`;
  updateSliderFill();
  syncPresetButtons();
});

function updateSliderFill() {
  const pct = ((selectedQuality - 1) / 99) * 100;
  qualitySlider.style.background =
    `linear-gradient(to right, var(--primary) ${pct}%, var(--border) ${pct}%)`;
}

function syncPresetButtons() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.q, 10) === selectedQuality);
  });
}

function setQuality(value) {
  selectedQuality       = value;
  qualitySlider.value   = value;
  qualityValue.textContent = `${value}%`;
  updateSliderFill();
  syncPresetButtons();
}

// ── Upload ────────────────────────────────────────────────────────────────────
async function uploadFile(file) {
  clearError();
  showLoading('Enviando arquivo...');

  const body = new FormData();
  body.append('file', file);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || 'Erro ao enviar o arquivo.');

    currentFileId   = data.file_id;
    currentOrigName = data.original_name;
    selectedFormat  = null;

    renderConvertStep(data);
  } catch (err) {
    hideLoading();
    showStep(stepUpload);
    showError(err.message);
  }
}

function renderConvertStep(data) {
  hideLoading();

  document.getElementById('detectedFilename').textContent = data.original_name;
  document.getElementById('detectedFormat').textContent   = data.detected_format.toUpperCase();
  document.getElementById('fileSize').textContent         = formatBytes(data.file_size);

  const container = document.getElementById('formatOptions');
  container.innerHTML = '';

  data.available_conversions.forEach(({ format, name, quality_supported }) => {
    const btn = document.createElement('button');
    btn.className              = 'format-option';
    btn.dataset.format         = format;
    btn.dataset.qualitySupport = quality_supported ? '1' : '0';
    btn.innerHTML = `
      <span class="format-ext">.${format}</span>
      <span class="format-name">${name}</span>
    `;
    btn.addEventListener('click', () => pickFormat(btn, format, quality_supported));
    container.appendChild(btn);
  });

  // Reset quality section
  qualitySection.classList.add('hidden');
  qualitySupported = false;
  btnConvert.disabled = true;

  // Reset slider to default
  setQuality(85);

  showStep(stepConvert);
}

function pickFormat(btn, format, supportsQuality) {
  document.querySelectorAll('.format-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedFormat   = format;
  qualitySupported = supportsQuality;
  btnConvert.disabled = false;

  if (supportsQuality) {
    qualitySection.classList.remove('hidden');
  } else {
    qualitySection.classList.add('hidden');
  }
}

// ── Convert ───────────────────────────────────────────────────────────────────
async function convertFile() {
  if (!selectedFormat || !currentFileId) return;

  showLoading('Convertendo arquivo...');

  const payload = {
    file_id:       currentFileId,
    target_format: selectedFormat,
    original_name: currentOrigName,
  };

  if (qualitySupported) {
    payload.quality = selectedQuality;
  }

  try {
    const res = await fetch('/api/convert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro durante a conversão.');

    renderDownloadStep(data);
  } catch (err) {
    hideLoading();
    showStep(stepConvert);
    showError(err.message);
  }
}

function renderDownloadStep({ download_id, download_name }) {
  hideLoading();

  const url  = `/api/download/${download_id}?filename=${encodeURIComponent(download_name)}`;
  const link = document.getElementById('downloadLink');
  link.href     = url;
  link.download = download_name;

  const qualityNote = qualitySupported ? ` (qualidade ${selectedQuality}%)` : '';
  document.getElementById('conversionInfo').textContent =
    `${currentOrigName}  →  ${download_name}${qualityNote}`;

  showStep(stepDownload);
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetToUpload() {
  currentFileId    = null;
  currentOrigName  = null;
  selectedFormat   = null;
  qualitySupported = false;
  fileInput.value  = '';
  qualitySection.classList.add('hidden');
  clearError();
  showStep(stepUpload);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showStep(activeSection) {
  [stepUpload, stepConvert, stepDownload, loadingSection].forEach(s => {
    s.classList.toggle('hidden', s !== activeSection);
  });
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text;
  [stepUpload, stepConvert, stepDownload].forEach(s => s.classList.add('hidden'));
  loadingSection.classList.remove('hidden');
}

function hideLoading() { loadingSection.classList.add('hidden'); }

function showError(msg) {
  errorText.textContent = msg;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorText.textContent = '';
  errorBox.classList.add('hidden');
}

function formatBytes(bytes) {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// Inicializa o fill do slider
updateSliderFill();

// expõe para handlers inline
window.convertFile   = convertFile;
window.resetToUpload = resetToUpload;
window.setQuality    = setQuality;
