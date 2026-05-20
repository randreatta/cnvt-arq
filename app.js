'use strict';

// ── Mapa de conversões suportadas ────────────────────────────────────────────
const CONVERSION_MAP = {
  csv:  ['xlsx', 'xls'],
  xlsx: ['csv', 'xls'],
  xls:  ['csv', 'xlsx'],
  docx: ['pdf'],
  txt:  ['pdf'],
  jpeg: ['png', 'webp', 'pdf'],
  jpg:  ['png', 'webp', 'pdf'],
  png:  ['jpeg', 'webp', 'pdf'],
  webp: ['jpeg', 'png', 'pdf'],
  bmp:  ['jpeg', 'png', 'webp', 'pdf'],
  gif:  ['jpeg', 'png', 'webp', 'pdf'],
  tiff: ['jpeg', 'png', 'webp', 'pdf'],
  tif:  ['jpeg', 'png', 'webp', 'pdf'],
};

const FORMAT_NAMES = {
  csv:  'CSV', xlsx: 'Excel Moderno (.xlsx)', xls: 'Excel Legado (.xls)',
  docx: 'Word (.docx)', pdf: 'PDF', txt: 'Texto Simples (.txt)',
  jpeg: 'JPEG', jpg: 'JPEG', png: 'PNG', webp: 'WebP',
  bmp:  'BMP', gif: 'GIF', tiff: 'TIFF', tif: 'TIFF',
};

const LOSSY_OUTPUT  = new Set(['jpeg', 'jpg', 'webp']);
const IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'tif']);
const SHEET_FORMATS = new Set(['csv', 'xlsx', 'xls']);

// ── Estado ───────────────────────────────────────────────────────────────────
let currentFile      = null;
let currentExt       = null;
let selectedFormat   = null;
let selectedQuality  = 85;
let qualitySupported = false;
let resultBlob       = null;
let resultName       = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
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

// ── Drag & drop ───────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFileSelect(f);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

// ── Slider de qualidade ───────────────────────────────────────────────────────
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
  selectedQuality = value;
  qualitySlider.value = value;
  qualityValue.textContent = `${value}%`;
  updateSliderFill();
  syncPresetButtons();
}

// ── Seleção de arquivo ────────────────────────────────────────────────────────
function handleFileSelect(file) {
  clearError();
  const ext = file.name.split('.').pop().toLowerCase();

  if (!CONVERSION_MAP[ext]) {
    showStep(stepUpload);
    showError(`Formato '.${ext}' não suportado.`);
    return;
  }

  currentFile  = file;
  currentExt   = ext;
  selectedFormat = null;
  resultBlob   = null;
  resultName   = null;

  renderConvertStep(file, ext);
}

function renderConvertStep(file, ext) {
  document.getElementById('detectedFilename').textContent = file.name;
  document.getElementById('detectedFormat').textContent   = ext.toUpperCase();
  document.getElementById('fileSize').textContent         = formatBytes(file.size);

  const container = document.getElementById('formatOptions');
  container.innerHTML = '';

  CONVERSION_MAP[ext].forEach(fmt => {
    const supportsQuality = LOSSY_OUTPUT.has(fmt);
    const btn = document.createElement('button');
    btn.className              = 'format-option';
    btn.dataset.format         = fmt;
    btn.dataset.qualitySupport = supportsQuality ? '1' : '0';
    btn.innerHTML = `
      <span class="format-ext">.${fmt}</span>
      <span class="format-name">${FORMAT_NAMES[fmt] || fmt.toUpperCase()}</span>
    `;
    btn.addEventListener('click', () => pickFormat(btn, fmt, supportsQuality));
    container.appendChild(btn);
  });

  qualitySection.classList.add('hidden');
  qualitySupported    = false;
  btnConvert.disabled = true;
  setQuality(85);

  showStep(stepConvert);
}

function pickFormat(btn, format, supportsQuality) {
  document.querySelectorAll('.format-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedFormat   = format;
  qualitySupported = supportsQuality;
  btnConvert.disabled = false;
  qualitySection.classList.toggle('hidden', !supportsQuality);
}

// ── Dispatcher de conversão ───────────────────────────────────────────────────
async function convertFile() {
  if (!selectedFormat || !currentFile) return;

  const isDocxPdf = currentExt === 'docx' && selectedFormat === 'pdf';
  showLoading(isDocxPdf
    ? 'Convertendo DOCX → PDF (pode levar alguns segundos)...'
    : 'Convertendo arquivo...'
  );

  // Dá tempo ao browser de renderizar o spinner antes de bloquear
  await new Promise(r => setTimeout(r, 60));

  try {
    let blob;
    if (IMAGE_FORMATS.has(currentExt)) {
      blob = await convertImage(currentFile, selectedFormat, selectedQuality);
    } else if (SHEET_FORMATS.has(currentExt)) {
      blob = await convertSpreadsheet(currentFile, currentExt, selectedFormat);
    } else if (currentExt === 'docx') {
      blob = await convertDocxToPdf(currentFile);
    } else if (currentExt === 'txt') {
      blob = await convertTxtToPdf(currentFile);
    } else {
      throw new Error('Conversão não suportada.');
    }

    const stem = currentFile.name.replace(/\.[^/.]+$/, '');
    resultBlob = blob;
    resultName = `${stem}_convertido.${selectedFormat}`;

    renderDownloadStep();
  } catch (err) {
    hideLoading();
    showStep(stepConvert);
    showError(err.message || 'Erro desconhecido na conversão.');
  }
}

function renderDownloadStep() {
  hideLoading();

  const url  = URL.createObjectURL(resultBlob);
  const link = document.getElementById('downloadLink');
  link.href     = url;
  link.download = resultName;

  const qualityNote = qualitySupported ? ` (qualidade ${selectedQuality}%)` : '';
  document.getElementById('conversionInfo').textContent =
    `${currentFile.name}  →  ${resultName}${qualityNote}`;

  showStep(stepDownload);
}

// ── Conversão de imagens (Canvas API) ────────────────────────────────────────
async function convertImage(file, targetFmt, quality) {
  if (targetFmt === 'pdf') return _imageToPdf(file);

  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (['jpeg', 'jpg'].includes(targetFmt)) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      const mimeMap = {
        jpeg: 'image/jpeg', jpg: 'image/jpeg',
        png:  'image/png',  webp: 'image/webp',
      };
      const mime = mimeMap[targetFmt] || 'image/png';
      const q    = LOSSY_OUTPUT.has(targetFmt) ? quality / 100 : undefined;

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error(`Seu navegador não suporta exportar para ${targetFmt.toUpperCase()}.`));
      }, mime, q);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Não foi possível carregar a imagem. Verifique se o arquivo não está corrompido.'));
    };
    img.src = objUrl;
  });
}

