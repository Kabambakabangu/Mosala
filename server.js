const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = mysql.createPool({
  host:     process.env.MYSQLHOST,
  user:     process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port:     process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

async function initDB(){
  try{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profils (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(120) NOT NULL,
        metier VARCHAR(120) NOT NULL,
        commune VARCHAR(120) NOT NULL,
        description TEXT,
        contact VARCHAR(60),
        preuve_url LONGTEXT,
        badge ENUM('bronze','argent','or') DEFAULT 'bronze',
        vitrine_premium TINYINT(1) DEFAULT 0,
        consentement TINYINT(1) DEFAULT 0,
        cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS avis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profil_id INT NOT NULL,
        employeur_id VARCHAR(60) NOT NULL,
        note TINYINT NOT NULL,
        commentaire VARCHAR(180),
        reponse VARCHAR(180),
        cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profil_id) REFERENCES profils(id) ON DELETE CASCADE,
        UNIQUE KEY unique_avis (profil_id, employeur_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employeurs (
        id VARCHAR(60) PRIMARY KEY,
        type ENUM('particulier','entreprise','soustraitance','institution') NOT NULL,
        reference VARCHAR(120),
        verifie TINYINT(1) DEFAULT 0,
        cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS missions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employeur_id VARCHAR(60) NOT NULL,
        employeur_type VARCHAR(40),
        titre VARCHAR(150) NOT NULL,
        description TEXT,
        commune VARCHAR(120),
        budget VARCHAR(60),
        nombre_personnes INT DEFAULT 1,
        duree ENUM('courte','longue') DEFAULT 'courte',
        type_contrat VARCHAR(40) DEFAULT 'mission',
        contact VARCHAR(60),
        statut ENUM('ouverte','pourvue','fermee') DEFAULT 'ouverte',
        cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidatures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mission_id INT NOT NULL,
        profil_id INT NOT NULL,
        employeur_id VARCHAR(60) NOT NULL,
        statut ENUM('nouvelle','vue','acceptee','refusee') DEFAULT 'nouvelle',
        cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Toutes les tables OK');
  }catch(e){
    console.error('❌ Erreur initDB :', e.message);
  }
}

function badgeRank(b){ return { bronze:0, argent:1, or:2 }[b]; }
function computeEligible(avis){
  const n = avis.length;
  const a = n ? avis.reduce((s,x)=>s+x.note,0)/n : 0;
  if(n>=5 && a>=4) return 'or';
  if(n>=3 && a>=3) return 'argent';
  return 'bronze';
}
const BANNED = ['merde','connard','idiot','imbécile','fdp','ntm','salaud'];
function cleanComment(txt){
  if(!txt) return '';
  let t = String(txt).slice(0,180);
  BANNED.forEach(w => { t = t.replace(new RegExp(w,'gi'), '***'); });
  return t.trim();
}

app.get('/api/health', (req,res) => res.json({ ok:true, ts:Date.now() }));

/* PROFILS */
app.get('/api/profils', async (req,res) => {
  try {
    const { metier, commune } = req.query;
    let sql = `
      SELECT p.*, COALESCE(AVG(a.note),0) AS moyenne, COUNT(a.id) AS nb_avis
      FROM profils p LEFT JOIN avis a ON a.profil_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (metier)  { sql += ' AND p.metier LIKE ?';  params.push(`%${metier}%`); }
    if (commune) { sql += ' AND p.commune LIKE ?'; params.push(`%${commune}%`); }
    sql += ' GROUP BY p.id ORDER BY FIELD(p.badge,"or","argent","bronze"), moyenne DESC, nb_avis DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/profils/:id', async (req,res) => {
  try {
    const [profils] = await pool.query('SELECT * FROM profils WHERE id = ?', [req.params.id]);
    if (!profils.length) return res.status(404).json({ error:'Profil introuvable' });
    const [avis] = await pool.query(
      'SELECT id, note, commentaire, reponse, employeur_id, cree_le FROM avis WHERE profil_id = ? ORDER BY cree_le DESC',
      [req.params.id]
    );
    res.json({ ...profils[0], avis });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* Profil public (pour QR code) */
app.get('/api/public/profil/:id', async (req,res) => {
  try {
    const [profils] = await pool.query(
      'SELECT id, nom, metier, commune, description, contact, badge, vitrine_premium, preuve_url FROM profils WHERE id = ?',
      [req.params.id]
    );
    if (!profils.length) return res.status(404).json({ error:'Profil introuvable' });
    const [avis] = await pool.query(
      'SELECT note, commentaire, reponse FROM avis WHERE profil_id = ? ORDER BY cree_le DESC',
      [req.params.id]
    );
    res.json({ ...profils[0], avis });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/profils', async (req,res) => {
  try {
    const { nom, metier, commune, description, contact, consentement } = req.body;
    if (!nom) return res.status(400).json({ error:'Nom requis' });
    if (!consentement) return res.status(400).json({ error:'Consentement requis' });
    const [r] = await pool.query(
      `INSERT INTO profils (nom, metier, commune, description, contact, consentement)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [nom, metier||'Métier non précisé', commune||'—', description||'', contact||'—']
    );
    res.json({ id: r.insertId });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.put('/api/profils/:id/preuve', async (req,res) => {
  try {
    await pool.query('UPDATE profils SET preuve_url = ? WHERE id = ?', [req.body.preuve, req.params.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.put('/api/profils/:id/premium', async (req,res) => {
  try {
    await pool.query('UPDATE profils SET vitrine_premium = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* AVIS */
app.put('/api/avis/:id/reponse', async (req,res) => {
  try {
    await pool.query('UPDATE avis SET reponse = ? WHERE id = ?', [cleanComment(req.body.reponse), req.params.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/avis', async (req,res) => {
  try {
    const { profil_id, employeur_id, note, commentaire } = req.body;
    if (!profil_id || !employeur_id || !note) return res.status(400).json({ error:'Champs manquants' });
    if (note < 1 || note > 5) return res.status(400).json({ error:'Note entre 1 et 5' });

    const [existant] = await pool.query(
      'SELECT id FROM avis WHERE profil_id = ? AND employeur_id = ?',
      [profil_id, employeur_id]
    );
    if (existant.length) return res.status(409).json({ error:'Un avis par employeur est déjà enregistré' });

    await pool.query(
      'INSERT INTO avis (profil_id, employeur_id, note, commentaire) VALUES (?, ?, ?, ?)',
      [profil_id, employeur_id, note, cleanComment(commentaire)]
    );

    const [avis] = await pool.query('SELECT note FROM avis WHERE profil_id = ?', [profil_id]);
    const nouveau = computeEligible(avis);
    const [p] = await pool.query('SELECT badge FROM profils WHERE id = ?', [profil_id]);
    if (badgeRank(nouveau) > badgeRank(p[0].badge)) {
      await pool.query('UPDATE profils SET badge = ? WHERE id = ?', [nouveau, profil_id]);
    }
    res.json({ ok:true, badge:nouveau, nb_avis:avis.length });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* EMPLOYEURS */
app.post('/api/employeurs/verifier', async (req,res) => {
  try {
    const { id, type, reference } = req.body;
    await pool.query(
      `INSERT INTO employeurs (id, type, reference, verifie) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE type=VALUES(type), reference=VALUES(reference), verifie=1`,
      [id, type, reference||'']
    );
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* MISSIONS */
app.get('/api/missions', async (req,res) => {
  try {
    const { duree, commune, q } = req.query;
    let sql = 'SELECT * FROM missions WHERE statut = "ouverte"';
    const params = [];
    if (duree)   { sql += ' AND duree = ?';              params.push(duree); }
    if (commune) { sql += ' AND commune LIKE ?';         params.push(`%${commune}%`); }
    if (q)       { sql += ' AND (titre LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY cree_le DESC LIMIT 60';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/missions', async (req,res) => {
  try {
    const { employeur_id, employeur_type, titre, description, commune, budget, nombre_personnes, duree, type_contrat, contact } = req.body;
    if (!titre) return res.status(400).json({ error: 'Titre requis' });
    const [r] = await pool.query(
      `INSERT INTO missions (employeur_id, employeur_type, titre, description, commune, budget, nombre_personnes, duree, type_contrat, contact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employeur_id||'anon', employeur_type||'particulier', titre,
       description||'', commune||'', budget||'', nombre_personnes||1,
       duree||'courte', type_contrat||'mission', contact||'']
    );
    res.json({ id: r.insertId });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* CANDIDATURES */
app.post('/api/missions/:id/postuler', async (req,res) => {
  try {
    const { profil_id, employeur_id } = req.body;
    await pool.query(
      `INSERT INTO candidatures (mission_id, profil_id, employeur_id) VALUES (?, ?, ?)`,
      [req.params.id, profil_id, employeur_id]
    );
    res.json({ ok: true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/employeurs/:empId/candidatures', async (req,res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, m.titre AS mission_titre,
             p.nom AS profil_nom, p.metier AS profil_metier,
             p.commune AS profil_commune, p.contact AS profil_contact
      FROM candidatures c
      LEFT JOIN missions m ON m.id = c.mission_id
      LEFT JOIN profils p ON p.id = c.profil_id
      WHERE c.employeur_id = ?
      ORDER BY c.cree_le DESC LIMIT 30
    `, [req.params.empId]);
    res.json(rows);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* STATS */
app.get('/api/stats', async (req,res) => {
  try {
    const [parCommune] = await pool.query('SELECT commune, COUNT(*) AS total FROM profils GROUP BY commune ORDER BY total DESC');
    const [parMetier]  = await pool.query('SELECT metier,  COUNT(*) AS total FROM profils GROUP BY metier  ORDER BY total DESC');
    const [parBadge]   = await pool.query('SELECT badge,   COUNT(*) AS total FROM profils GROUP BY badge');
    const [totaux]     = await pool.query('SELECT COUNT(*) AS profils FROM profils');
    const [avisCount]  = await pool.query('SELECT COUNT(*) AS avis FROM avis');
    const [missionsCount] = await pool.query('SELECT COUNT(*) AS missions FROM missions WHERE statut="ouverte"');
    res.json({
      total_profils: totaux[0].profils,
      total_avis: avisCount[0].avis,
      total_missions: missionsCount[0].missions,
      par_commune: parCommune,
      par_metier: parMetier,
      par_badge: parBadge
    });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

/* Frontend */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ ZUA MOSALA en ligne sur le port ${PORT}`));
});
