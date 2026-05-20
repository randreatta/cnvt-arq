'use strict';

// ── Constantes ───────────────────────────────────────────────────────────────
const MAX_FILES = 20;

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
  csv: 'CSV', xlsx: 'Excel (.xlsx)', xls: 'Excel 97 (.xls)',
  pdf: 'PDF', docx: 'Word (.docx)', txt: 'Texto (.txt)',
  jpeg: 'JPEG', jpg: 'JPEG', png: 'PNG',
  webp: 'WebP', bmp: 'BMP', gif: 'GIF', tiff: 'TIFF', tif: 'TIFF',
};

const LOSSY_OUTPUT  = new Set(['jpeg', 'jpg', 'webp']);
const IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'tif']);
const SHEET_FORMATS = new Set(['csv', 'xlsx', 'xls']);

// ── Estado global ────────────────────────────────────────────────────────────
let fileQueue     = [];   // Array de FileEntry
let globalQuality = 85;
let isConverting  = false;

// ── DOM ───────────────────────────────────────────────────────────────────────
const fileInput      = document.getElementById('fileInput');
const dropZone       = document.getElementById('dropZone');
const viewEmpty      = document.getElementById('view-empty');
const viewList       = document.getElementById('view-list');
const fileListEl     = document.getElementById('fileList');
const fileCountEl    = document.getElementById('fileCount');
const qualitySection = document.getElementById('qualitySection');
const qualitySlider  = document.getElementById('qualitySlider');
const qualityValueEl = document.getElementById('qualityValue');
const btnConvertAll  = document.getElementById('btnConvertAll');
const progressText   = document.getElementById('progressText');
const batchResult    = document.getElementById('batchResult');
const resultSummary  = document.getElementById('resultSummary');

// ── Drag & drop — tela inicial ────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

// ── Drag & drop — sobre a lista (adicionar mais) ──────────────────────────────
function onListDragOver(e) {
  e.preventDefault();
  fileListEl.classList.add('drag-over');
}
function onListDragLeave(e) {
  if (!fileListEl.contains(e.relatedTarget)) fileListEl.classList.remove('drag-over');
}
function onListDrop(e) {
  e.preventDefault();
  fileListEl.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
}

// ── Input file ────────────────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

// ── Slider de qualidade ───────────────────────────────────────────────────────
qualitySlider.addEventListener('input', () => {
  globalQuality = parseInt(qualitySlider.value, 10);
  qualityValueEl.textContent = `${globalQuality}%`;
  updateSliderFill();
  syncPresetButtons();
});

function setQuality(v) {
  globalQuality = v;
  qualitySlider.value = v;
  qualityValueEl.textContent = `${v}%`;
  updateSliderFill();
  syncPresetButtons();
}

function updateSliderFill() {
  const pct = ((globalQuality - 1) / 99) * 100;
  qualitySlider.style.background =
    `linear-gradient(to right, var(--primary) ${pct}%, var(--border) ${pct}%)`;
}

function syncPresetButtons() {
  document.querySelectorAll('.preset-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.q, 10) === globalQuality)
  );
}

// ── Receber arquivos ──────────────────────────────────────────────────────────
function handleFiles(rawFiles) {
  clearError();
  const incoming = Array.from(rawFiles);
  const errors   = [];
  const toAdd    = [];

  for (const file of incoming) {
    if (fileQueue.length + toAdd.length >= MAX_FILES) {
      errors.push(`Limite de ${MAX_FILES} arquivos atingido. Alguns arquivos foram ignorados.`);
      break;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!CONVERSION_MAP[ext]) {
      errors.push(`"${file.name}" — formato .${ext} não suportado.`);
      continue;
    }
    toAdd.push(new FileEntry(file, ext));
  }

  fileQueue.push(...toAdd);

  if (errors.length) showError(errors[0]);
  if (fileQueue.length > 0) renderView();
}

// ── FileEntry ─────────────────────────────────────────────────────────────────
class FileEntry {
  constructor(file, ext) {
    this.id           = Math.random().toString(36).slice(2, 10);
    this.file         = file;
    this.ext          = ext;
    this.targetFormat = CONVERSION_MAP[ext][0];
    this.status       = 'pending';   // pending | converting | done | error
    this.resultBlob   = null;
    this.resultName   = null;
    this.errorMsg     = null;
  }
}

// ── Views ─────────────────────────────────────────────────────────────────────
function renderView() {
  if (fileQueue.length === 0) {
    viewEmpty.classList.remove('hidden');
    viewList.classList.add('hidden');
    return;
  }
  viewEmpty.classList.add('hidden');
  viewList.classList.remove('hidden');
  renderFileList();
  updateCounter();
  checkQualityVisibility();
  resetBatchResult();
}

function renderFileList() {
  fileListEl.innerHTML = '';
  fileQueue.forEach(entry => fileListEl.appendChild(buildRow(entry)));
}

