const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = mysql.createPool({
  host: process.env.MYSQLHOST, user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD, database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT, waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4'
});

const hashPwd = p => crypto.createHash('sha256').update(String(p)).digest('hex');
const genToken = () => crypto.randomBytes(24).toString('hex');
const genCode6 = () => Math.floor(100000 + Math.random() * 900000).toString();

/* ================= INIT + MIGRATIONS ================= */
async function initDB(){
  try {
    /* === MIGRATIONS SAFE === */
    const migrations = [
      `ALTER TABLE comptes ADD COLUMN telephone VARCHAR(30) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_categorie VARCHAR(40) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_secteur VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN profil_id INT DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_id VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN code_sms VARCHAR(10) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN code_sms_expire DATETIME DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN prenom VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN nom VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN vitrine_premium TINYINT(1) DEFAULT 0`,
      `ALTER TABLE profils ADD COLUMN preuve_type VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_lien VARCHAR(255) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_referent VARCHAR(120) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN signale TINYINT(1) DEFAULT 0`,
      `ALTER TABLE missions ADD COLUMN duree ENUM('courte','longue') DEFAULT 'courte'`,
      `ALTER TABLE missions ADD COLUMN type_contrat VARCHAR(40) DEFAULT 'mission'`,
      `ALTER TABLE missions ADD COLUMN contact VARCHAR(60) DEFAULT ''`
    ];
    for (const sql of migrations) {
      try { await pool.query(sql); } catch(e) {}
    }

    /* === CRÉATION DES TABLES === */
    await pool.query(`CREATE TABLE IF NOT EXISTS profils (
      id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(120) NOT NULL,
      metier VARCHAR(120) NOT NULL, commune VARCHAR(120) NOT NULL,
      description TEXT, contact VARCHAR(60), preuve_url LONGTEXT,
      preuve_type VARCHAR(20) DEFAULT NULL, preuve_lien VARCHAR(255) DEFAULT NULL,
      preuve_referent VARCHAR(120) DEFAULT NULL,
      badge ENUM('bronze','argent','or') DEFAULT 'bronze',
      vitrine_premium TINYINT(1) DEFAULT 0, signale TINYINT(1) DEFAULT 0,
      consentement TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS avis (
      id INT AUTO_INCREMENT PRIMARY KEY, profil_id INT NOT NULL,
      employeur_id VARCHAR(60) NOT NULL, note TINYINT NOT NULL,
      commentaire VARCHAR(180), reponse VARCHAR(180),
      signale TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_avis (profil_id, employeur_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS employeurs (
      id VARCHAR(60) PRIMARY KEY,
      categorie ENUM('particulier','entreprise','soustraitance','institution') NOT NULL,
      secteur VARCHAR(80) DEFAULT NULL,
      reference VARCHAR(120), verifie TINYINT(1) DEFAULT 0,
      en_attente TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS missions (
      id INT AUTO_INCREMENT PRIMARY KEY, employeur_id VARCHAR(60) NOT NULL,
      employeur_type VARCHAR(40), titre VARCHAR(150) NOT NULL,
      description TEXT, commune VARCHAR(120), budget VARCHAR(60),
      nombre_personnes INT DEFAULT 1, duree ENUM('courte','longue') DEFAULT 'courte',
      type_contrat VARCHAR(40) DEFAULT 'mission', contact VARCHAR(60),
      statut ENUM('ouverte','pourvue','fermee') DEFAULT 'ouverte',
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS candidatures (
      id INT AUTO_INCREMENT PRIMARY KEY, mission_id INT NOT NULL,
      profil_id INT NOT NULL, employeur_id VARCHAR(60) NOT NULL,
      statut ENUM('nouvelle','vue','acceptee','refusee') DEFAULT 'nouvelle',
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS comptes (
      id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(160) NOT NULL UNIQUE,
      password_hash VARCHAR(120) NOT NULL,
      type ENUM('jeune','employeur') NOT NULL,
      telephone VARCHAR(30) DEFAULT NULL,
      prenom VARCHAR(80) DEFAULT NULL, nom VARCHAR(80) DEFAULT NULL,
      employeur_categorie VARCHAR(40) DEFAULT NULL,
      employeur_secteur VARCHAR(80) DEFAULT NULL,
      profil_id INT DEFAULT NULL, employeur_id VARCHAR(60) DEFAULT NULL,
      code_sms VARCHAR(10) DEFAULT NULL, code_sms_expire DATETIME DEFAULT NULL,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(80) PRIMARY KEY, compte_id INT NOT NULL,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY, compte_id INT NOT NULL,
      type VARCHAR(40) NOT NULL, titre VARCHAR(120), message VARCHAR(240),
      lien VARCHAR(120), lu TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS signalements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cible_type ENUM('profil','avis','photo') NOT NULL,
      cible_id INT NOT NULL, motif VARCHAR(200),
      signale_par INT DEFAULT NULL,
      statut ENUM('nouveau','traite','rejete') DEFAULT 'nouveau',
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS recherches_sauvegardees (
      id INT AUTO_INCREMENT PRIMARY KEY, compte_id INT NOT NULL,
      metier VARCHAR(120), commune VARCHAR(120),
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    console.log('✓ Toutes les tables OK');
  } catch(e){ console.error('❌ initDB :', e.message); }
}

/* ================= HELPERS ================= */
function badgeRank(b){ return {bronze:0,argent:1,or:2}[b] || 0; }
function computeEligible(avis){
  const n = avis.length;
  const a = n ? avis.reduce((s,x)=>s+x.note,0)/n : 0;
  if (n>=5 && a>=4) return 'or';
  if (n>=3 && a>=3) return 'argent';
  return 'bronze';
}
const BANNED = ['merde','connard','idiot','imbécile','fdp','ntm','salaud'];
function cleanComment(t){
  if(!t) return '';
  let s = String(t).slice(0,180);
  BANNED.forEach(w => { s = s.replace(new RegExp(w,'gi'),'***'); });
  return s.trim();
}

async function auth(req,res,next){
  const t = req.headers['x-auth-token'];
  if (!t) return res.status(401).json({ error:'Non authentifié' });
  try {
    const [r] = await pool.query(
      `SELECT c.* FROM sessions s JOIN comptes c ON c.id=s.compte_id WHERE s.token=?`, [t]
    );
    if (!r.length) return res.status(401).json({ error:'Session expirée' });
    req.compte = r[0]; next();
  } catch(e){ res.status(500).json({ error:e.message }); }
}

async function notifier(compteId, type, titre, message, lien){
  try {
    await pool.query(
      'INSERT INTO notifications (compte_id,type,titre,message,lien) VALUES (?,?,?,?,?)',
      [compteId, type, titre, message, lien||'']
    );
  } catch(e){}
}

app.get('/api/health', (_,r) => r.json({ ok:true, ts:Date.now() }));

/* ================= AUTH — Inscription ================= */
app.post('/api/auth/inscription', async (req,res) => {
  try {
    const { email, password, type, telephone, prenom, nom, employeur_categorie, employeur_secteur } = req.body;
    if (!email || !password) return res.status(400).json({ error:'Email et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error:'Mot de passe : 6 caractères minimum' });
    if (!['jeune','employeur'].includes(type)) return res.status(400).json({ error:'Type invalide' });

    const [e] = await pool.query('SELECT id FROM comptes WHERE email=?', [email]);
    if (e.length) return res.status(409).json({ error:'Cet email est déjà utilisé' });

    const cat = type==='employeur' ? (employeur_categorie || 'particulier') : null;
    const secteur = type==='employeur' ? (employeur_secteur || null) : null;

    const [r] = await pool.query(
      `INSERT INTO comptes (email,password_hash,type,telephone,prenom,nom,employeur_categorie,employeur_secteur)
       VALUES (?,?,?,?,?,?,?,?)`,
      [email, hashPwd(password), type, telephone||null, prenom||null, nom||null, cat, secteur]
    );
    const token = genToken();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, r.insertId]);
    res.json({ ok:true, token, compte_id:r.insertId, type, employeur_categorie:cat });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= AUTH — Connexion ================= */
app.post('/api/auth/connexion', async (req,res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error:'Champs requis' });
    const [r] = await pool.query('SELECT * FROM comptes WHERE email=?', [email]);
    if (!r.length || r[0].password_hash !== hashPwd(password))
      return res.status(401).json({ error:'Email ou mot de passe incorrect' });
    const c = r[0];
    const token = genToken();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, c.id]);
    res.json({
      ok:true, token, compte_id:c.id, type:c.type,
      profil_id:c.profil_id, employeur_id:c.employeur_id,
      employeur_categorie:c.employeur_categorie
    });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= AUTH — Connexion par SMS (code) ================= */
app.post('/api/auth/sms/envoyer', async (req,res) => {
  try {
    const { telephone } = req.body;
    if (!telephone) return res.status(400).json({ error:'Numéro requis' });
    const [r] = await pool.query('SELECT id FROM comptes WHERE telephone=?', [telephone]);
    if (!r.length) return res.status(404).json({ error:'Aucun compte lié à ce numéro' });
    const code = genCode6();
    const exp = new Date(Date.now() + 10*60*1000);
    await pool.query('UPDATE comptes SET code_sms=?, code_sms_expire=? WHERE id=?', [code, exp, r[0].id]);
    // Simulation : on renvoie le code en clair (à remplacer par un vrai SMS gateway en prod)
    console.log(`[SMS] ${telephone} → code ${code}`);
    res.json({ ok:true, message:'Code envoyé', demo_code: code });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/auth/sms/verifier', async (req,res) => {
  try {
    const { telephone, code } = req.body;
    if (!telephone || !code) return res.status(400).json({ error:'Champs requis' });
    const [r] = await pool.query(
      'SELECT * FROM comptes WHERE telephone=? AND code_sms=? AND code_sms_expire > NOW()',
      [telephone, code]
    );
    if (!r.length) return res.status(401).json({ error:'Code invalide ou expiré' });
    const c = r[0];
    await pool.query('UPDATE comptes SET code_sms=NULL, code_sms_expire=NULL WHERE id=?', [c.id]);
    const token = genToken();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, c.id]);
    res.json({
      ok:true, token, compte_id:c.id, type:c.type,
      profil_id:c.profil_id, employeur_id:c.employeur_id,
      employeur_categorie:c.employeur_categorie
    });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= AUTH — Déconnexion / refresh / mot de passe oublié ================= */
app.post('/api/auth/deconnexion', auth, async (req,res) => {
  const t = req.headers['x-auth-token'];
  await pool.query('DELETE FROM sessions WHERE token=?', [t]);
  res.json({ ok:true });
});

app.get('/api/auth/moi', auth, async (req,res) => {
  const c = req.compte;
  res.json({
    id:c.id, email:c.email, type:c.type,
    prenom:c.prenom, nom:c.nom, telephone:c.telephone,
    profil_id:c.profil_id, employeur_id:c.employeur_id,
    employeur_categorie:c.employeur_categorie, employeur_secteur:c.employeur_secteur
  });
});

app.post('/api/auth/recover', async (req,res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error:'Email requis' });
    const [r] = await pool.query('SELECT id FROM comptes WHERE email=?', [email]);
    // Toujours répondre OK pour ne pas révéler l'existence du compte
    res.json({ ok:true, message:'Si un compte existe, un lien de récupération a été envoyé.' });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= PROFILS ================= */
app.get('/api/profils', async (req,res) => {
  try {
    const { metier, commune } = req.query;
    let sql = `
      SELECT p.*, COALESCE(AVG(a.note),0) AS moyenne, COUNT(a.id) AS nb_avis
      FROM profils p LEFT JOIN avis a ON a.profil_id = p.id
      WHERE p.signale = 0
    `;
    const params = [];
    if (metier) { sql += ' AND p.metier LIKE ?'; params.push(`%${metier}%`); }
    if (commune){ sql += ' AND p.commune LIKE ?'; params.push(`%${commune}%`); }
    sql += ' GROUP BY p.id ORDER BY FIELD(p.badge,"or","argent","bronze"), moyenne DESC, nb_avis DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/profils/:id', async (req,res) => {
  try {
    const [p] = await pool.query('SELECT * FROM profils WHERE id=?', [req.params.id]);
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query(
      'SELECT id,note,commentaire,reponse,employeur_id,cree_le FROM avis WHERE profil_id=? AND signale=0 ORDER BY cree_le DESC',
      [req.params.id]
    );
    res.json({ ...p[0], avis:a });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/public/profil/:id', async (req,res) => {
  try {
    const [p] = await pool.query(
      'SELECT id,nom,metier,commune,description,contact,badge,vitrine_premium,preuve_url,preuve_lien FROM profils WHERE id=? AND signale=0',
      [req.params.id]
    );
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query(
      'SELECT note,commentaire,reponse FROM avis WHERE profil_id=? AND signale=0 ORDER BY cree_le DESC',
      [req.params.id]
    );
    res.json({ ...p[0], avis:a });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/profils', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (req.compte.profil_id) return res.status(409).json({ error:'Tu as déjà un profil' });
    const { nom, metier, commune, description, contact, consentement } = req.body;
    if (!nom) return res.status(400).json({ error:'Nom requis' });
    if (!consentement) return res.status(400).json({ error:'Consentement requis' });
    const [r] = await pool.query(
      'INSERT INTO profils (nom,metier,commune,description,contact,consentement) VALUES (?,?,?,?,?,1)',
      [nom, metier||'—', commune||'—', description||'', contact||'—']
    );
    await pool.query('UPDATE comptes SET profil_id=? WHERE id=?', [r.insertId, req.compte.id]);
    res.json({ id:r.insertId });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/profils/:id', auth, async (req,res) => {
  try {
    if (!req.compte.profil_id || String(req.compte.profil_id) !== String(req.params.id))
      return res.status(403).json({ error:'Non autorisé' });
    const { nom, metier, commune, description, contact } = req.body;
    await pool.query(
      'UPDATE profils SET nom=?,metier=?,commune=?,description=?,contact=? WHERE id=?',
      [nom, metier, commune, description, contact, req.params.id]
    );
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/profils/:id/preuve', auth, async (req,res) => {
  try {
    if (!req.compte.profil_id || String(req.compte.profil_id) !== String(req.params.id))
      return res.status(403).json({ error:'Non autorisé' });
    const { preuve, preuve_type, preuve_lien, preuve_referent } = req.body;
    await pool.query(
      'UPDATE profils SET preuve_url=?,preuve_type=?,preuve_lien=?,preuve_referent=? WHERE id=?',
      [preuve||null, preuve_type||null, preuve_lien||null, preuve_referent||null, req.params.id]
    );
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/profils/:id/premium', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (!req.compte.profil_id) return res.status(400).json({ error:'Profil introuvable' });
    if (String(req.compte.profil_id) !== String(req.params.id))
      return res.status(403).json({ error:'Non autorisé' });
    await pool.query('UPDATE profils SET vitrine_premium=1 WHERE id=?', [req.params.id]);
    const [p] = await pool.query('SELECT id,vitrine_premium FROM profils WHERE id=?', [req.params.id]);
    res.json({ ok:true, vitrine_premium:p[0].vitrine_premium });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= AVIS ================= */
app.post('/api/avis', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    if (!req.compte.employeur_id) return res.status(403).json({ error:'Vérifie ton profil employeur d\'abord' });
    const { profil_id, note, commentaire } = req.body;
    if (!profil_id || !note) return res.status(400).json({ error:'Champs manquants' });
    if (note < 1 || note > 5) return res.status(400).json({ error:'Note entre 1 et 5' });

    const [ex] = await pool.query(
      'SELECT id FROM avis WHERE profil_id=? AND employeur_id=?',
      [profil_id, req.compte.employeur_id]
    );
    if (ex.length) return res.status(409).json({ error:'Tu as déjà noté ce profil' });

    await pool.query(
      'INSERT INTO avis (profil_id,employeur_id,note,commentaire) VALUES (?,?,?,?)',
      [profil_id, req.compte.employeur_id, note, cleanComment(commentaire)]
    );
    const [av] = await pool.query('SELECT note FROM avis WHERE profil_id=? AND signale=0', [profil_id]);
    const nv = computeEligible(av);
    const [p] = await pool.query('SELECT badge FROM profils WHERE id=?', [profil_id]);
    if (badgeRank(nv) > badgeRank(p[0].badge))
      await pool.query('UPDATE profils SET badge=? WHERE id=?', [nv, profil_id]);

    const [pj] = await pool.query('SELECT c.id AS compte_id FROM comptes c WHERE c.profil_id=?', [profil_id]);
    if (pj.length) await notifier(pj[0].compte_id, 'avis', 'Nouvel avis reçu', `Tu as reçu ${note} étoile(s).`, '/jeune/profil');

    res.json({ ok:true, badge:nv, nb_avis:av.length });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/avis/:id/reponse', auth, async (req,res) => {
  try {
    const [a] = await pool.query('SELECT profil_id FROM avis WHERE id=?', [req.params.id]);
    if (!a.length) return res.status(404).json({ error:'Avis introuvable' });
    if (String(req.compte.profil_id) !== String(a[0].profil_id))
      return res.status(403).json({ error:'Non autorisé' });
    await pool.query('UPDATE avis SET reponse=? WHERE id=?', [cleanComment(req.body.reponse), req.params.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= EMPLOYEURS — vérification ================= */
app.post('/api/employeurs/verifier', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    const cat = req.compte.employeur_categorie || 'particulier';
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error:'Référence requise' });

    const empId = req.compte.employeur_id || ('emp-' + req.compte.id);
    const isVerified = (cat === 'particulier'); // particuliers = vérifiés directement par SMS
    const enAttente = (cat !== 'particulier');

    await pool.query(
      `INSERT INTO employeurs (id,categorie,reference,verifie,en_attente)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE categorie=VALUES(categorie),reference=VALUES(reference),
         verifie=VALUES(verifie),en_attente=VALUES(en_attente)`,
      [empId, cat, reference, isVerified?1:0, enAttente?1:0]
    );
    await pool.query('UPDATE comptes SET employeur_id=? WHERE id=?', [empId, req.compte.id]);
    res.json({ ok:true, employeur_id:empId, verifie:isVerified, en_attente:enAttente });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/employeurs/moi', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const empId = req.compte.employeur_id || ('emp-'+req.compte.id);
    const [r] = await pool.query('SELECT * FROM employeurs WHERE id=?', [empId]);
    res.json(r[0] || { verifie:0, en_attente:0, categorie:req.compte.employeur_categorie });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= MISSIONS ================= */
app.get('/api/missions', async (req,res) => {
  try {
    const { q, duree, commune } = req.query;
    let sql = 'SELECT * FROM missions WHERE statut="ouverte"';
    const p = [];
    if (q)       { sql += ' AND (titre LIKE ? OR description LIKE ?)'; p.push(`%${q}%`,`%${q}%`); }
    if (duree)   { sql += ' AND duree=?'; p.push(duree); }
    if (commune) { sql += ' AND commune LIKE ?'; p.push(`%${commune}%`); }
    sql += ' ORDER BY cree_le DESC LIMIT 60';
    const [r] = await pool.query(sql, p);
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/missions', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    if (!req.compte.employeur_id) return res.status(403).json({ error:'Vérifie ton profil employeur d\'abord' });
    const { titre, description, commune, budget, nombre_personnes, duree, type_contrat, contact } = req.body;
    if (!titre) return res.status(400).json({ error:'Titre requis' });

    const cat = req.compte.employeur_categorie || 'particulier';
    if (duree === 'longue' && cat === 'particulier')
      return res.status(403).json({ error:'Les particuliers ne peuvent publier que des missions courtes' });

    const [r] = await pool.query(
      `INSERT INTO missions (employeur_id,employeur_type,titre,description,commune,budget,nombre_personnes,duree,type_contrat,contact)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.compte.employeur_id, cat, titre, description||'', commune||'', budget||'',
       nombre_personnes||1, duree||'courte', type_contrat||'mission', contact||'']
    );
    res.json({ id:r.insertId });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/missions/:id/postuler', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (!req.compte.profil_id) return res.status(400).json({ error:'Crée ton profil jeune d\'abord' });
    const [m] = await pool.query('SELECT employeur_id FROM missions WHERE id=?', [req.params.id]);
    if (!m.length) return res.status(404).json({ error:'Mission introuvable' });
    const [d] = await pool.query(
      'SELECT id FROM candidatures WHERE mission_id=? AND profil_id=?',
      [req.params.id, req.compte.profil_id]
    );
    if (d.length) return res.status(409).json({ error:'Tu as déjà postulé' });
    await pool.query(
      'INSERT INTO candidatures (mission_id,profil_id,employeur_id) VALUES (?,?,?)',
      [req.params.id, req.compte.profil_id, m[0].employeur_id]
    );
    const [emp] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [m[0].employeur_id]);
    if (emp.length) await notifier(emp[0].id, 'candidature', 'Nouvelle candidature', 'Un jeune a postulé à ton offre.', '/employeur/candidatures');
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/employeurs/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const empId = req.compte.employeur_id || ('emp-'+req.compte.id);
    const [r] = await pool.query(
      `SELECT c.*, m.titre AS mission_titre,
              p.nom AS profil_nom, p.metier AS profil_metier,
              p.commune AS profil_commune, p.contact AS profil_contact
       FROM candidatures c
       LEFT JOIN missions m ON m.id=c.mission_id
       LEFT JOIN profils p ON p.id=c.profil_id
       WHERE c.employeur_id=? ORDER BY c.cree_le DESC LIMIT 50`,
      [empId]
    );
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/jeune/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune' || !req.compte.profil_id) return res.json([]);
    const [r] = await pool.query(
      `SELECT c.*, m.titre AS mission_titre, m.commune AS mission_commune, m.budget
       FROM candidatures c
       LEFT JOIN missions m ON m.id=c.mission_id
       WHERE c.profil_id=? ORDER BY c.cree_le DESC LIMIT 50`,
      [req.compte.profil_id]
    );
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= RECHERCHES SAUVEGARDÉES ================= */
app.get('/api/recherches', auth, async (req,res) => {
  try {
    const [r] = await pool.query(
      'SELECT * FROM recherches_sauvegardees WHERE compte_id=? ORDER BY cree_le DESC LIMIT 30',
      [req.compte.id]
    );
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/recherches', auth, async (req,res) => {
  try {
    const { metier, commune } = req.body;
    await pool.query(
      'INSERT INTO recherches_sauvegardees (compte_id,metier,commune) VALUES (?,?,?)',
      [req.compte.id, metier||null, commune||null]
    );
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= SIGNALEMENTS ================= */
app.post('/api/signalements', auth, async (req,res) => {
  try {
    const { cible_type, cible_id, motif } = req.body;
    if (!cible_type || !cible_id) return res.status(400).json({ error:'Champs requis' });
    await pool.query(
      'INSERT INTO signalements (cible_type,cible_id,motif,signale_par) VALUES (?,?,?,?)',
      [cible_type, cible_id, motif||'', req.compte.id]
    );
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= NOTIFICATIONS ================= */
app.get('/api/notifications', auth, async (req,res) => {
  try {
    const [r] = await pool.query(
      'SELECT * FROM notifications WHERE compte_id=? ORDER BY cree_le DESC LIMIT 30',
      [req.compte.id]
    );
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/notifications/count', auth, async (req,res) => {
  try {
    const [r] = await pool.query(
      'SELECT COUNT(*) AS c FROM notifications WHERE compte_id=? AND lu=0',
      [req.compte.id]
    );
    res.json({ count:r[0].c });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/notifications/marquer-vues', auth, async (req,res) => {
  try {
    await pool.query('UPDATE notifications SET lu=1 WHERE compte_id=?', [req.compte.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= STATS ================= */
app.get('/api/stats', async (req,res) => {
  try {
    const [a] = await pool.query('SELECT COUNT(*) AS total FROM profils WHERE signale=0');
    const [b] = await pool.query('SELECT COUNT(*) AS total FROM avis WHERE signale=0');
    const [c] = await pool.query('SELECT COUNT(*) AS total FROM missions WHERE statut="ouverte"');
    const [d] = await pool.query('SELECT commune,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY commune ORDER BY total DESC');
    const [e] = await pool.query('SELECT metier,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY metier ORDER BY total DESC');
    const [f] = await pool.query('SELECT badge,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY badge');
    res.json({
      total_profils:a[0].total, total_avis:b[0].total, total_missions:c[0].total,
      par_commune:d, par_metier:e, par_badge:f
    });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= VUE INTERNE — Signalements graves ================= */
app.get('/api/internal/signalements', auth, async (req,res) => {
  try {
    // Pas de role admin en base pour l'instant : on restreint à un email spécifique
    if (req.compte.email !== 'admin@zuamosala.cd')
      return res.status(403).json({ error:'Accès réservé' });
    const [r] = await pool.query(
      `SELECT s.*, c.email AS signale_par_email
       FROM signalements s LEFT JOIN comptes c ON c.id=s.signale_par
       ORDER BY s.cree_le DESC LIMIT 100`
    );
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/internal/signalements/:id/:action', auth, async (req,res) => {
  try {
    if (req.compte.email !== 'admin@zuamosala.cd')
      return res.status(403).json({ error:'Accès réservé' });
    const { id, action } = req.params;
    const statut = action === 'traiter' ? 'traite' : action === 'rejeter' ? 'rejete' : null;
    if (!statut) return res.status(400).json({ error:'Action invalide' });
    await pool.query('UPDATE signalements SET statut=? WHERE id=?', [statut, id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ================= FRONTEND ================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_,r) => r.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`✓ ZUA MOSALA en ligne sur le port ${PORT}`)));
