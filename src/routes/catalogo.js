// ===================== ROTAS: CATÁLOGO DE PRODUTOS PRÓPRIO =====================
// CRUD de produtos salvos em data/produtos.json (storage atômico)
// Catálogo 100% gerido neste sistema.
//
// Montado em /api/catalogo — NÃO em /api/produtos, pra não colidir com
// /api/produtos/estoque que vive no routes/api.js.

const express = require('express');
const path = require('path');
const fs = require('fs');

const {readJSON, writeJSONAtomic} = require('../utils/storage');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');

// ---- Helpers ----

function categoriaDoCodigo(codigo) {
    if (!codigo) return 'Sem categoria';
    const match = codigo.split(/[-_]/)[0];
    return match || 'Sem categoria';
}

function lerProdutos() {
    return readJSON(PRODUTOS_FILE, {proximo_id: 1, produtos: []});
}

function salvarProdutos(db) {
    writeJSONAtomic(PRODUTOS_FILE, db);
}

// ===================== LISTAGEM =====================

// GET /api/catalogo/catalogo — lista completa agrupada por categoria
router.get('/catalogo', (req, res) => {
    try {
        const db = lerProdutos();
        const agrupado = {};
        db.produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!agrupado[cat]) agrupado[cat] = [];
            agrupado[cat].push(p);
        });
        Object.values(agrupado).forEach(lista =>
            lista.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
        );
        res.json({success: true, data: agrupado, total: db.produtos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== CRUD =====================

// POST /api/catalogo/item — cria produto
router.post('/item', (req, res) => {
    try {
        const db = lerProdutos();
        const codigo = (req.body.codigo || '').trim();

        if (codigo && db.produtos.find(p => p.codigo === codigo)) {
            return res.status(400).json({success: false, error: `Código ${codigo} já existe`});
        }

        const novo = {
            id: db.proximo_id++,
            codigo,
            nome: (req.body.nome || '').trim(),
            categoria: (req.body.categoria || '').trim() || categoriaDoCodigo(codigo),
            preco: parseFloat(req.body.preco) || 0,
            unidade: (req.body.unidade || 'UN').trim(),
            fator: Math.max(1, parseInt(req.body.fator) || 1),
            observacoes: (req.body.observacoes || '').trim(),
            video_id: (req.body.video_id || '').trim(),
            data_cadastro: new Date().toISOString().split('T')[0]
        };

        db.produtos.push(novo);
        salvarProdutos(db);
        res.json({success: true, data: novo});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/item/:id — atualiza produto
router.put('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const atual = db.produtos[idx];

        // Se mudou o código, garante que não duplica outro
        const novoCodigo = req.body.codigo !== undefined ? req.body.codigo.trim() : atual.codigo;
        if (novoCodigo !== atual.codigo && db.produtos.find(p => p.codigo === novoCodigo && p.id !== id)) {
            return res.status(400).json({success: false, error: `Código ${novoCodigo} já existe`});
        }

        db.produtos[idx] = {
            ...atual,
            codigo: novoCodigo,
            nome: req.body.nome !== undefined ? req.body.nome.trim() : atual.nome,
            // Categoria explícita (select) tem prioridade; senão MANTÉM a atual
            // (não reseta pelo código — era o bug que jogava o produto de volta).
            categoria: (req.body.categoria !== undefined && String(req.body.categoria).trim())
                ? String(req.body.categoria).trim()
                : (atual.categoria || categoriaDoCodigo(novoCodigo)),
            preco: req.body.preco !== undefined ? (parseFloat(req.body.preco) || 0) : atual.preco,
            unidade: req.body.unidade !== undefined ? req.body.unidade.trim() : atual.unidade,
            fator: req.body.fator !== undefined ? Math.max(1, parseInt(req.body.fator) || 1) : (atual.fator || 1),
            observacoes: req.body.observacoes !== undefined ? req.body.observacoes.trim() : atual.observacoes,
            video_id: req.body.video_id !== undefined ? req.body.video_id.trim() : (atual.video_id || '')
        };

        salvarProdutos(db);
        res.json({success: true, data: db.produtos[idx]});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/catalogo/item/:id — remove produto
router.delete('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const removido = db.produtos.splice(idx, 1)[0];
        salvarProdutos(db);
        res.json({success: true, data: removido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/categoria/renomear — renomeia categoria em todos os produtos
router.put('/categoria/renomear', (req, res) => {
    try {
        const { categoria_atual, categoria_nova } = req.body;
        if (!categoria_atual || !categoria_nova) {
            return res.status(400).json({ success: false, error: 'categoria_atual e categoria_nova são obrigatórios' });
        }
        const db = lerProdutos();
        let atualizados = 0;
        db.produtos.forEach(p => {
            if (p.categoria === categoria_atual) {
                p.categoria = categoria_nova;
                atualizados++;
            }
        });
        if (atualizados === 0) {
            return res.status(404).json({ success: false, error: `Categoria "${categoria_atual}" não encontrada` });
        }
        salvarProdutos(db);
        res.json({ success: true, atualizados, categoria_nova });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/catalogo/categoria/:nome — remove a categoria movendo seus
// produtos para "Sem categoria" (os produtos NÃO são apagados).
router.delete('/categoria/:nome', (req, res) => {
    try {
        const nome = req.params.nome;
        const db = lerProdutos();
        let movidos = 0;
        db.produtos.forEach(p => {
            if ((p.categoria || 'Sem categoria') === nome) {
                p.categoria = '';
                movidos++;
            }
        });
        salvarProdutos(db);
        res.json({ success: true, movidos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const multer = require('multer');
const os = require('os');
const PRODUTOS_IMG_DIR = path.join(__dirname, '..', 'data', 'produtos');

// Temp dir separado — evita arquivos temporários poluindo a pasta de imagens
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (Nginx já limita a 10m)
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Formato inválido. Use JPG, PNG ou WEBP.'));
        }
        cb(null, true);
    }
});

function limparTemp(filepath) {
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
}

// PUT /api/catalogo/item/:id/imagem
router.put('/item/:id/imagem', upload.single('imagem'), (req, res) => {
    const tempPath = req.file?.path;
    try {
        if (!req.file || !tempPath) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);

        if (idx === -1) {
            limparTemp(tempPath);
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }

        if (!fs.existsSync(PRODUTOS_IMG_DIR)) fs.mkdirSync(PRODUTOS_IMG_DIR, { recursive: true });

        // Determina extensão — prioriza mimetype (mais seguro que o nome original)
        const mimeToExt = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
        const ext = mimeToExt[req.file.mimetype] || path.extname(req.file.originalname).toLowerCase() || '.jpg';

        const codigoSafe = db.produtos[idx].codigo.replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const nomeArquivo = `${codigoSafe}${ext}`;
        const destFinal = path.join(PRODUTOS_IMG_DIR, nomeArquivo);

        // Remove imagem anterior de extensão diferente (evita duplicatas .jpg e .png)
        const imagemAnterior = db.produtos[idx].imagem;
        if (imagemAnterior && imagemAnterior !== nomeArquivo) {
            limparTemp(path.join(PRODUTOS_IMG_DIR, imagemAnterior));
        }
        // Remove também qualquer versão antiga com extensão diferente
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].forEach(e => {
            if (e !== ext) limparTemp(path.join(PRODUTOS_IMG_DIR, `${codigoSafe}${e}`));
        });

        // Copia do temp para destino (copyFile é seguro cross-filesystem, ao contrário de rename)
        fs.copyFileSync(tempPath, destFinal);
        limparTemp(tempPath);

        // Verifica que o arquivo final existe e tem tamanho > 0
        const stat = fs.statSync(destFinal);
        if (stat.size === 0) {
            limparTemp(destFinal);
            return res.status(500).json({ success: false, error: 'Arquivo salvo corrompido (tamanho 0)' });
        }

        db.produtos[idx].imagem = nomeArquivo;
        db.produtos[idx].imagem_v = Date.now(); // versão p/ cache-bust
        salvarProdutos(db);

        res.json({ success: true, data: { imagem: nomeArquivo, url: `/data/produtos/${nomeArquivo}` } });
    } catch (err) {
        limparTemp(tempPath);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/catalogo/item/:id/imagem
router.delete('/item/:id/imagem', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const nomeArquivo = db.produtos[idx].imagem;
        if (nomeArquivo) {
            const filePath = path.join(PRODUTOS_IMG_DIR, nomeArquivo);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            db.produtos[idx].imagem = null;
            db.produtos[idx].imagem_v = Date.now();
            salvarProdutos(db);
        }

        res.json({success: true});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/catalogo/buscar?q=texto — autocomplete com foto
router.get('/buscar', (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const db = lerProdutos();

        let resultados = db.produtos;

        if (q) {
            resultados = resultados.filter(p =>
                (p.codigo || '').toLowerCase().includes(q) ||
                (p.nome || '').toLowerCase().includes(q) ||
                (p.categoria || '').toLowerCase().includes(q)
            );
        }

        // Limita a 20 resultados no autocomplete
        resultados = resultados.slice(0, 20).map(p => ({
            id: p.id,
            codigo: p.codigo,
            nome: p.nome,
            categoria: p.categoria,
            preco: p.preco,
            unidade: p.unidade,
            imagem: p.imagem || null,
            imagem_v: p.imagem_v || 1,
            fator: p.fator || 1
        }));

        res.json({success: true, data: resultados});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;