function buildRow(entry) {
  const div = document.createElement('div');
  div.className = 'file-row';
  div.id = `row-${entry.id}`;

  const options = CONVERSION_MAP[entry.ext]
    .map(f => `<option value="${f}"${f === entry.targetFormat ? ' selected' : ''}>${FORMAT_NAMES[f]}</option>`)
    .join('');

  div.innerHTML = `
    <svg class="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <span class="row-name" title="${entry.file.name}">${truncate(entry.file.name, 28)}</span>
    <span class="row-badge">${entry.ext.toUpperCase()}</span>
    <svg class="row-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
    <select class="format-select" id="sel-${entry.id}"
            onchange="onFormatChange('${entry.id}', this.value)">
      ${options}
    </select>
    <span class="status-badge status-pending" id="status-${entry.id}">Aguardando</span>
    <button class="btn-row-remove" id="rm-${entry.id}"
            onclick="removeFile('${entry.id}')" title="Remover">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  return div;
}

function onFormatChange(id, format) {
  const entry = fileQueue.find(e => e.id === id);
  if (entry) entry.targetFormat = format;
  checkQualityVisibility();
}

function removeFile(id) {
  if (isConverting) return;
  fileQueue = fileQueue.filter(e => e.id !== id);
  renderView();
}

function clearAll() {
  fileQueue    = [];
  isConverting = false;
  renderView();
  clearError();
}

function updateCounter() {
  fileCountEl.textContent = fileQueue.length;
  const btnAdd = document.getElementById('btnAddMore');
  if (btnAdd) btnAdd.disabled = fileQueue.length >= MAX_FILES;
}

function checkQualityVisibility() {
  const needsQuality = fileQueue.some(e => LOSSY_OUTPUT.has(e.targetFormat));
  qualitySection.classList.toggle('hidden', !needsQuality);
}

function resetBatchResult() {
  batchResult.classList.add('hidden');
  progressText.classList.add('hidden');
  btnConvertAll.classList.remove('hidden');
  btnConvertAll.disabled = false;
}

// ── Conversão em lote ─────────────────────────────────────────────────────────
async function convertAll() {
  if (isConverting || fileQueue.length === 0) return;
  isConverting = true;

  btnConvertAll.disabled = true;
  progressText.classList.remove('hidden');

  const total = fileQueue.length;
  let done = 0;

  for (const entry of fileQueue) {
    progressText.textContent = `Convertendo ${done + 1} de ${total}...`;
    setRowStatus(entry.id, 'converting');
    await new Promise(r => setTimeout(r, 40));   // renderiza o spinner

    try {
      entry.resultBlob = await runConversion(entry);
      const stem = entry.file.name.replace(/\.[^/.]+$/, '');
      entry.resultName = `${stem}_convertido.${entry.targetFormat}`;
      entry.status = 'done';
      setRowStatus(entry.id, 'done');
    } catch (err) {
      entry.status   = 'error';
      entry.errorMsg = err.message || 'Erro desconhecido';
      setRowStatus(entry.id, 'error', entry.errorMsg);
    }

    done++;
  }

  isConverting = false;
  showBatchResult(total);
}

async function runConversion(entry) {
  const { file, ext, targetFormat } = entry;
  if (IMAGE_FORMATS.has(ext))    return convertImage(file, targetFormat, globalQuality);
  if (SHEET_FORMATS.has(ext))    return convertSpreadsheet(file, ext, targetFormat);
  if (ext === 'docx')            return convertDocxToPdf(file);
  if (ext === 'txt')             return convertTxtToPdf(file);
  throw new Error('Conversão não suportada.');
}

function showBatchResult(total) {
  const succeeded = fileQueue.filter(e => e.status === 'done').length;
  const failed    = total - succeeded;

  progressText.classList.add('hidden');
  btnConvertAll.classList.add('hidden');
  batchResult.classList.remove('hidden');

  if (failed === 0) {
    resultSummary.innerHTML =
      `<span class="result-ok">✓ ${succeeded} arquivo${succeeded > 1 ? 's' : ''} convertido${succeeded > 1 ? 's' : ''} com sucesso</span>`;
  } else {
    resultSummary.innerHTML =
      `<span class="result-ok">✓ ${succeeded} convertido${succeeded > 1 ? 's' : ''}</span>` +
      `<span class="result-err"> · ${failed} com erro</span>`;
  }

  document.getElementById('btnDownloadZip').disabled = succeeded === 0;
}

// ── Download ZIP ──────────────────────────────────────────────────────────────
async function downloadZip() {
  const done = fileQueue.filter(e => e.status === 'done' && e.resultBlob);
  if (done.length === 0) return;

  const btn = document.getElementById('btnDownloadZip');
  btn.textContent = 'Gerando ZIP...';
  btn.disabled = true;

  const zip   = new JSZip();
  const names = deduplicateNames(done.map(e => e.resultName));

  done.forEach((entry, i) => zip.file(names[i], entry.resultBlob));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cnvt-arq_${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Baixar ZIP`;
  btn.disabled = false;
}

function deduplicateNames(names) {
  const seen = {};
  return names.map(name => {
    if (seen[name] === undefined) { seen[name] = 0; return name; }
    seen[name]++;
    const ext  = name.split('.').pop();
    const stem = name.slice(0, -(ext.length + 1));
    return `${stem}_${seen[name]}.${ext}`;
  });
}

