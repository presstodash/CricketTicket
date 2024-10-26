const express = require('express');
const { requiresAuth } = require('express-openid-connect');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const router = express.Router();
const qrcode = require('qrcode');
const axios = require('axios');

async function getAccessToken() {
    try {
        const response = await axios.post(`${process.env.AUTH0_ISSUER_BASE_URL}/oauth/token`, {
            client_id: process.env.AUTH0_CLIENT_ID,
            client_secret: process.env.AUTH0_CLIENT_SECRET,
            audience: process.env.AUTH0_AUDIENCE,
            grant_type: 'client_credentials'
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.message);
        throw new Error('Failed to obtain access token');
    }
}

async function checkAccessToken(req, res, next) {
    try {
        const accessToken = await getAccessToken();

        if (req.headers.authorization === `Bearer ${accessToken}`) {
            next();
        } else {
            return res.status(403).send({ error: 'Forbidden: Invalid or missing access token.' });
        }
    } catch (error) {
        console.error('Access token check failed:', error.message);
        return res.status(403).send('Forbidden: Access token is required to access this endpoint.');
    }
}

router.post('/api/tickets', checkAccessToken, async (req, res) => {
    const { vatin, firstName, lastName, movieId } = req.body;

    if (!vatin || !firstName || !lastName || !movieId) {
        return res.status(400).send({ error: "Missing required fields: 'vatin', 'firstName', 'lastName', or 'movieId'." });
    }

    try {
        const checkTickets = await pool.query(
            'SELECT COUNT(*) FROM tickets WHERE oib = $1',
            [vatin]
        );

        if (checkTickets.rows[0].count >= 3) {
            return res.status(400).send({ error: "Maximum tickets reached for this OIB" });
        }

        const ticketId = uuidv4();
        const createdAt = new Date();

        await pool.query(
            'INSERT INTO tickets (id, oib, first_name, last_name, movie_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [ticketId, vatin, firstName, lastName, movieId, createdAt]
        );

        const qrCodeUrl = await qrcode.toDataURL(`${req.protocol}://${req.get('host')}/tickets/${ticketId}`);

        res.status(201).json({
            ticketId: ticketId,
            qrCodeUrl: qrCodeUrl
        });
    } catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).send({ error: "Error creating ticket" });
    }
});

router.get('/buy-ticket/:movieId', requiresAuth(), async (req, res) => {
    const movieId = req.params.movieId;

    try {
        const movieResult = await pool.query('SELECT * FROM movies WHERE id = $1', [movieId]);
        const movie = movieResult.rows[0];

        if (!movie) {
            return res.status(404).send('Movie not found');
        }

        res.render('buy-ticket', { movie });
    } catch (err) {
        console.error('Error fetching movie:', err);
        res.status(500).send('Error fetching movie');
    }
});

router.post('/buy-ticket/:movieId', requiresAuth(), async (req, res) => {
    const { vatin, firstName, lastName } = req.body;
    const movieId = req.params.movieId;

    if (!vatin || !firstName || !lastName) {
        return res.status(400).send({ error: "Missing required fields" });
    }

    try {
        const checkTickets = await pool.query(
            'SELECT COUNT(*) FROM tickets WHERE oib = $1',
            [vatin]
        );

        if (checkTickets.rows[0].count >= 3) {
            return res.status(400).send({ error: "Maximum tickets reached for this OIB" });
        }

        const ticketId = uuidv4();
        const createdAt = new Date();

        await pool.query(
            'INSERT INTO tickets (id, oib, first_name, last_name, movie_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [ticketId, vatin, firstName, lastName, movieId, createdAt]
        );

        const qrCodeUrl = await qrcode.toDataURL(`${req.protocol}://${req.get('host')}/tickets/${ticketId}`);

        req.session.vatin = vatin;

        res.redirect('/tickets');
    } catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).send({ error: "Error creating ticket" });
    }
});

module.exports = router;