async function _imageToPdf(file) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('jsPDF não carregado.');

  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const isLandscape = img.naturalWidth > img.naturalHeight;
      const doc = new jsPDF({ orientation: isLandscape ? 'l' : 'p', unit: 'pt', format: 'a4' });
      const pw  = doc.internal.pageSize.getWidth();
      const ph  = doc.internal.pageSize.getHeight();
      const margin = 40;
      const maxW   = pw - 2 * margin;
      const maxH   = ph - 2 * margin;

      let iw = img.naturalWidth  * 0.75;
      let ih = img.naturalHeight * 0.75;
      if (iw > maxW) { ih *= maxW / iw; iw  = maxW; }
      if (ih > maxH) { iw *= maxH / ih; ih  = maxH; }

      const x = (pw - iw) / 2;
      const y = (ph - ih) / 2;

      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, iw, ih);
      resolve(doc.output('blob'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Não foi possível carregar a imagem.'));
    };
    img.src = objUrl;
  });
}

// ── Conversão de planilhas (SheetJS) ─────────────────────────────────────────
async function convertSpreadsheet(file, srcFmt, dstFmt) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS não carregado.');

  const arrayBuffer = await file.arrayBuffer();
  const workbook    = XLSX.read(arrayBuffer, { type: 'array' });

  if (dstFmt === 'csv') {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csv   = XLSX.utils.sheet_to_csv(sheet);
    // BOM para que o Excel abra corretamente com acentos
    return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  }

  const mimeMap = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls:  'application/vnd.ms-excel',
  };
  const output = XLSX.write(workbook, { bookType: dstFmt, type: 'array' });
  return new Blob([output], { type: mimeMap[dstFmt] });
}

// ── DOCX → PDF (mammoth.js + jsPDF + html2canvas) ────────────────────────────
async function convertDocxToPdf(file) {
  if (typeof mammoth  === 'undefined') throw new Error('mammoth.js não carregado.');
  if (typeof html2canvas === 'undefined') throw new Error('html2canvas não carregado.');
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('jsPDF não carregado.');

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    'width:720px', 'padding:20px 30px',
    'font-family:Arial,sans-serif', 'font-size:11pt', 'line-height:1.6',
    'color:#000000', 'background:#ffffff',
  ].join(';');
  container.innerHTML = html;
  document.body.appendChild(container);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  await new Promise((resolve) => {
    doc.html(container, {
      callback:    resolve,
      margin:      [45, 45, 45, 45],
      html2canvas: { scale: 0.72, useCORS: true, backgroundColor: '#ffffff' },
      width:       505,
      windowWidth: 760,
      x: 0,
      y: 0,
    });
  });

  document.body.removeChild(container);
  return doc.output('blob');
}

// ── TXT → PDF (jsPDF) ────────────────────────────────────────────────────────
async function convertTxtToPdf(file) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('jsPDF não carregado.');

  const text   = await file.text();
  const doc    = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw     = doc.internal.pageSize.getWidth();
  const ph     = doc.internal.pageSize.getHeight();
  const margin = 50;
  const lh     = 14;
  const maxW   = pw - 2 * margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  let y = margin;
  for (const line of text.split('\n')) {
    for (const wl of doc.splitTextToSize(line || ' ', maxW)) {
      if (y + lh > ph - margin) { doc.addPage(); y = margin; }
      doc.text(wl, margin, y);
      y += lh;
    }
  }

  return doc.output('blob');
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetToUpload() {
  if (resultBlob) {
    URL.revokeObjectURL(document.getElementById('downloadLink').href);
  }
  currentFile      = null;
  currentExt       = null;
  selectedFormat   = null;
  qualitySupported = false;
  resultBlob       = null;
  resultName       = null;
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

updateSliderFill();

window.convertFile   = convertFile;
window.resetToUpload = resetToUpload;
window.setQuality    = setQuality;
