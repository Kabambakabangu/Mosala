const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

const hashPwd = p => crypto.createHash('sha256').update(String(p)).digest('hex');
const hashData = d => crypto.createHash('sha256').update(String(d)).digest('hex');
const genToken = () => crypto.randomBytes(24).toString('hex');
const genCode6 = () => Math.floor(100000 + Math.random() * 900000).toString();

async function initDB(){
  try {
    const migrations = [
      `ALTER TABLE comptes ADD COLUMN telephone VARCHAR(30) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN prenom VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN nom VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_categorie VARCHAR(40) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_secteur VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN profil_id INT DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN employeur_id VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN code_sms VARCHAR(10) DEFAULT NULL`,
      `ALTER TABLE comptes ADD COLUMN code_sms_expire DATETIME DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN vitrine_premium TINYINT(1) DEFAULT 0`,
      `ALTER TABLE profils ADD COLUMN vitrine_expire DATETIME DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_type VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_lien VARCHAR(255) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_referent VARCHAR(120) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN preuve_hash VARCHAR(80) DEFAULT NULL`,
      `ALTER TABLE profils ADD COLUMN signale TINYINT(1) DEFAULT 0`,
      `ALTER TABLE avis ADD COLUMN mission_id INT DEFAULT NULL`,
      `ALTER TABLE avis ADD COLUMN signale TINYINT(1) DEFAULT 0`,
      `ALTER TABLE missions ADD COLUMN duree ENUM('courte','longue') DEFAULT 'courte'`,
      `ALTER TABLE missions ADD COLUMN type_contrat VARCHAR(40) DEFAULT 'mission'`,
      `ALTER TABLE missions ADD COLUMN contact VARCHAR(60) DEFAULT ''`,
      `ALTER TABLE missions ADD COLUMN profil_id INT DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN statut2 ENUM('Postulee','Acceptee','Refusee','EnCours','Terminee','ConfirmeeJeune','Confirmee','Avisee','Annulee') DEFAULT 'Postulee'`,
      `ALTER TABLE candidatures ADD COLUMN motif_annulation VARCHAR(200) DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN date_acceptee DATETIME DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN date_demarree DATETIME DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN date_terminee DATETIME DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN date_confirmee DATETIME DEFAULT NULL`,
      `ALTER TABLE candidatures ADD COLUMN date_avisee DATETIME DEFAULT NULL`,
      `ALTER TABLE employeurs ADD COLUMN commune VARCHAR(120) DEFAULT NULL`,
      `ALTER TABLE employeurs ADD COLUMN contact VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE employeurs ADD COLUMN secteur VARCHAR(80) DEFAULT NULL`
    ];
    for (const sql of migrations) {
      try { await pool.query(sql); } catch(e){}
    }

    await pool.query("CREATE TABLE IF NOT EXISTS profils (id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(120) NOT NULL, metier VARCHAR(120) NOT NULL, commune VARCHAR(120) NOT NULL, description TEXT, contact VARCHAR(60), preuve_url LONGTEXT, preuve_type VARCHAR(20) DEFAULT NULL, preuve_lien VARCHAR(255) DEFAULT NULL, preuve_referent VARCHAR(120) DEFAULT NULL, preuve_hash VARCHAR(80) DEFAULT NULL, badge ENUM('bronze','argent','or') DEFAULT 'bronze', vitrine_premium TINYINT(1) DEFAULT 0, vitrine_expire DATETIME DEFAULT NULL, signale TINYINT(1) DEFAULT 0, consentement TINYINT(1) DEFAULT 0, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS avis (id INT AUTO_INCREMENT PRIMARY KEY, profil_id INT NOT NULL, employeur_id VARCHAR(60) NOT NULL, mission_id INT DEFAULT NULL, note TINYINT NOT NULL, commentaire VARCHAR(180), reponse VARCHAR(180), signale TINYINT(1) DEFAULT 0, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_avis (profil_id, employeur_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS employeurs (id VARCHAR(60) PRIMARY KEY, categorie ENUM('particulier','entreprise','soustraitance','institution') NOT NULL, secteur VARCHAR(80) DEFAULT NULL, commune VARCHAR(120) DEFAULT NULL, contact VARCHAR(60) DEFAULT NULL, reference VARCHAR(120), verifie TINYINT(1) DEFAULT 0, en_attente TINYINT(1) DEFAULT 0, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS missions (id INT AUTO_INCREMENT PRIMARY KEY, employeur_id VARCHAR(60) NOT NULL, employeur_type VARCHAR(40), profil_id INT DEFAULT NULL, titre VARCHAR(150) NOT NULL, description TEXT, commune VARCHAR(120), budget VARCHAR(60), nombre_personnes INT DEFAULT 1, duree ENUM('courte','longue') DEFAULT 'courte', type_contrat VARCHAR(40) DEFAULT 'mission', contact VARCHAR(60), statut ENUM('ouverte','pourvue','fermee') DEFAULT 'ouverte', cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS candidatures (id INT AUTO_INCREMENT PRIMARY KEY, mission_id INT NOT NULL, profil_id INT NOT NULL, employeur_id VARCHAR(60) NOT NULL, statut ENUM('nouvelle','vue','acceptee','refusee') DEFAULT 'nouvelle', statut2 ENUM('Postulee','Acceptee','Refusee','EnCours','Terminee','ConfirmeeJeune','Confirmee','Avisee','Annulee') DEFAULT 'Postulee', motif_annulation VARCHAR(200) DEFAULT NULL, date_acceptee DATETIME DEFAULT NULL, date_demarree DATETIME DEFAULT NULL, date_terminee DATETIME DEFAULT NULL, date_confirmee DATETIME DEFAULT NULL, date_avisee DATETIME DEFAULT NULL, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS comptes (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(160) NOT NULL UNIQUE, password_hash VARCHAR(120) NOT NULL, type ENUM('jeune','employeur') NOT NULL, telephone VARCHAR(30) DEFAULT NULL, prenom VARCHAR(80) DEFAULT NULL, nom VARCHAR(80) DEFAULT NULL, employeur_categorie VARCHAR(40) DEFAULT NULL, employeur_secteur VARCHAR(80) DEFAULT NULL, profil_id INT DEFAULT NULL, employeur_id VARCHAR(60) DEFAULT NULL, code_sms VARCHAR(10) DEFAULT NULL, code_sms_expire DATETIME DEFAULT NULL, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(80) PRIMARY KEY, compte_id INT NOT NULL, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS notifications (id INT AUTO_INCREMENT PRIMARY KEY, compte_id INT NOT NULL, type VARCHAR(40) NOT NULL, titre VARCHAR(120), message VARCHAR(240), lien VARCHAR(120), lu TINYINT(1) DEFAULT 0, cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS signalements (id INT AUTO_INCREMENT PRIMARY KEY, cible_type ENUM('profil','avis','photo','mission') NOT NULL, cible_id INT NOT NULL, motif VARCHAR(200), signale_par INT DEFAULT NULL, statut ENUM('nouveau','traite','rejete') DEFAULT 'nouveau', cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS recherches_sauvegardees (id INT AUTO_INCREMENT PRIMARY KEY, compte_id INT NOT NULL, metier VARCHAR(120), commune VARCHAR(120), cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS rapports_vendus (id INT AUTO_INCREMENT PRIMARY KEY, titre VARCHAR(150), destinataire VARCHAR(150), montant DECIMAL(10,2), vendeur VARCHAR(120), cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS paiements (id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(40), payeur VARCHAR(150), montant DECIMAL(10,2), statut ENUM('paye','attente','annule') DEFAULT 'paye', reference VARCHAR(120), cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS config (cle VARCHAR(60) PRIMARY KEY, valeur VARCHAR(255), maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await pool.query("CREATE TABLE IF NOT EXISTS admin_logs (id INT AUTO_INCREMENT PRIMARY KEY, admin_email VARCHAR(160), action VARCHAR(120), details VARCHAR(255), cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    console.log('Toutes les tables OK');
  } catch(e){
    console.error('Erreur initDB :', e.message);
  }
}

function badgeRank(b){ return {bronze:0,argent:1,or:2}[b] || 0; }

function computeEligible(avis){
  const n = avis.length;
  const a = n ? avis.reduce((s,x)=>s+x.note,0)/n : 0;
  if (n>=5 && a>=4) return 'or';
  if (n>=3 && a>=3) return 'argent';
  return 'bronze';
}

function mergeBadge(actuel, eligible){
  return badgeRank(eligible) > badgeRank(actuel) ? eligible : actuel;
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
    const [r] = await pool.query('SELECT c.* FROM sessions s JOIN comptes c ON c.id=s.compte_id WHERE s.token=?', [t]);
    if (!r.length) return res.status(401).json({ error:'Session expirée' });
    req.compte = r[0];
    next();
  } catch(e){
    res.status(500).json({ error:e.message });
  }
}

async function requireAdmin(req,res,next){
  const t = req.headers['x-auth-token'];
  if (!t) return res.status(401).json({ error:'Non authentifié' });
  try {
    const [r] = await pool.query('SELECT c.* FROM sessions s JOIN comptes c ON c.id=s.compte_id WHERE s.token=?', [t]);
    if (!r.length) return res.status(401).json({ error:'Session expirée' });
    if (r[0].email !== 'admin@zuamosala.cd') return res.status(403).json({ error:'Accès réservé' });
    req.compte = r[0];
    next();
  } catch(e){
    res.status(500).json({ error:e.message });
  }
}

async function requireVerifiedEmployeur(req,res,next){
  if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
  const empId = req.compte.employeur_id || ('emp-' + req.compte.id);
  const [r] = await pool.query('SELECT verifie, en_attente, categorie FROM employeurs WHERE id=?', [empId]);
  if (r.length && r[0].verifie) return next();
  if (req.compte.employeur_categorie === 'institution') return next();
  return res.status(403).json({ error:'Vérifie ton profil employeur' });
}

async function notifier(compteId, type, titre, message, lien){
  try {
    await pool.query('INSERT INTO notifications (compte_id,type,titre,message,lien) VALUES (?,?,?,?,?)', [compteId, type, titre, message, lien||'']);
  } catch(e){}
}

async function adminLog(adminEmail, action, details){
  try {
    await pool.query('INSERT INTO admin_logs (admin_email,action,details) VALUES (?,?,?)', [adminEmail, action, details||'']);
  } catch(e){}
}

app.get('/api/health', (req,res) => res.json({ ok:true, ts:Date.now() }));

app.post('/api/auth/inscription', async (req,res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
    const type = req.body.type;
    const telephone = req.body.telephone;
    const prenom = req.body.prenom;
    const nom = req.body.nom;
    const employeur_categorie = req.body.employeur_categorie;
    const employeur_secteur = req.body.employeur_secteur;
    if (!email || !password) return res.status(400).json({ error:'Email et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error:'Mot de passe : 6 min' });
    if (type !== 'jeune' && type !== 'employeur') return res.status(400).json({ error:'Type invalide' });
    const [e] = await pool.query('SELECT id FROM comptes WHERE email=?', [email]);
    if (e.length) return res.status(409).json({ error:'Cet email est déjà utilisé' });
    const cat = type==='employeur' ? (employeur_categorie || 'particulier') : null;
    const secteur = type==='employeur' ? (employeur_secteur || null) : null;
    const [r] = await pool.query(
      'INSERT INTO comptes (email,password_hash,type,telephone,prenom,nom,employeur_categorie,employeur_secteur) VALUES (?,?,?,?,?,?,?,?)',
      [email, hashPwd(password), type, telephone||null, prenom||null, nom||null, cat, secteur]
    );
    if (type === 'employeur'){
      const empId = 'emp-' + r.insertId;
      const autoVerifie = (cat === 'institution') ? 1 : 0;
      const enAttente = (cat === 'particulier' || cat === 'institution') ? 0 : 1;
      await pool.query('INSERT INTO employeurs (id,categorie,secteur,verifie,en_attente) VALUES (?,?,?,?,?)', [empId, cat, secteur, autoVerifie, enAttente]);
      await pool.query('UPDATE comptes SET employeur_id=? WHERE id=?', [empId, r.insertId]);
    }
    const token = genToken();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, r.insertId]);
    res.json({ ok:true, token, compte_id:r.insertId, type, employeur_categorie:cat });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/auth/connexion', async (req,res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error:'Champs requis' });
    const [r] = await pool.query('SELECT * FROM comptes WHERE email=?', [email]);
    if (!r.length || r[0].password_hash !== hashPwd(password)) return res.status(401).json({ error:'Identifiants incorrects' });
    const c = r[0];
    const token = genToken();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, c.id]);
    res.json({ ok:true, token, compte_id:c.id, type:c.type, profil_id:c.profil_id, employeur_id:c.employeur_id, employeur_categorie:c.employeur_categorie });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/auth/deconnexion', auth, async (req,res) => {
  const t = req.headers['x-auth-token'];
  await pool.query('DELETE FROM sessions WHERE token=?', [t]);
  res.json({ ok:true });
});

