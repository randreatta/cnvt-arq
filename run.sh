#!/usr/bin/env bash
set -e

echo ""
echo "=============================="
echo "   Conversor de Arquivos"
echo "=============================="
echo ""

# Verifica Python 3
if ! command -v python3 &>/dev/null; then
  echo "ERRO: Python 3 nao encontrado."
  echo "Instale em https://www.python.org ou via Homebrew: brew install python3"
  exit 1
fi

# Cria venv se necessário
if [ ! -d "venv" ]; then
  echo "Criando ambiente virtual..."
  python3 -m venv venv
fi

# Ativa venv
# shellcheck disable=SC1091
source venv/bin/activate

# Instala dependências
echo "Instalando dependencias..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Garante diretórios necessários
mkdir -p uploads static

echo ""
echo "Servidor iniciado!"
echo "Acesse: http://localhost:8000"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
