const express = require('express');
const { requiresAuth } = require('express-openid-connect');
const pool = require('../db');
const qrcode = require('qrcode');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.get('/tickets', requiresAuth(), async (req, res) => {
    const vatin = res.locals.vatin;

    const currentIndex = parseInt(req.query.index) || 0;

    if (!vatin) {
        return res.status(400).send({ error: "VATIN (OIB) not found" });
    }

    try {
        const ticketsResult = await pool.query(
            'SELECT tickets.id, tickets.created_at, movies.title, movies.image_url FROM tickets ' +
            'JOIN movies ON tickets.movie_id = movies.id WHERE tickets.oib = $1 ORDER BY tickets.created_at DESC',
            [vatin]
        );
        const tickets = ticketsResult.rows;

        if (tickets.length === 0) {
            return res.status(404).send('No tickets found for this OIB');
        }

        const validIndex = Math.min(Math.max(currentIndex, 0), tickets.length - 1);
        const currentTicket = tickets[validIndex];
        const user = res.locals.user;
        const qrCodeUrl = await qrcode.toDataURL(`${req.protocol}://${req.get('host')}/ticket/${currentTicket.id}`);

        res.render('tickets-list', {
            ticket: currentTicket,
            qrCodeUrl,
            movieTitle: currentTicket.title,
            currentIndex: validIndex,
            totalTickets: tickets.length,
            user: user,
            vatin: vatin
        });
    } catch (err) {
        console.error('Error fetching tickets:', err);
        res.status(500).send('Error fetching tickets');
    }
});

router.get('/ticket/:ticketId', requiresAuth(), async (req, res) => {
    const ticketId = req.params.ticketId;

    try {
        const ticketResult = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
        const ticket = ticketResult.rows[0];

        if (!ticket) {
            return res.status(404).send('Ticket not found');
        }

        const movieResult = await pool.query('SELECT title, image_url FROM movies WHERE id = $1', [ticket.movie_id]);
        const movie = movieResult.rows[0];

        if (!movie) {
            return res.status(404).send('Movie not found');
        }

        const user = res.locals.user;
        const qrCodeUrl = await qrcode.toDataURL(movie.image_url);

        res.render('ticket-details', {
            ticket: ticket,
            qrCodeUrl: qrCodeUrl,
            movieTitle: movie.title,
            user: user,
            vatin: res.locals.vatin,
            oib: ticket.oib,
            firstName: ticket.first_name,
            lastName: ticket.last_name
        });
    } catch (err) {
        console.error('Error fetching ticket:', err);
        res.status(500).send('Error fetching ticket');
    }
});

module.exports = router;