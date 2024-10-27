const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');

router.get('/', async (req, res) => {
    try {
        const moviesResult = await pool.query('SELECT * FROM movies ORDER BY release_date');
        const movies = moviesResult.rows;

        const ticketsCountResult = await pool.query('SELECT COUNT(*) AS total_tickets FROM tickets');
        const totalTickets = ticketsCountResult.rows[0].total_tickets;

        const token = req.cookies ? req.cookies.vatinToken : null;
        
        let vatin = null;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const vatin = decoded.vatin;
        }

        const user = req.oidc ? req.oidc.user : null;

        let movieIndex = parseInt(req.query.index) || 0;

        if (movieIndex < 0) {
            movieIndex = 0;
        } else if (movieIndex >= movies.length) {
            movieIndex = movies.length - 1;
        }

        const currentMovie = movies[movieIndex];

        res.render('home', {
            movie: currentMovie,
            currentIndex: movieIndex,
            totalMovies: movies.length,
            totalTickets: totalTickets,
            user: user,
            vatin: vatin
        });

    } catch (err) {
        console.error('Error fetching movies', err);
        res.status(500).send('Error fetching movies');
    }
});

module.exports = router;
