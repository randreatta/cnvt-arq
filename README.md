# cnvt-arq

Conversor de arquivos online — roda 100% no navegador, sem servidores.  
Acesse em: **https://randreatta.github.io/cnvt-arq/**

---

## Formatos suportados

| Categoria   | Entrada                          | Saída possível             |
|-------------|----------------------------------|----------------------------|
| Planilhas   | CSV, XLSX, XLS                   | CSV, XLSX, XLS             |
| Documentos  | DOCX, TXT                        | PDF                        |
| Imagens     | JPEG, PNG, WebP, GIF, BMP, TIFF  | JPEG, PNG, WebP, PDF       |

## Funcionalidades

- **Conversão em lote** — até 20 arquivos por vez
- **Formato individual** — cada arquivo pode ter um destino diferente
- **Controle de qualidade** — slider de 1–100% para saídas JPEG e WebP
- **Download em ZIP** — todos os arquivos convertidos em um único arquivo
- **Privacidade** — nenhum arquivo é enviado a servidores; tudo é processado localmente no navegador

## Tecnologias

- [SheetJS](https://sheetjs.com/) — conversão de planilhas
- [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://html2canvas.hertzen.com/) — geração de PDF
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) — leitura de DOCX
- [JSZip](https://stuk.github.io/jszip/) — empacotamento em ZIP
- Canvas API nativa — conversão entre formatos de imagem