// ── Status por linha ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { cls: 'status-pending',    html: 'Aguardando' },
  converting: { cls: 'status-converting', html: '<span class="mini-spin"></span>Convertendo' },
  done:       { cls: 'status-done',       html: '✓ Concluído' },
  error:      { cls: 'status-error',      html: '✗ Erro' },
};

function setRowStatus(id, status, errorMsg) {
  const badge = document.getElementById(`status-${id}`);
  if (!badge) return;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  badge.className = `status-badge ${cfg.cls}`;
  badge.innerHTML = cfg.html;
  if (errorMsg) badge.title = errorMsg;

  // desabilita select e remove button durante/após conversão
  const select = document.getElementById(`sel-${id}`);
  const rm     = document.getElementById(`rm-${id}`);
  if (select) select.disabled = status === 'converting' || status === 'done' || status === 'error';
  if (rm)     rm.style.visibility = (status === 'converting') ? 'hidden' : 'visible';
}

// ── Utilitários de UI ─────────────────────────────────────────────────────────
function showError(msg) {
  const box  = document.getElementById('error-box');
  const text = document.getElementById('error-text');
  if (!box || !text) return;
  text.textContent = msg;
  box.classList.remove('hidden');
}

function clearError() {
  const box = document.getElementById('error-box');
  if (box) box.classList.add('hidden');
}

function truncate(str, max) {
  if (str.length <= max) return str;
  const ext  = str.includes('.') ? '.' + str.split('.').pop() : '';
  const stem = str.slice(0, str.length - ext.length);
  return stem.slice(0, max - ext.length - 1) + '…' + ext;
}

function formatBytes(bytes) {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
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
      const mime = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[targetFmt] || 'image/png';
      const q    = LOSSY_OUTPUT.has(targetFmt) ? quality / 100 : undefined;
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error(`Seu navegador não suporta exportar para ${targetFmt.toUpperCase()}.`));
      }, mime, q);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Não foi possível carregar a imagem.')); };
    img.src = objUrl;
  });
}

async function _imageToPdf(file) {
  const { jsPDF } = window.jspdf;
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const doc    = new jsPDF({ orientation: img.naturalWidth > img.naturalHeight ? 'l' : 'p', unit: 'pt', format: 'a4' });
      const pw     = doc.internal.pageSize.getWidth();
      const ph     = doc.internal.pageSize.getHeight();
      const margin = 40; const maxW = pw - 2 * margin; const maxH = ph - 2 * margin;
      let iw = img.naturalWidth * 0.75; let ih = img.naturalHeight * 0.75;
      if (iw > maxW) { ih *= maxW / iw; iw = maxW; }
      if (ih > maxH) { iw *= maxH / ih; ih = maxH; }
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
      resolve(doc.output('blob'));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Não foi possível carregar a imagem.')); };
    img.src = objUrl;
  });
}

// ── Conversão de planilhas (SheetJS) ─────────────────────────────────────────
async function convertSpreadsheet(file, srcFmt, dstFmt) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  if (dstFmt === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  }
  const mime = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
  return new Blob([XLSX.write(wb, { bookType: dstFmt, type: 'array' })], { type: mime[dstFmt] });
}

// ── DOCX → PDF (mammoth + jsPDF + html2canvas) ───────────────────────────────
async function convertDocxToPdf(file) {
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:720px;padding:20px 30px;font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#000;background:#fff;';
  container.innerHTML = html;
  document.body.appendChild(container);
  const doc = new (window.jspdf.jsPDF)({ unit: 'pt', format: 'a4' });
  await new Promise(resolve => doc.html(container, {
    callback: resolve, margin: [45, 45, 45, 45],
    html2canvas: { scale: 0.72, useCORS: true, backgroundColor: '#ffffff' },
    width: 505, windowWidth: 760, x: 0, y: 0,
  }));
  document.body.removeChild(container);
  return doc.output('blob');
}

// ── TXT → PDF (jsPDF) ────────────────────────────────────────────────────────
async function convertTxtToPdf(file) {
  const doc    = new (window.jspdf.jsPDF)({ unit: 'pt', format: 'a4' });
  const pw     = doc.internal.pageSize.getWidth();
  const ph     = doc.internal.pageSize.getHeight();
  const margin = 50; const lh = 14; const maxW = pw - 2 * margin;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = margin;
  for (const line of (await file.text()).split('\n')) {
    for (const wl of doc.splitTextToSize(line || ' ', maxW)) {
      if (y + lh > ph - margin) { doc.addPage(); y = margin; }
      doc.text(wl, margin, y); y += lh;
    }
  }
  return doc.output('blob');
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateSliderFill();

window.clearAll         = clearAll;
window.convertAll       = convertAll;
window.downloadZip      = downloadZip;
window.onFormatChange   = onFormatChange;
window.removeFile       = removeFile;
window.setQuality       = setQuality;
window.onListDragOver   = onListDragOver;
window.onListDragLeave  = onListDragLeave;
window.onListDrop       = onListDrop;
