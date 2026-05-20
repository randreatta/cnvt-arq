from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import uuid
import shutil
import subprocess
from pathlib import Path

app = FastAPI(title="cnvt-arq")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

IMAGE_FORMATS = {"jpeg", "jpg", "png", "webp", "bmp", "gif", "tiff", "tif"}

# Formatos de saída onde o parâmetro "quality" é aplicado
LOSSY_OUTPUT = {"jpeg", "jpg", "webp"}

CONVERSION_MAP = {
    # Planilhas
    "csv":  ["xlsx", "xls"],
    "xlsx": ["csv", "xls"],
    "xls":  ["csv", "xlsx"],
    # Documentos
    "docx": ["pdf"],
    "txt":  ["pdf"],
    # Imagens (não oferece o mesmo formato de origem como saída)
    "jpeg": ["png", "webp", "bmp", "pdf"],
    "jpg":  ["png", "webp", "bmp", "pdf"],
    "png":  ["jpeg", "webp", "bmp", "pdf"],
    "webp": ["jpeg", "png", "bmp", "pdf"],
    "bmp":  ["jpeg", "png", "webp", "pdf"],
    "gif":  ["jpeg", "png", "webp", "pdf"],
    "tiff": ["jpeg", "png", "webp", "bmp", "pdf"],
    "tif":  ["jpeg", "png", "webp", "bmp", "pdf"],
}

FORMAT_NAMES = {
    "csv":  "CSV",
    "xlsx": "Excel Moderno (.xlsx)",
    "xls":  "Excel Legado (.xls)",
    "docx": "Word Document (.docx)",
    "pdf":  "PDF",
    "txt":  "Texto Simples (.txt)",
    "jpeg": "JPEG",
    "jpg":  "JPEG",
    "png":  "PNG",
    "webp": "WebP",
    "bmp":  "BMP",
    "gif":  "GIF",
    "tiff": "TIFF",
    "tif":  "TIFF",
}

FORMAT_MIME = {
    "csv":  "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls":  "application/vnd.ms-excel",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf":  "application/pdf",
    "txt":  "text/plain",
    "jpeg": "image/jpeg",
    "jpg":  "image/jpeg",
    "png":  "image/png",
    "webp": "image/webp",
    "bmp":  "image/bmp",
    "gif":  "image/gif",
    "tiff": "image/tiff",
    "tif":  "image/tiff",
}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    original_name = file.filename or "arquivo"
    ext = Path(original_name).suffix.lower().lstrip(".")

    if not ext:
        raise HTTPException(400, detail="Não foi possível detectar o formato do arquivo.")

    if ext not in CONVERSION_MAP:
        supported = ", ".join(k.upper() for k in sorted(CONVERSION_MAP))
        raise HTTPException(
            400,
            detail=f"Formato '.{ext}' não suportado. Formatos aceitos: {supported}.",
        )

    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}.{ext}"

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    size = file_path.stat().st_size

    return {
        "file_id": file_id,
        "original_name": original_name,
        "detected_format": ext,
        "detected_format_name": FORMAT_NAMES.get(ext, ext.upper()),
        "file_size": size,
        "available_conversions": [
            {
                "format": fmt,
                "name": FORMAT_NAMES.get(fmt, fmt.upper()),
                "quality_supported": fmt in LOSSY_OUTPUT,
            }
            for fmt in CONVERSION_MAP[ext]
        ],
    }


class ConvertRequest(BaseModel):
    file_id: str
    target_format: str
    original_name: str = "arquivo"
    quality: int = 85   # usado para JPEG e WebP (1–100)


