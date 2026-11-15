import sys, json, re, base64, datetime

def detect_kind(data):
    """Detecta o tipo do arquivo por magic bytes, ignorando a extensao."""
    if data.startswith(b'%PDF-'):
        return 'pdf'
    if data.startswith(b'\x89PNG'):
        return 'png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpeg'
    if data.startswith(b'PK'):
        return 'docx'
    return 'unknown'


def lines_from_pdf(data):
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(data))
    lines = []
    for page in reader.pages:
        t = page.extract_text() or ''
        lines.extend(l.strip() for l in t.split('\n') if l.strip())
    return lines


def lines_from_docx(data):
    import io
    from docx import Document
    doc = Document(io.BytesIO(data))
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                lines.append(' '.join(cells))
    return lines


def lines_from_image(data):
    """OCR para PNG/JPEG: escala de cinza, contraste e ampliacao antes do Tesseract."""
    import io
    from PIL import Image, ImageOps
    import pytesseract
    img = Image.open(io.BytesIO(data))
    if img.mode in ('RGBA', 'LA', 'P'):
        # Prints com transparencia: achata sobre fundo branco.
        img = img.convert('RGBA')
        bg = Image.new('RGBA', img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img)
    img = ImageOps.grayscale(img.convert('RGB'))
    img = ImageOps.autocontrast(img, cutoff=1)
    if max(img.size) < 1800:
        factor = 1800 / max(img.size)
        img = img.resize((int(img.width * factor), int(img.height * factor)), Image.LANCZOS)
    text = pytesseract.image_to_string(img, lang='por+eng', config='--psm 6 -c preserve_interword_spaces=1')
    return [l.strip() for l in text.split('\n') if l.strip()]


def has_word(text, words):
    """Casa palavras inteiras, evitando falsos positivos como 'bar' em 'barbosa'."""
    return any(re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', text) for w in words)


def parse_pdf_data(data):
    kind = detect_kind(data)
    try:
        if kind == 'pdf':
            lines = lines_from_pdf(data)
        elif kind in ('png', 'jpeg'):
            lines = lines_from_image(data)
        elif kind == 'docx':
            lines = lines_from_docx(data)
        else:
            return []
    except Exception as e:
        return []

    expenses = []
    for l in lines:
        amounts = re.findall(r'R[$S]\s*([0-9]+(?:\.[0-9]{3})*(?:,[0-9]{2})?)', l)
        if not amounts:
            continue
        val_str = amounts[0]
        val = float(val_str.replace('.', '').replace(',', '.'))
        if val <= 0.0:
            continue
        
        date_m = re.search(r'([0-3][0-9]/[0-1][0-9](?:/20[0-9]{2})?)', l)
        date = date_m.group(1)[:5] if date_m else datetime.date.today().strftime('%d/%m')
        
        desc = l
        if date_m:
            desc = l[:date_m.start()].strip()
        
        low = desc.lower()
        if any(k in low for k in ['recebido', 'viracrédito', 'resgate', 'crédito para pix', 'saldo', 'total', 'limite']):
            continue
        
        cat = 'OTHER'  # sem estabelecimento claro, nao inventa categoria
        if has_word(low, ['restaurante', 'food', 'lanche', 'ifood', 'denfer', 'almoço', 'jantar']):
            cat = 'FOOD'
        elif has_word(low, ['distribuidora', 'mercado', 'alimentos', 'parada 97', 'sendas', 'produtos naturais', 'hortifruti', 'padaria']):
            cat = 'GROCERIES'
        elif has_word(low, ['uber', '99', 'transporte', 'táxi', 'onibus']):
            cat = 'TRANSPORT'
        elif has_word(low, ['bebidas', 'cerveja', 'bar']):
            cat = 'LEISURE'
        elif has_word(low, ['fatura', 'pagamento', 'aluguel', 'condominio', 'luz', 'energia']):
            cat = 'HOUSING'
        elif has_word(low, ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'remedio']):
            cat = 'PHARMA'
        
        clean_desc = desc
        for pfx in ['PIX enviado para ', 'Pix crédito ', 'PIX ', 'Pix ']:
            if clean_desc.startswith(pfx):
                clean_desc = clean_desc[len(pfx):].strip()
        
        if clean_desc:
            expenses.append({
                'date': date,
                'description': clean_desc[:40].strip(),
                'amount': val,
                'category': cat
            })
    return expenses

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            b64 = f.read().strip()
    else:
        b64 = sys.stdin.read().strip()
    
    if b64.startswith('data:'):
        b64 = b64.split(',', 1)[1]
    raw = base64.b64decode(b64)
    txs = parse_pdf_data(raw)
    total = sum(t['amount'] for t in txs)
    payload = json.dumps({'streams': 1, 'text': 'Arquivo lido via Agent OCR', 'transactions': txs, 'totalAmount': total})
    
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(payload)
    else:
        print(payload)
