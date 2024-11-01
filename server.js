require('dotenv').config();

const express = require('express');
const { auth } = require('express-openid-connect');
const session = require('express-session')
const pgSession = require('connect-pg-simple')(session);
const path = require('path')
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'very-secret-randomly-generated-strong-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieParser());

const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.AUTH0_SECRET,
    baseURL: BASE_URL,
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
};

app.use(auth(config));

app.use((req, res, next) => {
    const token = req.cookies.vatinToken;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            res.locals.vatin = decoded.vatin;
        } catch (error) {
            console.error("Invalid VATIN token:", error);
            res.locals.vatin = null;
        }
    } else {
        res.locals.vatin = null;
    }

    res.locals.user = req.oidc && req.oidc.user;
    next();
});

const homeRoutes = require('./routes/home');
app.use('/', homeRoutes);

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.oidc.logout({ returnTo: BASE_URL });
});

const buyTicketRoutes = require('./routes/buy-ticket');
app.use('/', buyTicketRoutes);

const ticketsListRoutes = require('./routes/tickets-list');
app.use('/', ticketsListRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on ${BASE_URL}`);
});