@app.post("/api/convert")
async def convert_file(req: ConvertRequest):
    source_files = list(UPLOAD_DIR.glob(f"{req.file_id}.*"))
    if not source_files:
        raise HTTPException(404, detail="Arquivo não encontrado. Faça o upload novamente.")

    source_path = source_files[0]
    source_ext  = source_path.suffix.lower().lstrip(".")
    target_fmt  = req.target_format.lower()
    quality     = max(1, min(100, req.quality))

    if target_fmt not in CONVERSION_MAP.get(source_ext, []):
        raise HTTPException(
            400,
            detail=f"Conversão de {source_ext.upper()} para {target_fmt.upper()} não suportada.",
        )

    output_id   = str(uuid.uuid4())
    output_path = UPLOAD_DIR / f"{output_id}.{target_fmt}"

    try:
        spreadsheet = ("csv", "xlsx", "xls")
        if source_ext in spreadsheet and target_fmt in spreadsheet:
            _convert_spreadsheet(source_path, output_path, source_ext, target_fmt)
        elif source_ext in IMAGE_FORMATS:
            _convert_image(source_path, output_path, source_ext, target_fmt, quality)
        elif source_ext == "docx" and target_fmt == "pdf":
            _convert_docx_to_pdf(source_path, output_path)
        elif source_ext == "txt" and target_fmt == "pdf":
            _convert_txt_to_pdf(source_path, output_path)
        else:
            raise HTTPException(400, detail="Conversão não implementada.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"Erro na conversão: {str(e)}")

    stem          = Path(req.original_name).stem
    download_name = f"{stem}_convertido.{target_fmt}"

    return {
        "download_id":   output_id,
        "download_name": download_name,
        "format":        target_fmt,
    }


@app.get("/api/download/{download_id}")
async def download_file(download_id: str, filename: str = "arquivo"):
    files = list(UPLOAD_DIR.glob(f"{download_id}.*"))
    if not files:
        raise HTTPException(404, detail="Arquivo convertido não encontrado.")

    file_path  = files[0]
    ext        = file_path.suffix.lower().lstrip(".")
    media_type = FORMAT_MIME.get(ext, "application/octet-stream")

    return FileResponse(path=file_path, filename=filename, media_type=media_type)


# ── conversão de imagens ──────────────────────────────────────────────────────

def _convert_image(src: Path, dst: Path, src_fmt: str, dst_fmt: str, quality: int = 85):
    try:
        from PIL import Image
    except ImportError:
        raise Exception("Pillow não instalado. Execute: pip install Pillow")

    img = Image.open(src)

    # Para GIFs animados, pega apenas o primeiro quadro
    if hasattr(img, "n_frames") and img.n_frames > 1:
        img.seek(0)
        img = img.copy()

    # JPEG e BMP não suportam transparência: converte para RGB
    if dst_fmt in ("jpeg", "jpg", "bmp"):
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

    # PDF também precisa de RGB
    if dst_fmt == "pdf" and img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    fmt_map = {
        "jpeg": "JPEG", "jpg": "JPEG",
        "png":  "PNG",
        "webp": "WEBP",
        "bmp":  "BMP",
        "gif":  "GIF",
        "tiff": "TIFF", "tif": "TIFF",
        "pdf":  "PDF",
    }
    pil_fmt = fmt_map.get(dst_fmt, dst_fmt.upper())

    save_kwargs: dict = {}
    if dst_fmt in ("jpeg", "jpg"):
        save_kwargs = {"quality": quality, "optimize": True}
    elif dst_fmt == "webp":
        save_kwargs = {"quality": quality, "method": 6}
    elif dst_fmt == "png":
        save_kwargs = {"optimize": True}
    elif dst_fmt == "pdf":
        save_kwargs = {"resolution": 150}

    img.save(dst, format=pil_fmt, **save_kwargs)


# ── conversão de planilhas ────────────────────────────────────────────────────

def _convert_spreadsheet(src: Path, dst: Path, src_fmt: str, dst_fmt: str):
    if src_fmt == "csv":
        df = pd.read_csv(src, encoding="utf-8-sig")
    elif src_fmt == "xlsx":
        df = pd.read_excel(src, engine="openpyxl")
    elif src_fmt == "xls":
        df = pd.read_excel(src, engine="xlrd")

    if dst_fmt == "csv":
        df.to_csv(dst, index=False, encoding="utf-8-sig")
    elif dst_fmt == "xlsx":
        df.to_excel(dst, index=False, engine="openpyxl")
    elif dst_fmt == "xls":
        _write_xls_direct(df, dst)


def _write_xls_direct(df: pd.DataFrame, path: Path):
    try:
        import xlwt
    except ImportError:
        raise Exception("xlwt não instalado. Execute: pip install xlwt")

    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("Planilha1")

    for col_idx, col_name in enumerate(df.columns):
        ws.write(0, col_idx, str(col_name))

    for row_idx, row in enumerate(df.itertuples(index=False), start=1):
        for col_idx, value in enumerate(row):
            if pd.isna(value):
                ws.write(row_idx, col_idx, "")
            else:
                ws.write(row_idx, col_idx, value)

    wb.save(str(path))


# ── conversão de documentos ───────────────────────────────────────────────────

def _convert_docx_to_pdf(src: Path, dst: Path):
    for cmd in ["libreoffice", "soffice"]:
        try:
            subprocess.run(
                [cmd, "--headless", "--convert-to", "pdf", "--outdir", str(dst.parent), str(src)],
                capture_output=True,
                timeout=60,
            )
            lo_out = dst.parent / (src.stem + ".pdf")
            if lo_out.exists():
                shutil.move(str(lo_out), str(dst))
                return
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    try:
        from docx2pdf import convert
        convert(str(src), str(dst))
        if dst.exists():
            return
    except Exception:
        pass

    raise Exception(
        "Nenhum conversor disponível para DOCX → PDF.\n"
        "Opção A: instale o LibreOffice → brew install --cask libreoffice\n"
        "Opção B: tenha o Microsoft Word instalado e execute: pip install docx2pdf"
    )


def _convert_txt_to_pdf(src: Path, dst: Path):
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import A4
    except ImportError:
        raise Exception("reportlab não instalado. Execute: pip install reportlab")

    c          = canvas.Canvas(str(dst), pagesize=A4)
    width, height = A4
    margin     = 60
    line_height = 15
    font_size  = 11

    c.setFont("Helvetica", font_size)

    with open(src, "r", encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()

    y         = height - margin
    max_chars = int((width - 2 * margin) / (font_size * 0.55))

    for line in lines:
        if not line:
            y -= line_height
            if y < margin:
                c.showPage()
                c.setFont("Helvetica", font_size)
                y = height - margin
            continue

        while line:
            chunk, line = line[:max_chars], line[max_chars:]
            if y < margin:
                c.showPage()
                c.setFont("Helvetica", font_size)
                y = height - margin
            c.drawString(margin, y, chunk)
            y -= line_height

    c.save()


app.mount("/", StaticFiles(directory="static", html=True), name="static")
