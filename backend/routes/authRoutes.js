const express = require('express');
const router = express.Router();
const { register, login, me } = require('../controllers/authController');
const { proteger } = require('../middleware/auth');  // 👈 destructuramos

router.post('/register', register); // opcional para crear el primer usuario
router.post('/login', login);
router.get('/me', proteger, me);    // 👈 aquí usamos proteger

module.exports = router;
