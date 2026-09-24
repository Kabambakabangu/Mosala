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

const hash = p => crypto.createHash('sha256').update(String(p)).digest('hex');
const tok = () => crypto.randomBytes(24).toString('hex');

async function initDB(){
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS profils (
      id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(120) NOT NULL,
      metier VARCHAR(120) NOT NULL, commune VARCHAR(120) NOT NULL,
      description TEXT, contact VARCHAR(60), preuve_url LONGTEXT,
      badge ENUM('bronze','argent','or') DEFAULT 'bronze',
      vitrine_premium TINYINT(1) DEFAULT 0, consentement TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS avis (
      id INT AUTO_INCREMENT PRIMARY KEY, profil_id INT NOT NULL,
      employeur_id VARCHAR(60) NOT NULL, note TINYINT NOT NULL,
      commentaire VARCHAR(180), reponse VARCHAR(180),
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profil_id) REFERENCES profils(id) ON DELETE CASCADE,
      UNIQUE KEY uniq (profil_id, employeur_id)
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
      password_hash VARCHAR(120) NOT NULL, type ENUM('jeune','employeur') NOT NULL,
      employeur_categorie VARCHAR(40) DEFAULT NULL,
      profil_id INT DEFAULT NULL, employeur_id VARCHAR(60) DEFAULT NULL,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(80) PRIMARY KEY, compte_id INT NOT NULL,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (compte_id) REFERENCES comptes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS employeurs (
      id VARCHAR(60) PRIMARY KEY,
      categorie ENUM('particulier','entreprise','soustraitance','institution') NOT NULL,
      reference VARCHAR(120), verifie TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY, compte_id INT NOT NULL,
      type VARCHAR(40) NOT NULL, titre VARCHAR(120), message VARCHAR(240),
      lien VARCHAR(120), lu TINYINT(1) DEFAULT 0,
      cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    console.log('✓ Toutes les tables OK');
  } catch(e){ console.error('❌ initDB :', e.message); }
}

function badgeRank(b){return {bronze:0,argent:1,or:2}[b];}
function computeEligible(avis){
  const n = avis.length;
  const a = n ? avis.reduce((s,x)=>s+x.note,0)/n : 0;
  if (n>=5 && a>=4) return 'or';
  if (n>=3 && a>=3) return 'argent';
  return 'bronze';
}
const BANNED = ['merde','connard','idiot','imbécile','fdp','ntm'];
const clean = t => { if(!t) return ''; let s = String(t).slice(0,180); BANNED.forEach(w => s = s.replace(new RegExp(w,'gi'),'***')); return s.trim(); };

async function auth(req,res,next){
  const t = req.headers['x-auth-token'];
  if (!t) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const [r] = await pool.query(`SELECT c.* FROM sessions s JOIN comptes c ON c.id=s.compte_id WHERE s.token=?`, [t]);
    if (!r.length) return res.status(401).json({ error: 'Session expirée' });
    req.compte = r[0]; next();
  } catch(e){ res.status(500).json({ error: e.message }); }
}

async function notifier(compteId, type, titre, message, lien){
  try { await pool.query('INSERT INTO notifications (compte_id,type,titre,message,lien) VALUES (?,?,?,?,?)', [compteId,type,titre,message,lien||'']); } catch(e){}
}

app.get('/api/health', (_,r) => r.json({ ok:true }));

