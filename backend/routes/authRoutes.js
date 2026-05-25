const express = require('express');
const router  = express.Router();
const { register, login, refresh, logout, me } = require('../controllers/authController');
const { proteger } = require('../middleware/auth');

router.post('/register', register);
router.post('/login',    login);
router.post('/refresh',  refresh);   // usa la cookie, sin proteger (el token está expirado)
router.post('/logout',   logout);    // revoca el refresh token en BD
router.get('/me',        proteger, me);

module.exports = router;