app.get('/api/auth/moi', auth, async (req,res) => {
  const c = req.compte;
  res.json({ id:c.id, email:c.email, type:c.type, prenom:c.prenom, nom:c.nom, telephone:c.telephone, profil_id:c.profil_id, employeur_id:c.employeur_id, employeur_categorie:c.employeur_categorie, employeur_secteur:c.employeur_secteur });
});

app.get('/api/profils', async (req,res) => {
  try {
    const metier = req.query.metier;
    const commune = req.query.commune;
    let sql = 'SELECT p.*, COALESCE(AVG(a.note),0) AS moyenne, COUNT(a.id) AS nb_avis FROM profils p LEFT JOIN avis a ON a.profil_id = p.id AND a.signale = 0 WHERE p.signale = 0';
    const params = [];
    if (metier) { sql += ' AND p.metier LIKE ?'; params.push('%'+metier+'%'); }
    if (commune){ sql += ' AND p.commune LIKE ?'; params.push('%'+commune+'%'); }
    sql += ' GROUP BY p.id ORDER BY FIELD(p.badge,"or","argent","bronze"), moyenne DESC, nb_avis DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/profils/:id', async (req,res) => {
  try {
    const [p] = await pool.query('SELECT * FROM profils WHERE id=?', [req.params.id]);
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query('SELECT id,note,commentaire,reponse,employeur_id,cree_le FROM avis WHERE profil_id=? AND signale=0 ORDER BY cree_le DESC', [req.params.id]);
    res.json({ ...p[0], avis:a });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/public/profil/:id', async (req,res) => {
  try {
    const [p] = await pool.query('SELECT id,nom,metier,commune,description,contact,badge,vitrine_premium,preuve_url,preuve_lien FROM profils WHERE id=? AND signale=0', [req.params.id]);
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query('SELECT note,commentaire,reponse FROM avis WHERE profil_id=? AND signale=0 ORDER BY cree_le DESC', [req.params.id]);
    res.json({ ...p[0], avis:a });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/profils', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (req.compte.profil_id) return res.status(409).json({ error:'Tu as déjà un profil' });
    const nom = req.body.nom;
    const metier = req.body.metier;
    const commune = req.body.commune;
    const description = req.body.description;
    const contact = req.body.contact;
    const consentement = req.body.consentement;
    if (!nom) return res.status(400).json({ error:'Nom requis' });
    if (!consentement) return res.status(400).json({ error:'Consentement obligatoire' });
    const [r] = await pool.query('INSERT INTO profils (nom,metier,commune,description,contact,consentement) VALUES (?,?,?,?,?,1)', [nom, metier||'—', commune||'—', description||'', contact||'—']);
    await pool.query('UPDATE comptes SET profil_id=? WHERE id=?', [r.insertId, req.compte.id]);
    res.json({ id:r.insertId });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.put('/api/profils/:id/preuve', auth, async (req,res) => {
  try {
    if (!req.compte.profil_id || String(req.compte.profil_id) !== String(req.params.id)) return res.status(403).json({ error:'Non autorisé' });
    const preuve = req.body.preuve;
    const preuve_type = req.body.preuve_type;
    const preuve_lien = req.body.preuve_lien;
    const preuve_referent = req.body.preuve_referent;
    const h = preuve ? hashData(preuve) : null;
    await pool.query('UPDATE profils SET preuve_url=?,preuve_type=?,preuve_lien=?,preuve_referent=?,preuve_hash=? WHERE id=?', [preuve||null, preuve_type||null, preuve_lien||null, preuve_referent||null, h, req.params.id]);
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.put('/api/profils/:id/premium', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (String(req.compte.profil_id) !== String(req.params.id)) return res.status(403).json({ error:'Non autorisé' });
    const exp = new Date(Date.now() + 30*24*60*60*1000);
    await pool.query('UPDATE profils SET vitrine_premium=1, vitrine_expire=? WHERE id=?', [exp, req.params.id]);
    res.json({ ok:true, vitrine_premium:1 });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/avis', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    if (!req.compte.employeur_id) return res.status(403).json({ error:'Vérifie ton profil employeur' });
    const profil_id = req.body.profil_id;
    const mission_id = req.body.mission_id;
    const note = req.body.note;
    const commentaire = req.body.commentaire;
    if (!profil_id || !note) return res.status(400).json({ error:'Champs manquants' });
    if (note < 1 || note > 5) return res.status(400).json({ error:'Note entre 1 et 5' });
    if (mission_id){
      const [m] = await pool.query('SELECT statut2 FROM candidatures WHERE id=? AND profil_id=?', [mission_id, profil_id]);
      if (!m.length) return res.status(404).json({ error:'Mission introuvable' });
      if (m[0].statut2 !== 'Confirmee') return res.status(403).json({ error:'Mission non confirmée' });
    }
    const [ex] = await pool.query('SELECT id FROM avis WHERE profil_id=? AND employeur_id=?', [profil_id, req.compte.employeur_id]);
    if (ex.length) return res.status(409).json({ error:'Un seul avis par employeur' });
    await pool.query('INSERT INTO avis (profil_id,employeur_id,mission_id,note,commentaire) VALUES (?,?,?,?,?)', [profil_id, req.compte.employeur_id, mission_id||null, note, cleanComment(commentaire)]);
    const [av] = await pool.query('SELECT note FROM avis WHERE profil_id=? AND signale=0', [profil_id]);
    const eligible = computeEligible(av);
    const [p] = await pool.query('SELECT badge FROM profils WHERE id=?', [profil_id]);
    const nouveau = mergeBadge(p[0].badge, eligible);
    await pool.query('UPDATE profils SET badge=? WHERE id=?', [nouveau, profil_id]);
    if (mission_id) await pool.query('UPDATE candidatures SET statut2="Avisee",date_avisee=NOW() WHERE id=?', [mission_id]);
    const [pj] = await pool.query('SELECT id AS compte_id FROM comptes WHERE profil_id=?', [profil_id]);
    if (pj.length) await notifier(pj[0].compte_id, 'avis', 'Nouvel avis reçu', 'Tu as reçu ' + note + ' étoile(s).', '/jeune/profil');
    res.json({ ok:true, badge:nouveau, nb_avis:av.length });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.put('/api/avis/:id/reponse', auth, async (req,res) => {
  try {
    const [a] = await pool.query('SELECT profil_id FROM avis WHERE id=?', [req.params.id]);
    if (!a.length) return res.status(404).json({ error:'Avis introuvable' });
    if (String(req.compte.profil_id) !== String(a[0].profil_id)) return res.status(403).json({ error:'Non autorisé' });
    await pool.query('UPDATE avis SET reponse=? WHERE id=?', [cleanComment(req.body.reponse), req.params.id]);
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/employeurs/verifier', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const cat = req.compte.employeur_categorie || 'particulier';
    const reference = req.body.reference;
    const commune = req.body.commune;
    const contact = req.body.contact;
    if (!reference) return res.status(400).json({ error:'Référence requise' });
    const empId = req.compte.employeur_id || ('emp-' + req.compte.id);
    const isVerified = (cat === 'particulier' || cat === 'institution') ? 1 : 0;
    const enAttente = (cat === 'entreprise' || cat === 'soustraitance') ? 1 : 0;
    await pool.query('INSERT INTO employeurs (id,categorie,reference,verifie,en_attente,commune,contact) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE categorie=VALUES(categorie),reference=VALUES(reference),verifie=GREATEST(verifie,VALUES(verifie)),en_attente=VALUES(en_attente),commune=VALUES(commune),contact=VALUES(contact)', [empId, cat, reference, isVerified, enAttente, commune||null, contact||null]);
    await pool.query('UPDATE comptes SET employeur_id=? WHERE id=?', [empId, req.compte.id]);
    res.json({ ok:true, employeur_id:empId, verifie:!!isVerified, en_attente:!!enAttente });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/employeurs/moi', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const empId = req.compte.employeur_id || ('emp-'+req.compte.id);
    const [r] = await pool.query('SELECT * FROM employeurs WHERE id=?', [empId]);
    res.json(r[0] || { verifie:0, en_attente:0, categorie:req.compte.employeur_categorie });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/missions', async (req,res) => {
  try {
    const q = req.query.q;
    const duree = req.query.duree;
    const commune = req.query.commune;
    let sql = 'SELECT * FROM missions WHERE statut="ouverte"';
    const p = [];
    if (q)       { sql += ' AND (titre LIKE ? OR description LIKE ?)'; p.push('%'+q+'%','%'+q+'%'); }
    if (duree)   { sql += ' AND duree=?'; p.push(duree); }
    if (commune) { sql += ' AND commune LIKE ?'; p.push('%'+commune+'%'); }
    sql += ' ORDER BY cree_le DESC LIMIT 60';
    const [r] = await pool.query(sql, p);
    res.json(r);
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/missions', auth, requireVerifiedEmployeur, async (req,res) => {
  try {
    const titre = req.body.titre;
    const description = req.body.description;
    const commune = req.body.commune;
    const budget = req.body.budget;
    const nombre_personnes = req.body.nombre_personnes;
    const duree = req.body.duree;
    const type_contrat = req.body.type_contrat;
    const contact = req.body.contact;
    if (!titre) return res.status(400).json({ error:'Titre requis' });
    const cat = req.compte.employeur_categorie || 'particulier';
    if (duree === 'longue' && cat === 'particulier') return res.status(403).json({ error:'Particuliers : missions courtes uniquement' });
    const [r] = await pool.query('INSERT INTO missions (employeur_id,employeur_type,titre,description,commune,budget,nombre_personnes,duree,type_contrat,contact) VALUES (?,?,?,?,?,?,?,?,?,?)', [req.compte.employeur_id, cat, titre, description||'', commune||'', budget||'', nombre_personnes||1, duree||'courte', type_contrat||'mission', contact||'']);
    res.json({ id:r.insertId });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/missions/:id/postuler', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (!req.compte.profil_id) return res.status(400).json({ error:'Crée ton profil d abord' });
    const [m] = await pool.query('SELECT employeur_id, titre FROM missions WHERE id=?', [req.params.id]);
    if (!m.length) return res.status(404).json({ error:'Mission introuvable' });
    const [d] = await pool.query('SELECT id FROM candidatures WHERE mission_id=? AND profil_id=?', [req.params.id, req.compte.profil_id]);
    if (d.length) return res.status(409).json({ error:'Tu as déjà postulé' });
    await pool.query('INSERT INTO candidatures (mission_id,profil_id,employeur_id,statut2) VALUES (?,?,?,"Postulee")', [req.params.id, req.compte.profil_id, m[0].employeur_id]);
    const [emp] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [m[0].employeur_id]);
    if (emp.length) await notifier(emp[0].id, 'candidature', 'Nouvelle candidature', 'Quelqu un a postulé.', '/employeur/candidatures');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/employeurs/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const empId = req.compte.employeur_id || ('emp-'+req.compte.id);
    const [r] = await pool.query('SELECT c.*, m.titre AS mission_titre, m.commune AS mission_commune, m.contact AS mission_contact, p.nom AS profil_nom, p.metier AS profil_metier, p.commune AS profil_commune, p.contact AS profil_contact, p.badge AS profil_badge FROM candidatures c LEFT JOIN missions m ON m.id=c.mission_id LEFT JOIN profils p ON p.id=c.profil_id WHERE c.employeur_id=? ORDER BY c.cree_le DESC LIMIT 100', [empId]);
    res.json(r);
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/jeune/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune' || !req.compte.profil_id) return res.json([]);
    const [r] = await pool.query('SELECT c.*, m.titre AS mission_titre, m.commune AS mission_commune, m.budget AS mission_budget, m.contact AS mission_contact FROM candidatures c LEFT JOIN missions m ON m.id=c.mission_id WHERE c.profil_id=? ORDER BY c.cree_le DESC LIMIT 100', [req.compte.profil_id]);
    res.json(r);
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/accepter', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    if (c[0].employeur_id !== req.compte.employeur_id && c[0].employeur_id !== ('emp-'+req.compte.id)) return res.status(403).json({ error:'Non autorisé' });
    if (c[0].statut2 !== 'Postulee') return res.status(400).json({ error:'Statut invalide' });
    await pool.query('UPDATE candidatures SET statut2="Acceptee", statut="acceptee", date_acceptee=NOW() WHERE id=?', [req.params.id]);
    const [pj] = await pool.query('SELECT id FROM comptes WHERE profil_id=?', [c[0].profil_id]);
    if (pj.length) await notifier(pj[0].id, 'candidature', 'Candidature acceptée', 'Contacte l employeur.', '/jeune/profil');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/refuser', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    await pool.query('UPDATE candidatures SET statut2="Refusee", statut="refusee" WHERE id=?', [req.params.id]);
    const [pj] = await pool.query('SELECT id FROM comptes WHERE profil_id=?', [c[0].profil_id]);
    if (pj.length) await notifier(pj[0].id, 'candidature', 'Candidature refusée', 'Non retenue.', '/jeune/profil');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/demarrer', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    if (c[0].statut2 !== 'Acceptee') return res.status(400).json({ error:'Statut invalide' });
    await pool.query('UPDATE candidatures SET statut2="EnCours", date_demarree=NOW() WHERE id=?', [req.params.id]);
    const [pj] = await pool.query('SELECT id FROM comptes WHERE profil_id=?', [c[0].profil_id]);
    if (pj.length) await notifier(pj[0].id, 'candidature', 'Mission démarrée', 'En cours.', '/jeune/profil');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/terminer', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    if (c[0].statut2 !== 'EnCours') return res.status(400).json({ error:'Statut invalide' });
    await pool.query('UPDATE candidatures SET statut2="Terminee", date_terminee=NOW() WHERE id=?', [req.params.id]);
    const [pj] = await pool.query('SELECT id FROM comptes WHERE profil_id=?', [c[0].profil_id]);
    if (pj.length) await notifier(pj[0].id, 'candidature', 'Mission terminée', 'Confirme.', '/jeune/profil');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/confirmer', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé au jeune' });
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    if (c[0].profil_id !== req.compte.profil_id) return res.status(403).json({ error:'Non autorisé' });
    if (c[0].statut2 !== 'Terminee') return res.status(400).json({ error:'Statut invalide' });
    await pool.query('UPDATE candidatures SET statut2="Confirmee", date_confirmee=NOW() WHERE id=?', [req.params.id]);
    const [emp] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [c[0].employeur_id]);
    if (emp.length) await notifier(emp[0].id, 'candidature', 'Mission confirmée', 'Tu peux laisser un avis.', '/employeur/candidatures');
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/candidatures/:id/annuler', auth, async (req,res) => {
  try {
    const motif = req.body.motif;
    const [c] = await pool.query('SELECT * FROM candidatures WHERE id=?', [req.params.id]);
    if (!c.length) return res.status(404).json({ error:'Introuvable' });
    await pool.query('UPDATE candidatures SET statut2="Annulee", motif_annulation=? WHERE id=?', [cleanComment(motif), req.params.id]);
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/notifications', auth, async (req,res) => {
  try {
    const [r] = await pool.query('SELECT * FROM notifications WHERE compte_id=? ORDER BY cree_le DESC LIMIT 30', [req.compte.id]);
    res.json(r);
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/notifications/count', auth, async (req,res) => {
  try {
    const [r] = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE compte_id=? AND lu=0', [req.compte.id]);
    res.json({ count:r[0].c });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/notifications/marquer-vues', auth, async (req,res) => {
  try {
    await pool.query('UPDATE notifications SET lu=1 WHERE compte_id=?', [req.compte.id]);
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/signalements', auth, async (req,res) => {
  try {
    const cible_type = req.body.cible_type;
    const cible_id = req.body.cible_id;
    const motif = req.body.motif;
    if (!cible_type || !cible_id) return res.status(400).json({ error:'Champs requis' });
    await pool.query('INSERT INTO signalements (cible_type,cible_id,motif,signale_par) VALUES (?,?,?,?)', [cible_type, cible_id, cleanComment(motif), req.compte.id]);
    res.json({ ok:true });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/stats', async (req,res) => {
  try {
    const [a] = await pool.query('SELECT COUNT(*) AS total FROM profils WHERE signale=0');
    const [b] = await pool.query('SELECT COUNT(*) AS total FROM avis WHERE signale=0');
    const [c] = await pool.query('SELECT COUNT(*) AS total FROM missions WHERE statut="ouverte"');
    const [d] = await pool.query('SELECT commune,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY commune ORDER BY total DESC');
    const [e] = await pool.query('SELECT metier,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY metier ORDER BY total DESC');
    const [f] = await pool.query('SELECT badge,COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY badge');
    res.json({ total_profils:a[0].total, total_avis:b[0].total, total_missions:c[0].total, par_commune:d, par_metier:e, par_badge:f });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/admin/dashboard', requireAdmin, async (req,res) => {
  try{
    const [jeunes]      = await pool.query('SELECT COUNT(*) AS c FROM comptes WHERE type="jeune"');
    const [employeurs]  = await pool.query('SELECT COUNT(*) AS c FROM comptes WHERE type="employeur"');
    const [attente]     = await pool.query('SELECT COUNT(*) AS c FROM employeurs WHERE en_attente=1');
    const [offres]      = await pool.query('SELECT COUNT(*) AS c FROM missions WHERE statut="ouverte"');
    const [cands]       = await pool.query('SELECT COUNT(*) AS c FROM candidatures');
    const [avisC]       = await pool.query('SELECT COUNT(*) AS c FROM avis WHERE signale=0');
    const [signC]       = await pool.query('SELECT COUNT(*) AS c FROM signalements WHERE statut="nouveau"');
    const [abos]        = await pool.query('SELECT COUNT(*) AS c FROM profils WHERE vitrine_premium=1');
    const [rapports]    = await pool.query('SELECT COUNT(*) AS c FROM rapports_vendus');
    const [paiements]   = await pool.query('SELECT COALESCE(SUM(montant),0) AS total FROM paiements WHERE statut="paye"');
    res.json({ jeunes:jeunes[0].c, employeurs:employeurs[0].c, attente:attente[0].c, offres:offres[0].c, candidatures:cands[0].c, avis:avisC[0].c, signalements:signC[0].c, abonnements:abos[0].c, rapports:rapports[0].c, total_encaisse:paiements[0].total });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/employeurs', requireAdmin, async (req,res) => {
  try{
    const statut = req.query.statut;
    let sql = 'SELECT e.*, c.email AS compte_email FROM employeurs e LEFT JOIN comptes c ON c.employeur_id = e.id';
    const params = [];
    if (statut === 'attente'){ sql += ' WHERE e.en_attente=1'; }
    else if (statut === 'verifie'){ sql += ' WHERE e.verifie=1'; }
    else if (statut === 'refuse'){ sql += ' WHERE e.verifie=0 AND e.en_attente=0'; }
    sql += ' ORDER BY e.cree_le DESC LIMIT 100';
    const [r] = await pool.query(sql, params);
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/employeurs/:id/valider', requireAdmin, async (req,res) => {
  try{
    await pool.query('UPDATE employeurs SET verifie=1, en_attente=0 WHERE id=?', [req.params.id]);
    const [c] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [req.params.id]);
    if (c.length) await notifier(c[0].id, 'verification', 'Profil vérifié', 'Entreprise validée.', '/employeur');
    await adminLog(req.compte.email, 'VALIDER_EMPLOYEUR', req.params.id);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/employeurs/:id/refuser', requireAdmin, async (req,res) => {
  try{
    const motif = req.body.motif || 'RCCM non vérifiable';
    await pool.query('UPDATE employeurs SET verifie=0, en_attente=0 WHERE id=?', [req.params.id]);
    const [c] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [req.params.id]);
    if (c.length) await notifier(c[0].id, 'verification', 'Vérification refusée', 'Motif : ' + motif, '/employeur');
    await adminLog(req.compte.email, 'REFUSER_EMPLOYEUR', req.params.id);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/jeunes', requireAdmin, async (req,res) => {
  try{
    const [r] = await pool.query('SELECT p.*, c.email AS compte_email, c.telephone AS compte_tel, COALESCE(AVG(a.note),0) AS moyenne, COUNT(a.id) AS nb_avis FROM profils p LEFT JOIN comptes c ON c.profil_id = p.id LEFT JOIN avis a ON a.profil_id = p.id AND a.signale=0 GROUP BY p.id ORDER BY p.cree_le DESC LIMIT 100');
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/jeunes/:id/suspendre', requireAdmin, async (req,res) => {
  try{
    await pool.query('UPDATE profils SET signale=1 WHERE id=?', [req.params.id]);
    await adminLog(req.compte.email, 'SUSPENDRE_JEUNE', req.params.id);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/jeunes/:id/reactiver', requireAdmin, async (req,res) => {
  try{
    await pool.query('UPDATE profils SET signale=0 WHERE id=?', [req.params.id]);
    await adminLog(req.compte.email, 'REACTIVER_JEUNE', req.params.id);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/signalements', requireAdmin, async (req,res) => {
  try{
    const [r] = await pool.query('SELECT s.*, c.email AS signale_par_email FROM signalements s LEFT JOIN comptes c ON c.id = s.signale_par ORDER BY s.cree_le DESC LIMIT 100');
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/signalements/:id/traiter', requireAdmin, async (req,res) => {
  try{
    await pool.query('UPDATE signalements SET statut="traite" WHERE id=?', [req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/signalements/:id/rejeter', requireAdmin, async (req,res) => {
  try{
    await pool.query('UPDATE signalements SET statut="rejete" WHERE id=?', [req.params.id]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/rapports/apercu', requireAdmin, async (req,res) => {
  try{
    const [parCommune]    = await pool.query('SELECT commune, COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY commune ORDER BY total DESC');
    const [parMetier]     = await pool.query('SELECT metier, COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY metier ORDER BY total DESC');
    const [parBadge]      = await pool.query('SELECT badge, COUNT(*) AS total FROM profils WHERE signale=0 GROUP BY badge');
    const [parMois]       = await pool.query('SELECT DATE_FORMAT(cree_le,"%Y-%m") AS mois, COUNT(*) AS total FROM profils GROUP BY mois ORDER BY mois DESC LIMIT 12');
    const [topEmployeurs] = await pool.query('SELECT employeur_id, COUNT(*) AS total FROM missions GROUP BY employeur_id ORDER BY total DESC LIMIT 10');
    const [totalFin]      = await pool.query('SELECT COUNT(*) AS c FROM profils WHERE vitrine_premium=1');
    const [missionsTot]   = await pool.query('SELECT COUNT(*) AS c FROM missions');
    const [avisTot]       = await pool.query('SELECT COUNT(*) AS c FROM avis');
    res.json({ par_commune:parCommune, par_metier:parMetier, par_badge:parBadge, par_mois:parMois, top_employeurs:topEmployeurs, abonnements_actifs:totalFin[0].c, total_missions:missionsTot[0].c, total_avis:avisTot[0].c });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/rapports/generer', requireAdmin, async (req,res) => {
  try{
    const titre = req.body.titre;
    const destinataire = req.body.destinataire;
    const montant = req.body.montant;
    await pool.query('INSERT INTO rapports_vendus (titre,destinataire,montant,vendeur) VALUES (?,?,?,?)', [titre||'Rapport ZUA MOSALA', destinataire||'', montant||0, req.compte.email]);
    await adminLog(req.compte.email, 'GENERER_RAPPORT', titre);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/rapports/vendus', requireAdmin, async (req,res) => {
  try{
    const [r] = await pool.query('SELECT * FROM rapports_vendus ORDER BY cree_le DESC LIMIT 50');
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/finances', requireAdmin, async (req,res) => {
  try{
    const [paiements] = await pool.query('SELECT * FROM paiements ORDER BY cree_le DESC LIMIT 100');
    const [total]     = await pool.query('SELECT COALESCE(SUM(montant),0) AS total FROM paiements WHERE statut="paye"');
    const [mois]      = await pool.query('SELECT COALESCE(SUM(montant),0) AS total FROM paiements WHERE statut="paye" AND cree_le > DATE_SUB(NOW(), INTERVAL 30 DAY)');
    const [parType]   = await pool.query('SELECT type, SUM(montant) AS total, COUNT(*) AS nb FROM paiements WHERE statut="paye" GROUP BY type');
    res.json({ paiements:paiements, total_general:total[0].total, total_30j:mois[0].total, par_type:parType });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/finances/ajouter', requireAdmin, async (req,res) => {
  try{
    const type = req.body.type;
    const payeur = req.body.payeur;
    const montant = req.body.montant;
    const reference = req.body.reference;
    const statut = req.body.statut;
    await pool.query('INSERT INTO paiements (type,payeur,montant,reference,statut) VALUES (?,?,?,?,?)', [type||'divers', payeur||'', montant||0, reference||'', statut||'paye']);
    await adminLog(req.compte.email, 'AJOUT_PAIEMENT', type + ' ' + montant);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/notifier-tous', requireAdmin, async (req,res) => {
  try{
    const cible = req.body.cible;
    const titre = req.body.titre;
    const message = req.body.message;
    let sql = 'SELECT id FROM comptes';
    if (cible === 'jeunes'){ sql += ' WHERE type="jeune"'; }
    else if (cible === 'employeurs'){ sql += ' WHERE type="employeur"'; }
    const [comptes] = await pool.query(sql);
    for (const c of comptes){
      await notifier(c.id, 'admin', titre||'Message ZUA MOSALA', message||'', '/');
    }
    await adminLog(req.compte.email, 'NOTIFIER_TOUS', cible + ' (' + comptes.length + ')');
    res.json({ ok:true, envoyes: comptes.length });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/logs', requireAdmin, async (req,res) => {
  try{
    const [r] = await pool.query('SELECT * FROM admin_logs ORDER BY cree_le DESC LIMIT 100');
    res.json(r);
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/console', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/console/', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log('ZUA MOSALA en ligne sur le port ' + PORT)));