/* ============ AUTH ============ */
app.post('/api/auth/inscription', async (req,res) => {
  try {
    const { email, password, type, employeur_categorie } = req.body;
    if (!email || !password) return res.status(400).json({ error:'Email et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error:'Mot de passe : 6 caractères minimum' });
    if (!['jeune','employeur'].includes(type)) return res.status(400).json({ error:'Type invalide' });
    const [e] = await pool.query('SELECT id FROM comptes WHERE email=?', [email]);
    if (e.length) return res.status(409).json({ error:'Email déjà utilisé' });
    const cat = type==='employeur' ? (employeur_categorie||'particulier') : null;
    const [r] = await pool.query('INSERT INTO comptes (email,password_hash,type,employeur_categorie) VALUES (?,?,?,?)', [email, hash(password), type, cat]);
    const token = tok();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, r.insertId]);
    res.json({ ok:true, token, compte_id: r.insertId, type });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/auth/connexion', async (req,res) => {
  try {
    const { email, password } = req.body;
    const [r] = await pool.query('SELECT * FROM comptes WHERE email=?', [email]);
    if (!r.length || r[0].password_hash !== hash(password)) return res.status(401).json({ error:'Identifiants incorrects' });
    const c = r[0];
    const token = tok();
    await pool.query('INSERT INTO sessions (token,compte_id) VALUES (?,?)', [token, c.id]);
    res.json({ ok:true, token, compte_id: c.id, type: c.type, profil_id: c.profil_id, employeur_id: c.employeur_id, employeur_categorie: c.employeur_categorie });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/auth/deconnexion', auth, async (req,res) => {
  const t = req.headers['x-auth-token'];
  await pool.query('DELETE FROM sessions WHERE token=?', [t]);
  res.json({ ok:true });
});

app.get('/api/auth/moi', auth, async (req,res) => {
  res.json({ id:req.compte.id, email:req.compte.email, type:req.compte.type, profil_id:req.compte.profil_id, employeur_id:req.compte.employeur_id, employeur_categorie:req.compte.employeur_categorie });
});

/* ============ PROFILS ============ */
app.get('/api/profils', async (req,res) => {
  try {
    const { metier, commune } = req.query;
    let sql = `SELECT p.*, COALESCE(AVG(a.note),0) moyenne, COUNT(a.id) nb_avis FROM profils p LEFT JOIN avis a ON a.profil_id=p.id WHERE 1=1`;
    const params = [];
    if (metier){ sql += ' AND p.metier LIKE ?'; params.push(`%${metier}%`); }
    if (commune){ sql += ' AND p.commune LIKE ?'; params.push(`%${commune}%`); }
    sql += ' GROUP BY p.id ORDER BY FIELD(p.badge,"or","argent","bronze"), moyenne DESC, nb_avis DESC';
    const [r] = await pool.query(sql, params); res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/profils/:id', async (req,res) => {
  try {
    const [p] = await pool.query('SELECT * FROM profils WHERE id=?', [req.params.id]);
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query('SELECT id,note,commentaire,reponse,employeur_id,cree_le FROM avis WHERE profil_id=? ORDER BY cree_le DESC', [req.params.id]);
    res.json({ ...p[0], avis:a });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/public/profil/:id', async (req,res) => {
  try {
    const [p] = await pool.query('SELECT id,nom,metier,commune,description,contact,badge,vitrine_premium,preuve_url FROM profils WHERE id=?', [req.params.id]);
    if (!p.length) return res.status(404).json({ error:'Profil introuvable' });
    const [a] = await pool.query('SELECT note,commentaire,reponse FROM avis WHERE profil_id=? ORDER BY cree_le DESC', [req.params.id]);
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
    const [r] = await pool.query('INSERT INTO profils (nom,metier,commune,description,contact,consentement) VALUES (?,?,?,?,?,1)', [nom, metier||'—', commune||'—', description||'', contact||'—']);
    await pool.query('UPDATE comptes SET profil_id=? WHERE id=?', [r.insertId, req.compte.id]);
    res.json({ id: r.insertId });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/profils/:id/preuve', auth, async (req,res) => {
  if (req.compte.profil_id != req.params.id) return res.status(403).json({ error:'Non autorisé' });
  await pool.query('UPDATE profils SET preuve_url=? WHERE id=?', [req.body.preuve, req.params.id]);
  res.json({ ok:true });
});

app.put('/api/profils/:id/premium', auth, async (req,res) => {
  if (req.compte.profil_id != req.params.id) return res.status(403).json({ error:'Non autorisé' });
  await pool.query('UPDATE profils SET vitrine_premium=1 WHERE id=?', [req.params.id]);
  res.json({ ok:true });
});

/* ============ AVIS ============ */
app.post('/api/avis', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    if (!req.compte.employeur_id) return res.status(403).json({ error:'Vérifie ton profil employeur d\'abord' });
    const { profil_id, note, commentaire } = req.body;
    if (!profil_id || !note) return res.status(400).json({ error:'Champs manquants' });
    if (note < 1 || note > 5) return res.status(400).json({ error:'Note entre 1 et 5' });
    const [ex] = await pool.query('SELECT id FROM avis WHERE profil_id=? AND employeur_id=?', [profil_id, req.compte.employeur_id]);
    if (ex.length) return res.status(409).json({ error:'Tu as déjà noté ce profil' });
    await pool.query('INSERT INTO avis (profil_id,employeur_id,note,commentaire) VALUES (?,?,?,?)', [profil_id, req.compte.employeur_id, note, clean(commentaire)]);
    const [av] = await pool.query('SELECT note FROM avis WHERE profil_id=?', [profil_id]);
    const nv = computeEligible(av);
    const [p] = await pool.query('SELECT badge FROM profils WHERE id=?', [profil_id]);
    if (badgeRank(nv) > badgeRank(p[0].badge)) await pool.query('UPDATE profils SET badge=? WHERE id=?', [nv, profil_id]);
    // Notification au jeune
    const [pj] = await pool.query('SELECT c.id compte_id FROM comptes c WHERE c.profil_id=?', [profil_id]);
    if (pj.length) await notifier(pj[0].compte_id, 'avis', 'Nouvel avis reçu', `Tu as reçu ${note} étoile(s).`, '/jeune/profil');
    res.json({ ok:true, badge:nv, nb_avis:av.length });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.put('/api/avis/:id/reponse', auth, async (req,res) => {
  try {
    const [a] = await pool.query('SELECT profil_id FROM avis WHERE id=?', [req.params.id]);
    if (!a.length) return res.status(404).json({ error:'Avis introuvable' });
    if (req.compte.profil_id != a[0].profil_id) return res.status(403).json({ error:'Non autorisé' });
    await pool.query('UPDATE avis SET reponse=? WHERE id=?', [clean(req.body.reponse), req.params.id]);
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ============ EMPLOYEURS ============ */
app.post('/api/employeurs/verifier', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    const cat = req.compte.employeur_categorie || 'particulier';
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error:'Référence requise' });
    const empId = req.compte.employeur_id || ('emp-' + req.compte.id);
    await pool.query(`INSERT INTO employeurs (id,categorie,reference,verifie) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE categorie=VALUES(categorie), reference=VALUES(reference), verifie=1`, [empId, cat, reference]);
    await pool.query('UPDATE comptes SET employeur_id=? WHERE id=?', [empId, req.compte.id]);
    res.json({ ok:true, employeur_id: empId });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ============ MISSIONS ============ */
app.get('/api/missions', async (req,res) => {
  try {
    const { q, duree, commune } = req.query;
    let sql = 'SELECT * FROM missions WHERE statut="ouverte"';
    const p = [];
    if (q){ sql += ' AND (titre LIKE ? OR description LIKE ?)'; p.push(`%${q}%`,`%${q}%`); }
    if (duree){ sql += ' AND duree=?'; p.push(duree); }
    if (commune){ sql += ' AND commune LIKE ?'; p.push(`%${commune}%`); }
    sql += ' ORDER BY cree_le DESC LIMIT 60';
    const [r] = await pool.query(sql, p); res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/missions', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé aux employeurs' });
    if (!req.compte.employeur_id) return res.status(403).json({ error:'Vérifie ton profil employeur d\'abord' });
    const { titre, description, commune, budget, nombre_personnes, duree, type_contrat, contact } = req.body;
    if (!titre) return res.status(400).json({ error:'Titre requis' });
    const cat = req.compte.employeur_categorie || 'particulier';
    if (cat === 'particulier' && duree === 'longue') return res.status(403).json({ error:'Les particuliers ne peuvent publier que des missions courtes' });
    const [r] = await pool.query(`INSERT INTO missions (employeur_id,employeur_type,titre,description,commune,budget,nombre_personnes,duree,type_contrat,contact) VALUES (?,?,?,?,?,?,?,?,?,?)`, [req.compte.employeur_id, cat, titre, description||'', commune||'', budget||'', nombre_personnes||1, duree||'courte', type_contrat||'mission', contact||'']);
    res.json({ id: r.insertId });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/missions/:id/postuler', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune') return res.status(403).json({ error:'Réservé aux jeunes' });
    if (!req.compte.profil_id) return res.status(400).json({ error:'Crée ton profil jeune d\'abord' });
    const [m] = await pool.query('SELECT employeur_id FROM missions WHERE id=?', [req.params.id]);
    if (!m.length) return res.status(404).json({ error:'Mission introuvable' });
    const [d] = await pool.query('SELECT id FROM candidatures WHERE mission_id=? AND profil_id=?', [req.params.id, req.compte.profil_id]);
    if (d.length) return res.status(409).json({ error:'Tu as déjà postulé' });
    await pool.query('INSERT INTO candidatures (mission_id,profil_id,employeur_id) VALUES (?,?,?)', [req.params.id, req.compte.profil_id, m[0].employeur_id]);
    // Notifier l'employeur
    const [emp] = await pool.query('SELECT id FROM comptes WHERE employeur_id=?', [m[0].employeur_id]);
    if (emp.length) await notifier(emp[0].id, 'candidature', 'Nouvelle candidature', 'Un jeune a postulé à ton offre.', '/employeur/candidatures');
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/employeurs/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'employeur') return res.status(403).json({ error:'Réservé' });
    const empId = req.compte.employeur_id || ('emp-'+req.compte.id);
    const [r] = await pool.query(`SELECT c.*, m.titre mission_titre, p.nom profil_nom, p.metier profil_metier, p.commune profil_commune, p.contact profil_contact FROM candidatures c LEFT JOIN missions m ON m.id=c.mission_id LEFT JOIN profils p ON p.id=c.profil_id WHERE c.employeur_id=? ORDER BY c.cree_le DESC LIMIT 50`, [empId]);
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/jeune/candidatures', auth, async (req,res) => {
  try {
    if (req.compte.type !== 'jeune' || !req.compte.profil_id) return res.json([]);
    const [r] = await pool.query(`SELECT c.*, m.titre mission_titre, m.commune mission_commune, m.budget FROM candidatures c LEFT JOIN missions m ON m.id=c.mission_id WHERE c.profil_id=? ORDER BY c.cree_le DESC LIMIT 50`, [req.compte.profil_id]);
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ============ NOTIFICATIONS ============ */
app.get('/api/notifications', auth, async (req,res) => {
  try {
    const [r] = await pool.query('SELECT * FROM notifications WHERE compte_id=? ORDER BY cree_le DESC LIMIT 30', [req.compte.id]);
    res.json(r);
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/notifications/count', auth, async (req,res) => {
  try {
    const [r] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE compte_id=? AND lu=0', [req.compte.id]);
    res.json({ count: r[0].c });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

app.post('/api/notifications/marquer-vues', auth, async (req,res) => {
  await pool.query('UPDATE notifications SET lu=1 WHERE compte_id=?', [req.compte.id]);
  res.json({ ok:true });
});

/* ============ STATS ============ */
app.get('/api/stats', async (req,res) => {
  try {
    const [[a],[b],[c],[d],[e],[f]] = await Promise.all([
      pool.query('SELECT COUNT(*) total FROM profils'),
      pool.query('SELECT COUNT(*) total FROM avis'),
      pool.query('SELECT COUNT(*) total FROM missions WHERE statut="ouverte"'),
      pool.query('SELECT commune,COUNT(*) total FROM profils GROUP BY commune ORDER BY total DESC'),
      pool.query('SELECT metier,COUNT(*) total FROM profils GROUP BY metier ORDER BY total DESC'),
      pool.query('SELECT badge,COUNT(*) total FROM profils GROUP BY badge')
    ]);
    res.json({ total_profils:a[0].total, total_avis:b[0].total, total_missions:c[0].total, par_commune:d, par_metier:e, par_badge:f });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

/* ============ FRONT ============ */
app.use(express.static(path.join(__dirname,'public')));
app.get('*', (_,r) => r.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`✓ ZUA MOSALA en ligne sur le port ${PORT}`)));
