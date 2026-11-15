import sys, json, re, base64

def parse_pdf_data(data):
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(data))
        lines = []
        for page in reader.pages:
            t = page.extract_text() or ''
            for l in t.split('\n'):
                s = l.strip()
                if s:
                    lines.append(s)
    except Exception as e:
        return []

    expenses = []
    for l in lines:
        amounts = re.findall(r'R\$\s*([0-9.,]+)', l)
        if not amounts:
            continue
        val_str = amounts[0]
        val = float(val_str.replace('.', '').replace(',', '.'))
        if val <= 0.0:
            continue
        
        date_m = re.search(r'([0-3][0-9]/[0-1][0-9](?:/20[0-9]{2})?)', l)
        date = date_m.group(1)[:5] if date_m else '14/11'
        
        desc = l
        if date_m:
            desc = l[:date_m.start()].strip()
        
        low = desc.lower()
        if any(k in low for k in ['recebido', 'viracrédito', 'resgate', 'crédito para pix', 'saldo', 'total', 'limite']):
            continue
        
        cat = 'OTHER'
        if any(k in low for k in ['restaurante', 'food', 'lanche', 'ifood', 'denfer', 'almoço', 'jantar']):
            cat = 'FOOD'
        elif any(k in low for k in ['distribuidora', 'mercado', 'alimentos', 'parada 97', 'sendas', 'produtos naturais', 'hortifruti', 'padaria']):
            cat = 'GROCERIES'
        elif any(k in low for k in ['uber', '99', 'transporte', 'táxi', 'onibus']):
            cat = 'TRANSPORT'
        elif any(k in low for k in ['bebidas', 'cerveja', 'bar']):
            cat = 'LEISURE'
        elif any(k in low for k in ['fatura', 'pagamento', 'aluguel', 'condominio', 'luz', 'energia']):
            cat = 'HOUSING'
        elif any(k in low for k in ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'remedio']):
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
    payload = json.dumps({'streams': 1, 'text': 'PDF parsed via Agent OCR', 'transactions': txs, 'totalAmount': total})
    
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(payload)
    else:
        print(payload)
